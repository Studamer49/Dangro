import { describe, expect, it } from "vitest";
import { isSafeMediaUrl, mediaUrl } from "./urls.js";

/**
 * Regression tests for user-supplied media URLs.
 *
 * The bug this covers: every media-bearing field (avatar, story/post media, DM
 * attachment, server icon) was validated with `.max(500)` only, and the server
 * icon with `z.string().url()`. Neither rejects a scheme — `new URL("javascript:
 * alert(1)")` parses fine — so a user could store a `javascript:` URL in their
 * avatar and have it served to every other user who loaded their profile,
 * where the client renders it as `<img src>` / `<a href>`.
 */

describe("isSafeMediaUrl", () => {
  it("accepts the uploader's own output", () => {
    expect(isSafeMediaUrl("/uploads/3f2a1b4c-1111-2222-3333-444455556666.png")).toBe(true);
    expect(isSafeMediaUrl("/uploads/a.mp4")).toBe(true);
  });

  it("accepts absolute http(s) URLs", () => {
    expect(isSafeMediaUrl("https://media.example.com/a.png")).toBe(true);
    expect(isSafeMediaUrl("http://media.example.com/a.png")).toBe(true);
    expect(isSafeMediaUrl("https://media.example.com:8443/a.png")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeMediaUrl("  javascript:alert(document.domain)  ")).toBe(false);
  });

  it("rejects data: URLs, which can carry markup", () => {
    expect(isSafeMediaUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeMediaUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  it("rejects the other dangerous schemes", () => {
    expect(isSafeMediaUrl("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeMediaUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects a scheme smuggled past a naive check with a control character", () => {
    expect(isSafeMediaUrl(`java${String.fromCharCode(9)}script:alert(1)`)).toBe(false);
    expect(isSafeMediaUrl(`java${String.fromCharCode(10)}script:alert(1)`)).toBe(false);
    expect(isSafeMediaUrl(`java${String.fromCharCode(0)}script:alert(1)`)).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeMediaUrl("//evil.example/a.png")).toBe(false);
  });

  it("rejects empty and unparseable values", () => {
    expect(isSafeMediaUrl("")).toBe(false);
    expect(isSafeMediaUrl("   ")).toBe(false);
    expect(isSafeMediaUrl("not a url")).toBe(false);
    expect(isSafeMediaUrl("/")).toBe(true);
  });
});

describe("mediaUrl schema", () => {
  it("trims before validating and before storing", () => {
    const parsed = mediaUrl().parse("  /uploads/a.png  ");
    expect(parsed).toBe("/uploads/a.png");
  });

  it("surfaces a validation error for a rejected URL", () => {
    const result = mediaUrl().safeParse("javascript:alert(1)");
    expect(result.success).toBe(false);
  });

  it("still enforces the length limit", () => {
    expect(mediaUrl(10).safeParse("/uploads/a-very-long-name.png").success).toBe(false);
  });
});
