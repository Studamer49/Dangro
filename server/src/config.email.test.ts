import { describe, expect, it, vi } from "vitest";
import type { config as ConfigType } from "./config.js";

/**
 * The email configuration block.
 *
 * `config.ts` reads the environment once at import time, so each case resets
 * the module registry and re-imports with its own values — the same technique
 * `config.test.ts` uses for the media provider.
 */

async function loadConfig(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    vi.resetModules();
    const module = await import("./config.js");
    return module.config as typeof ConfigType;
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

const BASE = { NODE_ENV: "test", JWT_SECRET: "x".repeat(40) } as const;

/** Every variable the block reads, so one case cannot leak into the next. */
const CLEARED = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "EMAIL_FROM",
  "EMAIL_FROM_NAME",
  "EMAIL_TRANSPORT",
  "EMAIL_TIMEOUT_MS",
  "APP_BASE_URL",
  "CLIENT_URL",
  "EMAIL_VERIFICATION_TOKEN_TTL_MINUTES",
  "PASSWORD_RESET_TOKEN_TTL_MINUTES",
  "EMAIL_VERIFY_RATE_LIMIT",
  "EMAIL_RESEND_RATE_LIMIT",
] as const;

function cleared(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...BASE };
  for (const key of CLEARED) env[key] = undefined;
  return { ...env, ...extra };
}

const SMTP = {
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "mailer@example.com",
  SMTP_PASS: "not-a-real-secret",
} as const;

