import { prisma } from "../prisma.js";
import { destroyImage, isCloudinaryConfigured, publicIdFromUrl } from "./cloudinary.js";

/**
 * Whether an uploaded asset is still pointed at from anywhere in the database.
 *
 * An upload is remembered only by the URL it was given, and that URL can
 * legitimately be reused — the same link pasted as both a profile picture and
 * a banner, for instance. Deleting the asset as soon as the first row moves on
 * would blank the second one, which is the kind of "it worked, then the banner
 * vanished" report this guards against. Every column a media URL can live in
 * is checked before we remove anything.
 *
 * Direct-message attachments keep Cloudinary's public ID in addition to the
 * URL, so that is checked as well when one is supplied.
 */
export async function isMediaUrlReferenced(
  url: string | null | undefined,
  publicId?: string | null
): Promise<boolean> {
  const [user, server, messageAttachment, postMedia, story, dmByUrl, dmByPublicId] = await Promise.all([
    url
      ? prisma.user.findFirst({ where: { OR: [{ avatar: url }, { cover: url }] }, select: { id: true } })
      : Promise.resolve(null),
    url
      ? prisma.server.findFirst({ where: { OR: [{ icon: url }, { banner: url }] }, select: { id: true } })
      : Promise.resolve(null),
    url ? prisma.attachment.findFirst({ where: { url }, select: { id: true } }) : Promise.resolve(null),
    url ? prisma.postMedia.findFirst({ where: { url }, select: { id: true } }) : Promise.resolve(null),
    url ? prisma.story.findFirst({ where: { mediaUrl: url }, select: { id: true } }) : Promise.resolve(null),
    url
      ? prisma.directMessage.findFirst({ where: { attachmentUrl: url }, select: { id: true } })
      : Promise.resolve(null),
    publicId
      ? prisma.directMessage.findFirst({ where: { attachmentPublicId: publicId }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return Boolean(user || server || messageAttachment || postMedia || story || dmByUrl || dmByPublicId);
}

/**
 * Removes the Cloudinary asset behind a stored delivery URL, but only once
 * nothing references it any more. Best effort: never throws, because by the
 * time this runs the database write has already succeeded and reporting a
 * failure would misdescribe a successful save.
 */
export async function destroyUnreferencedImage(
  url: string | null | undefined,
  context: string
): Promise<void> {
  try {
    if (!isCloudinaryConfigured()) return;

    const publicId = publicIdFromUrl(url);
    if (!publicId) return; // not one of ours: a /uploads path or an external link

    if (await isMediaUrlReferenced(url, publicId)) return;

    await destroyImage(publicId);
  } catch (err) {
    console.error(
      `[media] Could not remove the Cloudinary asset replaced by ${context}:`,
      err instanceof Error ? err.message : String(err)
    );
  }
}
