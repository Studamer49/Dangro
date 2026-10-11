import { describe, expect, it } from "vitest";
import { mediaUrl, isSafeMediaUrl } from "./urls.js";

/**
 * The shape the uploader actually returns must survive the new validation.
 *
 * `routes/uploads.ts` hands back `/uploads/<uuid>.<ext>` for all three media
 * stores, and the client posts that value straight back on stories, posts, DM
 * attachments and avatars. If the validator rejected it, every upload in the
 * app would break.
 */
const UPLOAD_SHAPES = [
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.png",
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.jpg",
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.mp4",
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.mp3",
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.webm",
];

describe("uploader output passes validation", () => {
  it.each(UPLOAD_SHAPES)("accepts %s", (url) => {
    expect(mediaUrl().safeParse(url).success).toBe(true);
  });

  it("accepts the remote media host shape the redirect store produces", () => {
    expect(isSafeMediaUrl("https://media.example.com/media/file.png")).toBe(true);
  });
});
