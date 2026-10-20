import { describe, expect, it } from "vitest";
import {
  generateSecureToken,
  hashToken,
  humanizeWindow,
  maskEmail,
  normalizeEmail,
  passwordResetUrl,
  renderEmailChangeAlertEmail,
  renderPasswordResetEmail,
  renderVerificationEmail,
  verificationUrl,
} from "./emailVerification.js";

/**
 * The rules that decide what an emailed link can do.
 *
 * These are pure, which is the point: everything that is not "talk to the
 * database" or "talk to the mail server" lives here and can be asserted
 * without either.
 */

describe("generateSecureToken", () => {
  it("produces a 43-character base64url string (32 bytes)", () => {
    const token = generateSecureToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSecureToken()));
    expect(tokens.size).toBe(500);
  });

  it("contains no character that needs URL escaping", () => {
    // The token goes in a query string. If it ever contained `&`, `=` or `/`,
    // a pasted link could be truncated or split at the wrong place.
    for (let i = 0; i < 50; i += 1) {
      expect(generateSecureToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("hashToken", () => {
  it("is deterministic, so a token can be found again by its hash", () => {
    const token = generateSecureToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("is 64 hex characters — SHA-256", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never returns the token itself", () => {
    const token = generateSecureToken();
    expect(hashToken(token)).not.toBe(token);
    expect(hashToken(token)).not.toContain(token);
  });

  it("separates tokens that differ by a single character", () => {
    const a = generateSecureToken();
    const b = `${a.slice(0, -1)}${a.slice(-1) === "A" ? "B" : "A"}`;
    expect(hashToken(a)).not.toBe(hashToken(b));
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases, so one mailbox cannot be registered twice", () => {
    expect(normalizeEmail("  Bob@Example.COM \n")).toBe("bob@example.com");
  });

  it("leaves a Gmail dot-plus tag alone", () => {
    // Provider-specific aliasing is not something to guess at: getting it wrong
    // silently merges two real mailboxes into one account.
    expect(normalizeEmail("b.o.b+chat@gmail.com")).toBe("b.o.b+chat@gmail.com");
  });
});

describe("maskEmail", () => {
  it("keeps the domain and a hint of the local part", () => {
    expect(maskEmail("bob@example.com")).toBe("b***@example.com");
    expect(maskEmail("alice@example.com")).toBe("al***@example.com");
  });

  it("never reveals the whole local part", () => {
    const masked = maskEmail("alice@example.com");
    expect(masked).not.toContain("alice");
    expect(masked.endsWith("@example.com")).toBe(true);
  });

  it("never reveals a short local part at all", () => {
    expect(maskEmail("a@example.com")).toBe("***@example.com");
    expect(maskEmail("ab@example.com")).toBe("***@example.com");
  });

  it("does not throw on something that is not an address", () => {
    expect(maskEmail("not-an-address")).toBe("***");
  });

  it("normalises before masking, so case cannot leak through", () => {
    expect(maskEmail(" BO@Example.com ")).toBe(maskEmail("bo@example.com"));
  });
});

describe("links", () => {
  const base = "https://dangro.example.com";

  it("puts the token in the query string, URL-encoded", () => {
    const url = new URL(verificationUrl(base, "abc-_123"));
    expect(url.origin + url.pathname).toBe(`${base}/verify-email`);
    expect(url.searchParams.get("token")).toBe("abc-_123");
    expect(url.hash).toBe("");
  });

  it("never carries anything else — no password, no redirect target", () => {
    const url = new URL(verificationUrl(base, "t"));
    expect([...url.searchParams.keys()]).toEqual(["token"]);
  });

  it("builds the reset link from the configured origin, not localhost", () => {
    expect(passwordResetUrl("https://dangro.example.com", "t")).toBe(
      "https://dangro.example.com/reset-password?token=t"
    );
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    expect(verificationUrl("https://dangro.example.com/", "t")).toBe(
      "https://dangro.example.com/verify-email?token=t"
    );
  });
});

describe("renderVerificationEmail", () => {
  const url = "https://dangro.example.com/verify-email?token=abc";

  it("offers a prominent Verify Email button pointing at the link", () => {
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 30 });
    expect(mail.html).toContain(`href="${url}"`);
    expect(mail.html).toContain("Verify Email");
    expect(mail.subject).toMatch(/verify/i);
  });

  it("ships a plain-text alternative containing the same link", () => {
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 30 });
    expect(mail.text).toContain(url);
    expect(mail.text).toContain("bob");
  });

  it("is a multipart message, not HTML-only", () => {
    // Both parts must be present or a text-mode client sees nothing useful.
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 30 });
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.html.length).toBeGreaterThan(0);
  });

  it("states why verification is required and how long the link lasts", () => {
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 30 });
    expect(mail.text).toMatch(/not verified yet|finish setting up/i);
    expect(mail.text).toContain("30 minutes");
  });

  it("never rounds the window up — 30 minutes is not '1 hour'", () => {
    // Rounding up tells someone the link is good for twice as long as it is.
    expect(humanizeWindow(30)).toBe("30 minutes");
    expect(humanizeWindow(45)).toBe("45 minutes");
    expect(humanizeWindow(60)).toBe("1 hour");
    expect(humanizeWindow(120)).toBe("2 hours");
    expect(humanizeWindow(1)).toBe("1 minute");
  });

  it("tells a non-owner they can ignore it", () => {
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 30 });
    expect(mail.text).toMatch(/didn't create a Dangro account/i);
  });

  it("reads the window in hours once it is over 60 minutes", () => {
    const mail = renderVerificationEmail({ username: "bob", url, ttlMinutes: 120 });
    expect(mail.text).toContain("2 hours");
  });

  it("escapes the username instead of injecting it into the markup", () => {
    const mail = renderVerificationEmail({
      username: '<img src=x onerror="alert(1)">',
      url,
      ttlMinutes: 30,
    });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });

  it("escapes the URL, which is attacker-influenced through APP_BASE_URL", () => {
    const mail = renderVerificationEmail({
      username: "bob",
      url: 'https://x.example/"><script>alert(1)</script>',
      ttlMinutes: 30,
    });
    expect(mail.html).not.toContain("<script>");
  });
});

