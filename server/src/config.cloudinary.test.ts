import { describe, expect, it, vi } from "vitest";
import type { config as ConfigType } from "./config.js";

/**
 * How the server decides whether image storage is usable.
 *
 * The bug this covers: a deployment that configured Cloudinary the way
 * Cloudinary's own documentation shows — a single
 * `CLOUDINARY_URL="cloudinary://key:secret@cloud"` — was reported as *not
 * configured*, because only the three discrete variables were read. Every
 * image upload then failed with a 503 and the SDK was never called, which is
 * indistinguishable, from the outside, from "the upload code is broken".
 *
 * These tests assert what the server *resolves*, never the secret itself.
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

const BASE = {
  NODE_ENV: "test",
  JWT_SECRET: "x".repeat(40),
  DATABASE_PROVIDER: "postgres",
  CLOUDINARY_CLOUD_NAME: undefined,
  CLOUDINARY_API_KEY: undefined,
  CLOUDINARY_API_SECRET: undefined,
  CLOUDINARY_URL: undefined,
  CLOUDINARY_FOLDER: undefined,
} as const;

const URL_CREDENTIALS = "cloudinary://123456789012345:s3cr3t-from-the-url@url-cloud";

describe("Cloudinary credentials", () => {
  it("is configured when all three discrete variables are set", async () => {
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_CLOUD_NAME: "discrete-cloud",
      CLOUDINARY_API_KEY: "123456789012345",
      CLOUDINARY_API_SECRET: "secret-value",
    });

    expect(config.cloudinary.configured).toBe(true);
    expect(config.cloudinary.missingVars).toEqual([]);
    expect(config.cloudinary.cloudName).toBe("discrete-cloud");
    expect(config.cloudinary.credentialSource).toContain("CLOUDINARY_CLOUD_NAME");
  });

  it("is configured from CLOUDINARY_URL alone", async () => {
    const config = await loadConfig({ ...BASE, CLOUDINARY_URL: URL_CREDENTIALS });

    expect(config.cloudinary.configured).toBe(true);
    expect(config.cloudinary.missingVars).toEqual([]);
    expect(config.cloudinary.cloudName).toBe("url-cloud");
    expect(config.cloudinary.apiKey).toBe("123456789012345");
    expect(config.cloudinary.credentialSource).toBe("CLOUDINARY_URL");
  });

  it("decodes a percent-encoded secret from CLOUDINARY_URL", async () => {
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_URL: "cloudinary://123456789012345:a%40b%2Fc%3D@encoded-cloud",
    });

    expect(config.cloudinary.apiSecret).toBe("a@b/c=");
  });

  it("lets the discrete variables win over CLOUDINARY_URL", async () => {
    // Adding CLOUDINARY_URL must never silently redirect uploads to a
    // different cloud than the one deliberately configured.
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_CLOUD_NAME: "discrete-cloud",
      CLOUDINARY_API_KEY: "123456789012345",
      CLOUDINARY_API_SECRET: "secret-value",
      CLOUDINARY_URL: URL_CREDENTIALS,
    });

    expect(config.cloudinary.cloudName).toBe("discrete-cloud");
    expect(config.cloudinary.credentialSource).toContain("CLOUDINARY_CLOUD_NAME");
  });

  it("fills only the gap left by a partial set of discrete variables", async () => {
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_API_SECRET: "secret-value",
      CLOUDINARY_URL: URL_CREDENTIALS,
    });

    expect(config.cloudinary.configured).toBe(true);
    expect(config.cloudinary.apiSecret).toBe("secret-value");
    expect(config.cloudinary.cloudName).toBe("url-cloud");
  });

  it("names every missing variable when nothing is set", async () => {
    const config = await loadConfig({ ...BASE });

    expect(config.cloudinary.configured).toBe(false);
    expect(config.cloudinary.missingVars).toEqual([
      "CLOUDINARY_CLOUD_NAME",
      "CLOUDINARY_API_KEY",
      "CLOUDINARY_API_SECRET",
    ]);
  });

  it("names only the variable that is actually absent", async () => {
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_CLOUD_NAME: "discrete-cloud",
      CLOUDINARY_API_KEY: "123456789012345",
    });

    expect(config.cloudinary.configured).toBe(false);
    expect(config.cloudinary.missingVars).toEqual(["CLOUDINARY_API_SECRET"]);
  });

  it("treats a blank value as missing rather than as a credential", async () => {
    // Cloudflare's dashboard and a stray `KEY=` line in .env both produce this.
    const config = await loadConfig({
      ...BASE,
      CLOUDINARY_CLOUD_NAME: "   ",
      CLOUDINARY_API_KEY: "123456789012345",
      CLOUDINARY_API_SECRET: "secret-value",
    });

    expect(config.cloudinary.configured).toBe(false);
    expect(config.cloudinary.missingVars).toEqual(["CLOUDINARY_CLOUD_NAME"]);
  });

  it("refuses to boot on a malformed CLOUDINARY_URL instead of ignoring it", async () => {
    await expect(loadConfig({ ...BASE, CLOUDINARY_URL: "not a url" })).rejects.toThrow(
      /CLOUDINARY_URL is not a valid URL/i
    );
  });

  it("refuses to boot when CLOUDINARY_URL uses the wrong scheme", async () => {
    await expect(
      loadConfig({ ...BASE, CLOUDINARY_URL: "https://key:secret@some-cloud" })
    ).rejects.toThrow(/cloudinary:\/\/ scheme/i);
  });

  it("refuses to boot when CLOUDINARY_URL is missing part of the credentials", async () => {
    // The realistic typo: the key and cloud copied, the secret left off.
    await expect(
      loadConfig({ ...BASE, CLOUDINARY_URL: "cloudinary://123456789012345@solo-cloud" })
    ).rejects.toThrow(/missing its API key, API secret or cloud name/i);
  });
});

describe("Cloudinary folder", () => {
  it("defaults images to dangro/images", async () => {
    const config = await loadConfig({ ...BASE });
    expect(config.cloudinary.folder).toBe("dangro/images");
  });

  it("honours an explicit folder", async () => {
    const config = await loadConfig({ ...BASE, CLOUDINARY_FOLDER: "my-cloud/dangro" });
    expect(config.cloudinary.folder).toBe("my-cloud/dangro");
  });

  it("strips a trailing slash so the asset path cannot double up", async () => {
    const config = await loadConfig({ ...BASE, CLOUDINARY_FOLDER: "dangro/images/" });
    expect(config.cloudinary.folder).toBe("dangro/images");
  });
});

describe("image size limit", () => {
  it("defaults to 8 MB", async () => {
    const config = await loadConfig({ ...BASE });
    expect(config.cloudinary.imageMaxBytes).toBe(8 * 1024 * 1024);
  });

  it("keeps an operator's smaller limit", async () => {
    const config = await loadConfig({ ...BASE, CLOUDINARY_IMAGE_MAX_BYTES: "2097152" });
    expect(config.cloudinary.imageMaxBytes).toBe(2 * 1024 * 1024);
  });

  it("never lets a typo turn the limit off", async () => {
    const config = await loadConfig({ ...BASE, CLOUDINARY_IMAGE_MAX_BYTES: "lots" });
    expect(config.cloudinary.imageMaxBytes).toBe(8 * 1024 * 1024);
  });
});