import { describe, expect, it, vi } from "vitest";
import type { config as ConfigType } from "../config.js";

/**
 * The real nodemailer integration, minus the network.
 *
 * Every other suite mocks `sendMail`, which leaves one thing unverified: that
 * nodemailer loads, accepts the transport options this project builds from, and
 * actually serialises a message. A typo in an option name would pass every
 * route test and only fail at the first real signup.
 *
 * So this suite runs the REAL mailer against `jsonTransport`, which renders a
 * message and hands it back instead of opening a socket. Nothing is delivered
 * and no address is contacted.
 */

async function load(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    vi.resetModules();
    const [{ config }, mailer] = await Promise.all([import("../config.js"), import("./mailer.js")]);
    return { config: config as typeof ConfigType, mailer };
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

const MAIL = {
  to: "someone@example.com",
  subject: "Verify your Dangro email address",
  html: "<p>hello</p>",
  text: "hello",
};

describe("the json transport", () => {
  it("serialises a message without contacting anything", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      EMAIL_TRANSPORT: "json",
      EMAIL_FROM: "Dangro <no-reply@example.com>",
      EMAIL_FROM_NAME: "Dangro",
    });

    // Resolves => nodemailer accepted the transport and built the message.
    await expect(mailer.sendMail(MAIL)).resolves.toBeUndefined();
  });

  /** Captures what the json transport writes to the log for one message. */
  async function captureLog(
    mailer: { sendMail: (m: typeof MAIL) => Promise<void> },
    extra: Record<string, string | undefined> = {},
  ) {
    const logged: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => void logged.push(args.join(" "));
    try {
      await mailer.sendMail({ ...MAIL, ...extra });
    } finally {
      console.warn = warn;
    }
    return logged.join("\n");
  }

  const JSON_ENV = {
    NODE_ENV: "test",
    JWT_SECRET: "x".repeat(40),
    EMAIL_TRANSPORT: "json",
  } as const;

  it("builds the From header from EMAIL_FROM and the sender name", async () => {
    const { mailer } = await load({
      ...JSON_ENV,
      EMAIL_FROM: "no-reply@example.com",
      EMAIL_FROM_NAME: "Dangro",
    });

    // The address and the display name are what a spam filter reads first, and
    // this is the one thing the log no longer shows.
    expect(mailer.buildFromHeader("no-reply@example.com", "Dangro", true)).toBe(
      "Dangro <no-reply@example.com>"
    );
    expect(
      mailer.buildFromHeader("no-reply@example.com", "Dangro (beta)", true)
    ).toBe("Dangro (beta) <no-reply@example.com>");
  });

  it("leaves the address bare when no sender name is configured", async () => {
    const { mailer } = await load({
      ...JSON_ENV,
      EMAIL_FROM: "no-reply@example.com",
      EMAIL_FROM_NAME: "",
    });

    expect(mailer.buildFromHeader("no-reply@example.com", "", false)).toBe("no-reply@example.com");
    // Even if something passes `formatted: true` with no name, the header
    // must not come out as " <>addr" — some providers reject that outright.
    expect(mailer.buildFromHeader("no-reply@example.com", "", true)).toBe("no-reply@example.com");
    expect(mailer.buildFromHeader("no-reply@example.com", "   ", true)).toBe("no-reply@example.com");
  });

  it("never logs the recipient in full", async () => {
    const { mailer } = await load({ ...JSON_ENV, EMAIL_FROM: "no-reply@example.com" });

    expect(await captureLog(mailer)).not.toContain("someone@example.com");
  });

  it("never logs the message body, which carries the one-time token", async () => {
    const { mailer } = await load({ ...JSON_ENV, EMAIL_FROM: "no-reply@example.com" });

    // The bug this covers: logging the serialised message put a working
    // verification link in every deploy log that used EMAIL_TRANSPORT=json.
    const log = await captureLog(mailer, {
      text: "Verify Email: https://dangro.example.com/verify-email?token=SECRETTOKEN",
      html: '<a href="https://dangro.example.com/verify-email?token=SECRETTOKEN">Verify</a>',
    });

    expect(log).not.toContain("SECRETTOKEN");
    expect(log).not.toContain("verify-email");
    expect(log).not.toContain("<p>hello</p>");
  });

  it("still says plainly that nothing was delivered", async () => {
    const { mailer } = await load({ ...JSON_ENV, EMAIL_FROM: "no-reply@example.com" });

    const log = await captureLog(mailer);
    expect(log).toContain("NOT delivered");
    expect(log).toContain(MAIL.subject);
  });

  it("reports itself as configured with no mail server at all", async () => {
    const { config } = await load(JSON_ENV as unknown as Record<string, string | undefined>);

    expect(config.email.configured).toBe(true);
    expect(config.email.missingVars).toEqual([]);
  });
});