describe("renderPasswordResetEmail", () => {
  it("offers a reset button and warns about unsolicited requests", () => {
    const mail = renderPasswordResetEmail({
      username: "bob",
      url: "https://dangro.example.com/reset-password?token=abc",
      ttlMinutes: 30,
    });
    expect(mail.html).toContain("Reset Password");
    expect(mail.text).toMatch(/if you did not ask for this/i);
    expect(mail.text).toContain("https://dangro.example.com/reset-password?token=abc");
  });
});

describe("renderEmailChangeAlertEmail", () => {
  const input = {
    username: "bob",
    newAddress: "attacker@example.com",
    baseUrl: "https://dangro.example.com",
  };

  it("names the address the account moved to", () => {
    expect(renderEmailChangeAlertEmail(input).text).toContain("attacker@example.com");
  });

  it("says the password did not change", () => {
    // The whole reason to send this mail: the owner should not panic-logout.
    expect(renderEmailChangeAlertEmail(input).text).toMatch(/password was NOT changed/i);
  });

  it("does not offer a password-reset link", () => {
    // Reset links now go to the NEW address, which the reader of this mail
    // does not control. A button promising recovery would be a lie.
    const mail = renderEmailChangeAlertEmail(input);
    expect(mail.html).not.toContain("reset-password");
    expect(mail.text).not.toContain("reset-password");
    expect(mail.text).toContain("https://dangro.example.com/login");
  });

  it("does not double the slash when the base URL has a trailing one", () => {
    expect(renderEmailChangeAlertEmail({ ...input, baseUrl: "https://dangro.example.com/" }).text).toContain(
      "https://dangro.example.com/login"
    );
  });
});