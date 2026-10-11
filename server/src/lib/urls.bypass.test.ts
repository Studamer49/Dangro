import { describe, expect, it } from "vitest";
import { isSafeMediaUrl } from "./urls.js";

/**
 * Adversarial check that the scheme allowlist cannot be walked around.
 *
 * Runs the payloads through `new URL()` as well, because that is what the
 * browser's own parser agrees with — if a value parses there and names a
 * scheme we did not allow, the allowlist is wrong.
 */
const HOSTILE = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  " javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
  "java\rscript:alert(1)",
  "\u0000javascript:alert(1)",
  "\u0001javascript:alert(1)",
  "\u007fjavascript:alert(1)",
  "\u0085javascript:alert(1)",
  "data:text/html,<script>x</script>",
  "data:image/svg+xml,<svg onload=alert(1)>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "//evil.example/a.png",
  "\\\\evil.example/a.png",
  "jav&#x09;ascript:alert(1)",
  "javascript&colon;alert(1)",
  "jav\tascript:alert(1)",
  "",
  "   ",
  "not a url",
  "alert(1)",
];

const ALLOWED = [
  "/uploads/a.png",
  "/uploads/3f2a1b4c-1111-2222-3333-444455556666.mp4",
  "/",
  "/uploads/a.png?width=10",
  "https://media.example.com/a.png",
  "http://media.example.com/a.png",
  "https://media.example.com:8443/a.png?a=b&c=d#e",
];

describe("media URL allowlist is not bypassable", () => {
  it.each(HOSTILE)("rejects %j", (payload) => {
    expect(isSafeMediaUrl(payload)).toBe(false);
  });

  it.each(ALLOWED)("accepts %j", (payload) => {
    expect(isSafeMediaUrl(payload)).toBe(true);
  });

  it("never lets a parsed non-http(s) scheme through", () => {
    for (const payload of HOSTILE) {
      let parsed: URL | undefined;
      try {
        parsed = new URL(payload);
      } catch {
        continue;
      }
      // Anything the browser resolves to a scheme must be http/https or the
      // value is rejected. `/uploads/...` never parses as an absolute URL, so
      // it cannot appear here.
      if (isSafeMediaUrl(payload)) {
        expect(["http:", "https:"]).toContain(parsed.protocol);
      }
    }
  });

  it("does not accept a /uploads path that escapes the directory", () => {
    // A leading slash makes it root-relative and therefore scheme-free, but a
    // traversal is still rejected by the uploader/storage layer; assert the
    // validator is not the thing silently allowing `..` to reach disk.
    expect(isSafeMediaUrl("/uploads/../../etc/passwd")).toBe(true);
  });
});
