import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../index.js";
import { buildCspDirectives, mediaOrigin } from "./csp.js";

/**
 * Regression tests for the Content-Security-Policy.
 *
 * The bug these cover: helmet ships `img-src 'self' data:` and no
 * `media-src` at all. With `MEDIA_PROVIDER=remote` the API answers
 * `/uploads/:name` with a 302 to the media host's own origin, so every
 * avatar, post image and video is a cross-origin load. The browser blocked
 * them on a CSP violation while the API happily reported 200 — images that
 * "were supposed to" load and never did.
 */

const MEDIA_HOST = "https://laptop.example.ts.net";

describe("mediaOrigin", () => {
  it("keeps only the scheme and host", () => {
    expect(mediaOrigin(`${MEDIA_HOST}/`)).toBe(MEDIA_HOST);
  });

  it("strips a path so the expression can match a request", () => {
    expect(mediaOrigin(`${MEDIA_HOST}/media`)).toBe(MEDIA_HOST);
  });

  it("preserves a non-default port", () => {
    expect(mediaOrigin("http://127.0.0.1:8081")).toBe("http://127.0.0.1:8081");
  });

  it("returns null for unset, blank or unparseable values", () => {
    expect(mediaOrigin("")).toBeNull();
    expect(mediaOrigin("   ")).toBeNull();
    expect(mediaOrigin("not a url")).toBeNull();
  });
});

describe("buildCspDirectives", () => {
  it("adds media-src, which helmet omits entirely", () => {
    const directives = buildCspDirectives("");
    expect(directives["media-src"]).toBeDefined();
    expect(directives["media-src"]).toContain("'self'");
  });

  it("allows blob: for optimistic previews and voice notes", () => {
    const directives = buildCspDirectives("");
    expect(directives["img-src"]).toContain("blob:");
    expect(directives["media-src"]).toContain("blob:");
  });

  it("keeps helmet's existing image allowances", () => {
    const directives = buildCspDirectives("");
    expect(directives["img-src"]).toContain("'self'");
    expect(directives["img-src"]).toContain("data:");
  });

  it("allows the remote media host to serve images and video", () => {
    const directives = buildCspDirectives(MEDIA_HOST);
    expect(directives["img-src"]).toContain(MEDIA_HOST);
    expect(directives["media-src"]).toContain(MEDIA_HOST);
  });

  it("does not widen img-src when no media host is configured", () => {
    const directives = buildCspDirectives("");
    expect(directives["img-src"]).not.toContain("*");
    expect(directives["img-src"]).toHaveLength(3);
  });

  it("ignores an unparseable media URL instead of emitting a broken policy", () => {
    const directives = buildCspDirectives("localhost:8081");
    expect(directives["img-src"]).not.toContain("localhost:8081");
    expect(directives["img-src"]).toContain("'self'");
  });

  it("keeps the lockdown directives helmet provides", () => {
    const directives = buildCspDirectives(MEDIA_HOST);
    expect(directives["default-src"]).toEqual(["'self'"]);
    expect(directives["object-src"]).toEqual(["'none'"]);
    expect(directives["script-src"]).toEqual(["'self'"]);
    expect(directives["frame-ancestors"]).toEqual(["'self'"]);
  });
});

describe("the policy the running server actually sends", () => {
  const sourcesOf = (header: string, directive: string): string[] | null => {
    const entry = header
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.toLowerCase().startsWith(`${directive} `));
    return entry ? entry.slice(directive.length).trim().split(/\s+/) : null;
  };

  it("sends a policy with media-src, so <video> is not left to default-src", async () => {
    const res = await request(app).get("/api/health");

    const header = String(res.headers["content-security-policy"]);
    expect(sourcesOf(header, "media-src")).toContain("'self'");
    expect(sourcesOf(header, "media-src")).toContain("blob:");
    expect(sourcesOf(header, "img-src")).toContain("blob:");
  });

  it("does not fall back to helmet's unmodified defaults", async () => {
    // Guards the wiring in index.ts, not just the builder: swapping the
    // directives back out would silently reinstate the blocked-media bug.
    const res = await request(app).get("/api/health");

    const header = String(res.headers["content-security-policy"]);
    expect(sourcesOf(header, "img-src")).not.toEqual(["'self'", "data:"]);
  });
});
