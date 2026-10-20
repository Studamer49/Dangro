import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow, isDuplicateKeyError } from "../lib/http.js";
import { paramId } from "../lib/access.js";
import { nullableMediaUrl } from "../lib/urls.js";
import { destroyImageForUrl } from "../lib/cloudinary.js";
import { assertEmailConfigured, MailDeliveryError, sendMail } from "../lib/mailer.js";
import {
  maskEmail,
  normalizeEmail,
  renderEmailChangeAlertEmail,
} from "../lib/emailVerification.js";
import {
  bumpSessionVersion,
  clearVerificationToken,
  sendVerificationEmail,
} from "../lib/accountSecurity.js";
import { config } from "../config.js";

const router = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(32).regex(/^\S+$/, "Username cannot contain spaces").optional(),
  // Trimmed before validation, for the same reason as on signup.
  email: z.string().trim().email().max(254).optional(),
  bio: z.string().max(500).optional(),
  avatar: nullableMediaUrl(),
  cover: nullableMediaUrl(),
  status: z.enum(["online", "idle", "dnd", "offline"]).optional(),
  isPrivate: z.boolean().optional(),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
});

const publicUserSelect = {
  id: true,
  username: true,
  avatar: true,
  cover: true,
  bio: true,
  status: true,
  isPrivate: true,
} as const;

/** The signed-in user's own record, including their verification state. */
const profileSelect = {
  id: true,
  username: true,
  email: true,
  bio: true,
  avatar: true,
  cover: true,
  isPrivate: true,
  status: true,
  lastSeen: true,
  emailVerified: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

router.get(
  "/search",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const { q } = parseOrThrow(searchQuerySchema, req.query);
    const userId = requireUser(req);

    if (!q || q.length < 2) {
      ok(res, { users: [] });
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: [
          { username: { contains: q, mode: "insensitive" } },
          { bio: { contains: q, mode: "insensitive" } },
        ],
      },
      select: publicUserSelect,
      take: 20,
    });

    ok(res, { users });
  })
);

router.get(
  "/:id",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const id = paramId(req.params.id, "user id");

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        bio: true,
        avatar: true,
        cover: true,
        isPrivate: true,
        status: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    ok(res, { user });
  })
);

router.patch(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const input = parseOrThrow(updateProfileSchema, req.body);

    if (Object.keys(input).length === 0) {
      throw AppError.of("BAD_REQUEST", "Nothing to update");
    }

    // One read up front: the address-change path needs the previous address to
    // roll back to, and the uniqueness checks below need the caller's own row
    // to compare against.
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, emailVerified: true, emailVerifiedAt: true },
    });

    const data: Record<string, string | null | boolean> = {};

    // Everything an address change has to be able to undo if the confirmation
    // email cannot be delivered. Captured before the write below.
    let emailChanged = false;
    let previousAddress = "";
    let previousVerification: { emailVerified: boolean | null; emailVerifiedAt: Date | null } = {
      emailVerified: null,
      emailVerifiedAt: null,
    };

    if (!currentUser) throw AppError.of("NOT_FOUND", "User not found");

    if (input.username !== undefined) {
      const existing = await prisma.user.findFirst({
        where: { username: { equals: input.username, mode: "insensitive" }, id: { not: userId } },
        select: { id: true },
      });
      if (existing) throw AppError.of("CONFLICT", "Username already taken");
      data.username = input.username;
    }

    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (email !== currentUser.email) {
        const existing = await prisma.user.findFirst({
          where: { email: { equals: email, mode: "insensitive" }, id: { not: userId } },
          select: { id: true },
        });
        if (existing) throw AppError.of("CONFLICT", "Email already in use");

        // Refuse before writing, so a missing mail server can never leave an
        // account sitting on an address nobody can be verified at.
        assertEmailConfigured();

        emailChanged = true;
        previousAddress = currentUser.email;
        // Restore the REAL previous values on rollback. Writing a bare `null`
        // here would read as "legacy account, trusted" — so a failed change
        // would silently upgrade an unverified account to a verified one.
        previousVerification = {
          emailVerified: currentUser.emailVerified ?? null,
          emailVerifiedAt: currentUser.emailVerifiedAt ?? null,
        };
        data.email = email;
        // A new address is unproven until it is confirmed from inside the new
        // inbox. Carrying the old `true` over would let anyone who can receive
        // mail at an address they just claimed hold a verified account.
        data.emailVerified = false;
        data.emailVerifiedAt = null;
      }
    }

    if (input.bio !== undefined) data.bio = input.bio;
    if (input.avatar !== undefined) data.avatar = input.avatar ?? null;
    if (input.cover !== undefined) data.cover = input.cover ?? null;
    if (input.status !== undefined) data.status = input.status;
    if (input.isPrivate !== undefined) data.isPrivate = input.isPrivate;

    // Read the outgoing avatar before the write, because nothing but this
    // route knows which asset the row used to point at. Without it a replaced
    // profile picture stays in the Cloudinary media library forever.
    const replacedAvatar =
      input.avatar !== undefined && input.avatar !== null
        ? ((await prisma.user.findUnique({
            where: { id: userId },
            select: { avatar: true },
          }))?.avatar ?? null)
        : null;

    // Same reasoning as the avatar: a replaced banner should not linger.
    const replacedCover =
      input.cover !== undefined && input.cover !== null
        ? ((await prisma.user.findUnique({
            where: { id: userId },
            select: { cover: true },
          }))?.cover ?? null)
        : null;

    let user;
    try {
      user = await prisma.user.update({
        where: { id: userId },
        data,
        select: profileSelect,
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw AppError.of("CONFLICT", "Email already in use");
      }
      throw err;
    }

    if (emailChanged) {
      try {
        // The link proving control of the NEW address...
        await sendVerificationEmail(user);
        // ...and a warning to the OLD one, so whoever actually owns it learns
        // the account was moved out from under them. Deliberately not a
        // reset link: those now go to the new address.
        const alert = renderEmailChangeAlertEmail({
          username: user.username,
          newAddress: user.email,
          baseUrl: config.appBaseUrl,
        });
        await sendMail({ to: previousAddress, ...alert });
        // A changed address retires every existing token, so a stolen session
        // does not survive the account moving.
        await bumpSessionVersion(userId);
      } catch (err) {
        // Undo the whole change. Leaving the account on an address that has
        // no verification link is the one outcome worse than refusing.
        await prisma.user
          .update({
            where: { id: userId },
            data: {
              email: previousAddress,
              emailVerified: previousVerification.emailVerified,
              emailVerifiedAt: previousVerification.emailVerifiedAt,
            },
          })
          .catch(() => undefined);
        await clearVerificationToken(userId).catch(() => undefined);

        throw err instanceof AppError
          ? err
          : AppError.of(
              "UPSTREAM_ERROR",
              `The address was not changed because the confirmation email could not be sent: ${
                err instanceof MailDeliveryError ? err.reason : "delivery failed"
              }.`
            );
      }
    }

    // After the save, and only if it really changed. Never throws: the
    // profile update has already succeeded.
    if (replacedAvatar && replacedAvatar !== user.avatar) {
      await destroyImageForUrl(replacedAvatar, `the avatar of ${userId}`);
    }
    if (replacedCover && replacedCover !== user.cover) {
      await destroyImageForUrl(replacedCover, `the cover of ${userId}`);
    }

    ok(res, {
      user,
      // The client must not leave the user thinking they are verified: the
      // backend has to see the click first.
      verificationRequired: emailChanged,
      ...(emailChanged ? { email: maskEmail(user.email) } : {}),
    });
  })
);

export default router;
