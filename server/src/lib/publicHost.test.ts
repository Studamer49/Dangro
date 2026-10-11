import { describe, expect, it } from "vitest";
import { isPrivateHost, publicOrigin } from "./publicHost.js";

/**
 * Regression tests for the browser-facing media host guard.
 *
 * The bug these cover: `MEDIA_PUBLIC_URL` was only checked for presence, so
 * `http://192.168.1.50:8081` booted happily and `RemoteMediaStore.resolve()`
 * turned every `/uploads/:name` request into a 302 to it. The browser then
 * gated each image behind "wants to see devices on your local network" — an
 * untrustworthy prompt, and images that never loaded anyway.
 */

describe("isPrivateHost", () => {
  it("flags loopback in every notation", () => {
    for (const host of ["127.0.0.1", "127.1.2.3", "localhost", "LOCALHOST", "ip6-localhost"]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("flags the RFC 1918 private ranges", () => {
    for (const host of ["10.0.0.5", "172.16.0.1", "172.31.255.254", "192.168.1.50", "192.168.0.1"]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("flags link-local and the cloud metadata address", () => {
    expect(isPrivateHost("169.254.169.254")).toBe(true);
  });

  it("flags CGNAT and the this-network range", () => {
    expect(isPrivateHost("100.64.0.1")).toBe(true);
    expect(isPrivateHost("0.0.0.0")).toBe(true);
  });

  it("flags LAN-only name suffixes", () => {
    for (const host of ["nas.local", "media.lan", "api.internal", "router.home.arpa", "db.localhost"]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("flags a bare hostname that only resolves on the LAN", () => {
    expect(isPrivateHost("media-host")).toBe(true);
    expect(isPrivateHost("nas")).toBe(true);
  });

  it("flags IPv6 loopback, unique-local and link-local", () => {
    for (const host of ["::1", "[::1]", "fd00::1", "fc00::1", "fe80::1"]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("flags an IPv4-mapped private address", () => {
    expect(isPrivateHost("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateHost("::ffff:127.0.0.1")).toBe(true);
  });

  it("does not flag public addresses", () => {
    for (const host of [
      "dangro.onrender.com",
      "media.example.ts.net",
      "8.8.8.8",
      "172.32.0.1",
      "172.15.0.1",
      "192.169.1.1",
      "11.0.0.1",
    ]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });

  it("does not flag a public IPv6 address", () => {
    expect(isPrivateHost("2606:4700:4700::1111")).toBe(false);
  });
});

describe("publicOrigin", () => {
  it("returns the origin of a public https media host", () => {
    expect(publicOrigin("https://media.example.ts.net")).toBe("https://media.example.ts.net");
  });

  it("strips the path, as a CSP source expression requires", () => {
    expect(publicOrigin("https://media.example.ts.net/media")).toBe("https://media.example.ts.net");
  });

  it("keeps a non-default port", () => {
    expect(publicOrigin("https://media.example.ts.net:8443")).toBe("https://media.example.ts.net:8443");
  });

  it("rejects a LAN address, which is what triggered the permission prompt", () => {
    expect(publicOrigin("http://192.168.1.50:8081")).toBeNull();
    expect(publicOrigin("https://192.168.1.50:8081")).toBeNull();
  });

  it("rejects loopback", () => {
    expect(publicOrigin("http://127.0.0.1:8081")).toBeNull();
  });

  it("rejects plain http on a public host", () => {
    // Mixed content on an https page, and downgradable to http in transit.
    expect(publicOrigin("http://media.example.ts.net")).toBeNull();
  });

  it("rejects a non-http scheme", () => {
    expect(publicOrigin("ftp://media.example.ts.net")).toBeNull();
    expect(publicOrigin("javascript:alert(1)")).toBeNull();
    expect(publicOrigin("data:text/html,hi")).toBeNull();
  });

  it("rejects credentials embedded in the URL", () => {
    // Otherwise the secret is handed to every visitor in the redirect target.
    expect(publicOrigin("https://user:pass@media.example.ts.net")).toBeNull();
  });

  it("rejects unset, blank and unparseable values", () => {
    expect(publicOrigin("")).toBeNull();
    expect(publicOrigin("   ")).toBeNull();
    expect(publicOrigin("not a url")).toBeNull();
  });
});