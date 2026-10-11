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