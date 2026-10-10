import { describe, expect, it, vi } from "vitest";
import type { config as ConfigType } from "./config.js";

/**
 * Regression tests for the effective media provider.
 *
 * The bug these cover: `MEDIA_PROVIDER=gridfs` with the PostgreSQL backend
 * only printed "falling back to disk" and then went on to build a GridFS
 * store with no MongoDB connection, which throws on the first upload. The
 * warning described a fallback that never happened.
 */

async function loadConfig(env: Record<string, string | undefined>) {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    // config.ts reads the environment once, at import time. Resetting the
    // registry makes the next import evaluate it again with these values.
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

describe("effective media provider", () => {
  it("defaults to disk on PostgreSQL", async () => {
    const config = await loadConfig({ ...BASE, DATABASE_PROVIDER: "postgres" });
    expect(config.mediaProvider).toBe("disk");
  });

  it("defaults to gridfs on MongoDB", async () => {
    const config = await loadConfig({ ...BASE, DATABASE_PROVIDER: "mongo" });
    expect(config.mediaProvider).toBe("gridfs");
  });

  it("resolves gridfs to disk on PostgreSQL instead of only warning", async () => {
    const config = await loadConfig({
      ...BASE,
      DATABASE_PROVIDER: "postgres",
      MEDIA_PROVIDER: "gridfs",
    });
    expect(config.mediaProvider).toBe("disk");
  });

  it("keeps gridfs on MongoDB", async () => {
    const config = await loadConfig({
      ...BASE,
      DATABASE_PROVIDER: "mongo",
      MEDIA_PROVIDER: "gridfs",
    });
    expect(config.mediaProvider).toBe("gridfs");
  });

  it("honours an explicit remote provider", async () => {
    const config = await loadConfig({
      ...BASE,
      DATABASE_PROVIDER: "mongo",
      MEDIA_PROVIDER: "remote",
      MEDIA_PUBLIC_URL: "https://media.example.ts.net",
      MEDIA_INGEST_KEY: "k".repeat(40),
    });
    expect(config.mediaProvider).toBe("remote");
  });

  it("keeps an explicit disk provider on MongoDB", async () => {
    const config = await loadConfig({ ...BASE, DATABASE_PROVIDER: "mongo", MEDIA_PROVIDER: "disk" });
    expect(config.mediaProvider).toBe("disk");
  });
});