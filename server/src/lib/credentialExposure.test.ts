import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * The Cloudinary API secret must never reach the browser.
 *
 * The client is a Vite bundle: anything in a client/src file, or any VITE_*
 * environment variable, is inlined into shipped JavaScript and is readable by
 * anyone who loads the site. The secret is a write credential for the media
 * library, so this is checked rather than assumed.
 *
 * These tests read the real client source, so they fail the moment someone
 * imports the server config into client code or names a VITE_ secret.
 */

const CLIENT_ROOT = path.resolve(__dirname, "../../../client");
const SERVER_ROOT = path.resolve(__dirname, "..");

function walk(dir: string, filter: (file: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const clientFiles = walk(path.join(CLIENT_ROOT, "src"), (f) => /\.(ts|tsx|js|jsx)$/.test(f));
const clientEnvFiles = walk(CLIENT_ROOT, (f) => /^\.env(\.|$)/.test(path.basename(f)));

describe("Cloudinary credentials stay on the server", () => {
  it("the client source contains no reference to the API secret", () => {
    const offenders = clientFiles.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /CLOUDINARY_API_SECRET/.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it("no client file imports the server Cloudinary module or config", () => {
    const offenders = clientFiles.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /from\s+["'].*(lib\/cloudinary|src\/config|\/config)["']/.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it("no VITE_ variable holds a Cloudinary credential", () => {
    const offenders = clientEnvFiles.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /^[^#\n]*VITE_[^=\n]*=.*(CLOUDINARY|SECRET|API_KEY)/im.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it("the client never talks to a Cloudinary upload endpoint directly", () => {
    // The browser uploads through the Dangro API, which holds the secret. A
    // direct unsigned upload from the browser would also expose the cloud name
    // to anyone and bypass the server's validation.
    const offenders = clientFiles.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /api\.cloudinary\.com|cloudinary\.com\/v1_/.test(text) && !/res\.cloudinary\.com/.test(text);
    });

    expect(offenders).toEqual([]);
  });

  it("the upload response carries no credential fields", () => {
    // Guards the route response shape directly, not just the client.
    const uploads = fs.readFileSync(path.join(SERVER_ROOT, "routes/uploads.ts"), "utf8");
    expect(uploads).not.toMatch(/apiSecret\s*:/);
    expect(uploads).not.toMatch(/apiKey\s*:/);
  });

  it("reads credentials only from the environment", () => {
    const lib = fs.readFileSync(path.join(SERVER_ROOT, "lib/cloudinary.ts"), "utf8");
    expect(lib).toMatch(/process\.env|config\.cloudinary/);
    // No literal that could be a committed credential.
    expect(lib).not.toMatch(/["'][0-9a-f]{32}["']/i);
  });
});

describe("SMTP credentials stay on the server", () => {
  it("the client source names no SMTP variable", () => {
    const offenders = clientFiles.filter((file) => /SMTP_(HOST|USER|PASS|PORT|SECURE)/.test(fs.readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("no client file imports the server mailer or config", () => {
    const offenders = clientFiles.filter((file) =>
      /from\s+["'].*(lib\/mailer|lib\/emailVerification|src\/config|\/config)["']/.test(fs.readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("no VITE_ variable holds an SMTP credential", () => {
    const offenders = clientEnvFiles.filter((file) =>
      /^[^#\n]*VITE_[^=\n]*=.*(SMTP|PASSWORD|EMAIL_FROM)/im.test(fs.readFileSync(file, "utf8"))
    );
    expect(offenders).toEqual([]);
  });

  it("reads the mail server only from the environment", () => {
    const lib = fs.readFileSync(path.join(SERVER_ROOT, "lib/mailer.ts"), "utf8");
    expect(lib).toMatch(/config\.email/);
    // No hardcoded host, and nothing shaped like a committed password.
    expect(lib).not.toMatch(/smtp\.[a-z0-9.-]+\.[a-z]{2,}/i);
    expect(lib).not.toMatch(/["'][A-Za-z0-9+/]{20,}={0,2}["']/);
  });

  it("never logs the password or the sender address", () => {
    const lib = fs.readFileSync(path.join(SERVER_ROOT, "lib/mailer.ts"), "utf8");
    // console.* must not interpolate config.email.pass or the raw recipient.
    for (const call of lib.matchAll(/console\.(?:log|error|warn)\(([^;]*)\);/g)) {
      expect(call[1]).not.toMatch(/config\.email\.pass\b/);
      expect(call[1]).not.toMatch(/\$\{\s*mail\.to\b/);
    }
  });
});

describe("verification tokens stay out of the logs", () => {
  const serverLibs = walk(path.join(SERVER_ROOT, "lib"), (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("no server module logs a raw token or a full verification link", () => {
    const offenders = serverLibs.filter((file) => {
      const text = fs.readFileSync(file, "utf8");
      return /console\.(?:log|error|warn)\([^)]*\b(?:raw|rawToken|token|verificationUrl|passwordResetUrl)\b/.test(text);
    });

    // Anything that mentions them must be masked or hashed first. Failures
    // here mean a deploy log is one `grep` away from a working login link.
    expect(offenders).toEqual([]);
  });

  it("the account routes log neither the token nor the recipient", () => {
    const auth = fs.readFileSync(path.join(SERVER_ROOT, "routes/auth.ts"), "utf8");
    for (const call of auth.matchAll(/console\.(?:log|error|warn)\(([^;]*)\);/g)) {
      expect(call[1]).not.toMatch(/\btoken\b/);
      expect(call[1]).not.toMatch(/\buser\.email\b/);
    }
  });
});