describe("email configuration", () => {
  it("is not configured when nothing is set, and names what is missing", async () => {
    const config = await loadConfig(cleared());
    expect(config.email.configured).toBe(false);
    expect(config.email.missingVars).toContain("SMTP_HOST");
    expect(config.email.missingVars).toContain("EMAIL_FROM");
  });

  it("is configured once a host and a sender exist", async () => {
    const config = await loadConfig(cleared({ ...SMTP }));
    expect(config.email.configured).toBe(true);
    expect(config.email.missingVars).toEqual([]);
  });

  it("defaults the sender address to the mailbox credentials", async () => {
    // Nearly every provider authenticates with, and accepts mail from, the
    // same address — so making EMAIL_FROM a third thing to configure is a
    // setup step that can only fail.
    const config = await loadConfig(cleared({ ...SMTP }));
    expect(config.email.from).toBe("mailer@example.com");
  });

  it("uses a configurable sender name, defaulting to Dangro", async () => {
    expect((await loadConfig(cleared({ ...SMTP }))).email.fromName).toBe("Dangro");
    expect(
      (await loadConfig(cleared({ ...SMTP, EMAIL_FROM_NAME: "Dangro (beta)" }))).email.fromName
    ).toBe("Dangro (beta)");
  });

  it("defaults to STARTTLS on 587 and implicit TLS on 465", async () => {
    expect((await loadConfig(cleared({ ...SMTP }))).email.secure).toBe(false);
    expect((await loadConfig(cleared({ ...SMTP, SMTP_PORT: "465" }))).email.secure).toBe(true);
  });

  it("allows secure to be forced on", async () => {
    const config = await loadConfig(cleared({ ...SMTP, SMTP_SECURE: "true" }));
    expect(config.email.secure).toBe(true);
  });

  it("supports an unauthenticated relay, for local testing", async () => {
    const config = await loadConfig(
      cleared({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1025", EMAIL_FROM: "dangro@localhost.test" })
    );
    expect(config.email.configured).toBe(true);
    expect(config.email.user).toBe("");
  });

  it("refuses half a credential pair rather than sending it", async () => {
    await expect(
      loadConfig(cleared({ SMTP_HOST: "smtp.example.com", SMTP_USER: "mailer@example.com" }))
    ).rejects.toThrow(/SMTP_USER is set but SMTP_PASS is not/i);

    await expect(
      loadConfig(cleared({ SMTP_HOST: "smtp.example.com", SMTP_PASS: "x" }))
    ).rejects.toThrow(/SMTP_PASS is set but SMTP_USER is not/i);
  });

  it("falls back to 587 when the port is not a number", async () => {
    expect((await loadConfig(cleared({ ...SMTP, SMTP_PORT: "not-a-port" }))).email.port).toBe(587);
  });

  it("defaults the verification link to 30 minutes", async () => {
    expect((await loadConfig(cleared({ ...SMTP }))).emailVerification.tokenTtlMinutes).toBe(30);
    expect(
      (await loadConfig(cleared({ ...SMTP, EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: "60" }))).emailVerification
        .tokenTtlMinutes
    ).toBe(60);
  });

  it("never accepts a token window shorter than five minutes", async () => {
    // A one-minute window would fail for anyone whose mail client took longer
    // to open the message, which is most of them.
    const config = await loadConfig(cleared({ ...SMTP, EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: "1" }));
    expect(config.emailVerification.tokenTtlMinutes).toBe(30);
  });

  it("keeps the verification window and the reset window independent", async () => {
    const config = await loadConfig(
      cleared({ ...SMTP, EMAIL_VERIFICATION_TOKEN_TTL_MINUTES: "15", PASSWORD_RESET_TOKEN_TTL_MINUTES: "60" })
    );
    expect(config.emailVerification.tokenTtlMinutes).toBe(15);
    expect(config.emailVerification.resetTokenTtlMinutes).toBe(60);
  });
});

describe("EMAIL_TRANSPORT", () => {
  it("is smtp by default", async () => {
    expect((await loadConfig(cleared({ ...SMTP }))).email.transport).toBe("smtp");
  });

  it("json needs no mail server at all", async () => {
    // The whole point of the mode: the app runs, the UI works, nothing is sent.
    const config = await loadConfig(cleared({ EMAIL_TRANSPORT: "json" }));
    expect(config.email.transport).toBe("json");
    expect(config.email.configured).toBe(true);
  });

  it("refuses an unknown transport instead of guessing", async () => {
    await expect(loadConfig(cleared({ EMAIL_TRANSPORT: "carrier-pigeon" }))).rejects.toThrow(
      /EMAIL_TRANSPORT must be/i
    );
  });
});

describe("APP_BASE_URL", () => {
  it("is what the links in every email are built from", async () => {
    const config = await loadConfig(cleared({ ...SMTP, APP_BASE_URL: "https://dangro.example.com" }));
    expect(config.appBaseUrl).toBe("https://dangro.example.com");
  });

  it("keeps a sub-path deployment working", async () => {
    const config = await loadConfig(cleared({ ...SMTP, APP_BASE_URL: "https://example.com/dangro/" }));
    expect(config.appBaseUrl).toBe("https://example.com/dangro");
  });

  it("falls back to CLIENT_URL, which is right for both deploy layouts", async () => {
    const config = await loadConfig(
      cleared({ ...SMTP, CLIENT_URL: "https://dangro.onrender.com,http://localhost:5173" })
    );
    expect(config.appBaseUrl).toBe("https://dangro.onrender.com");
  });

  it("refuses a value that is not a URL", async () => {
    await expect(loadConfig(cleared({ APP_BASE_URL: "dangro.example.com" }))).rejects.toThrow(
      /APP_BASE_URL is not a valid URL/i
    );
  });

  it("refuses a scheme that is not http(s)", async () => {
    await expect(loadConfig(cleared({ APP_BASE_URL: "javascript:alert(1)" }))).rejects.toThrow(
      /APP_BASE_URL must use http/i
    );
  });

  it("refuses credentials embedded in the URL", async () => {
    // They would end up in the From-domain checks and in every link.
    await expect(loadConfig(cleared({ APP_BASE_URL: "https://u:p@example.com" }))).rejects.toThrow(
      /must not contain credentials/i
    );
  });
});