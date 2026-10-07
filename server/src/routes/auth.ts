import { Router, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { AppError, asyncHandler, ok, parseOrThrow } from "../lib/http.js";

const router = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^\S+$/, "Username cannot contain spaces"),
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

const userSelect = {
  id: true,
  username: true,
  email: true,
  bio: true,
  avatar: true,
  status: true,
  lastSeen: true,
  createdAt: true,
  updatedAt: true,
} as const;

function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ userId }, config.jwtRefreshSecret, { expiresIn: "7d" });
  return { accessToken, refreshToken };
}

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(registerSchema, req.body);
    const username = input.username;
    const email = input.email.trim().toLowerCase();

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { email: { equals: email, mode: "insensitive" } },
          { username: { equals: username, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      throw AppError.of("CONFLICT", "An account with this email or username already exists");
    }

    const hashedPassword = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: { username, email, password: hashedPassword },
      select: userSelect,
    });

    const { accessToken, refreshToken } = generateTokens(user.id);
    setRefreshCookie(res, refreshToken);

    ok(res, { user, accessToken }, 201);
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = parseOrThrow(loginSchema, req.body);
    const email = input.email.trim();

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });

    if (!user) throw AppError.of("UNAUTHORIZED", "Invalid email or password");

    const isPasswordValid = await bcrypt.compare(input.password, user.password);
    if (!isPasswordValid) throw AppError.of("UNAUTHORIZED", "Invalid email or password");

    const { accessToken, refreshToken } = generateTokens(user.id);
    setRefreshCookie(res, refreshToken);

    const { password: _password, ...safe } = user;
    ok(res, { user: safe, accessToken });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) throw AppError.of("UNAUTHORIZED", "No refresh token");

    let decoded: { userId?: string };
    try {
      decoded = jwt.verify(refreshToken, config.jwtRefreshSecret) as { userId?: string };
    } catch {
      throw AppError.of("UNAUTHORIZED", "Invalid refresh token");
    }
    if (!decoded.userId) throw AppError.of("UNAUTHORIZED", "Invalid refresh token");

    const user = await prisma.user.findUnique({ where: { id: decoded.userId }, select: { id: true } });
    if (!user) throw AppError.of("UNAUTHORIZED", "Invalid refresh token");

    const tokens = generateTokens(user.id);
    setRefreshCookie(res, tokens.refreshToken);

    ok(res, { accessToken: tokens.accessToken });
  })
);

router.get(
  "/me",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: requireUser(req) },
      select: userSelect,
    });

    if (!user) throw AppError.of("NOT_FOUND", "User not found");

    ok(res, { user });
  })
);

router.post("/logout", (_req, res) => {
  res.clearCookie("refreshToken");
  ok(res, { message: "Logged out" });
});

export default router;