describe("the configuration guard", () => {
  it("throws a 503 SERVICE_UNAVAILABLE naming the missing variables", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: undefined,
      EMAIL_FROM: undefined,
    });

    try {
      mailer.assertEmailConfigured();
      throw new Error("should have thrown");
    } catch (err) {
      const appError = err as { code?: string; statusCode?: number; message?: string };
      expect(appError.code).toBe("SERVICE_UNAVAILABLE");
      expect(appError.statusCode).toBe(503);
      expect(appError.message).toContain("SMTP_HOST");
      expect(appError.message).toContain("EMAIL_FROM");
    }
  });

  it("says nothing is verified when it refuses", async () => {
    // The guard runs before any write; the copy has to make clear that no
    // account was created, or the user will try the same thing again.
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: undefined,
      EMAIL_FROM: undefined,
    });

    expect(() => mailer.assertEmailConfigured()).toThrow(/nothing has been changed/i);
  });

  it("does not open a socket when it refuses", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: undefined,
      EMAIL_FROM: undefined,
    });

    // Would hang or throw a connection error if the guard were bypassed.
    await expect(mailer.sendMail(MAIL)).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

describe("a real transport that cannot be reached", () => {
  it("raises a delivery failure, never a false success", async () => {
    // Port 1 on loopback refuses instantly, so this is fast and deterministic
    // rather than a timeout that might hang on a slow machine.
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_USER: "mailer@example.com",
      SMTP_PASS: "a-password-that-must-not-leak",
      EMAIL_FROM: "no-reply@example.com",
      EMAIL_TIMEOUT_MS: "1000",
    });

    await expect(mailer.sendMail(MAIL)).rejects.toBeInstanceOf(mailer.MailDeliveryError);
  });

  it("does not leak the SMTP password or the provider's raw response", async () => {
    const secret = "a-password-that-must-not-leak";
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "1",
      SMTP_USER: "mailer@example.com",
      SMTP_PASS: secret,
      EMAIL_FROM: "no-reply@example.com",
      EMAIL_TIMEOUT_MS: "1000",
    });

    const err = await mailer.sendMail(MAIL).catch((e: unknown) => e as Error);
    const text = `${(err as Error).message} ${(err as { reason?: string }).reason ?? ""}`;

    expect(text).not.toContain(secret);
    // Only the classification, never the transport's own error object.
    expect(text).toMatch(/could not be delivered|could not be reached|refused the message/i);
  });
});

describe("checkEmailConnection", () => {
  it("reports a JSON transport as reachable, and says it delivers nothing", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      EMAIL_TRANSPORT: "json",
    });

    const check = await mailer.checkEmailConnection();

    expect(check).toMatchObject({ configured: true, transport: "json", reachable: true });
    expect(check.detail).toMatch(/not delivered/i);
  });

  it("reports an unconfigured server without attempting a connection", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      SMTP_HOST: undefined,
      EMAIL_FROM: undefined,
    });

    const check = await mailer.checkEmailConnection();

    expect(check.configured).toBe(false);
    expect(check.reachable).toBe(false);
    expect(check.detail).toContain("SMTP_HOST");
  });
});

describe("maskForLog", () => {
  it("keeps the domain and drops the local part", async () => {
    const { mailer } = await load({
      NODE_ENV: "test",
      JWT_SECRET: "x".repeat(40),
      EMAIL_TRANSPORT: "json",
    });

    expect(mailer.maskForLog("someone@example.com")).toBe("***@example.com");
    expect(mailer.maskForLog("not-an-address")).toBe("***");
  });
});

describe("the health probe cache", () => {
  const JSON_ENV = {
    NODE_ENV: "test",
    JWT_SECRET: "x".repeat(40),
    EMAIL_TRANSPORT: "json",
  } as const;

  it("reuses one verdict instead of probing per request", async () => {
    const { mailer } = await load(JSON_ENV as unknown as Record<string, string | undefined>);

    const first = await mailer.emailServerHealth();
    const second = await mailer.emailServerHealth();

    // Same object, so a burst of resend requests costs one SMTP round trip
    // rather than one each.
    expect(second).toBe(first);
  });

  it("probes again once the cache is dropped", async () => {
    const { mailer } = await load(JSON_ENV as unknown as Record<string, string | undefined>);

    const first = await mailer.emailServerHealth();
    mailer.resetEmailHealthCache();
    const afterReset = await mailer.emailServerHealth();

    expect(afterReset).not.toBe(first);
    expect(afterReset).toEqual(first);
  });
});