import { describe, expect, it, vi, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../config.js";
import { MediaIngestError, RemoteMediaStore, diskMediaStore } from "./storage.js";

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function tempFile(bytes: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-media-"));
  const file = path.join(dir, "spool");
  fs.writeFileSync(file, bytes);
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RemoteMediaStore", () => {
  const store = new RemoteMediaStore(
    "https://media.example.ts.net/",
    "https://media.example.ts.net",
    "a".repeat(32)
  );

  it("resolves to a redirect on the media host, with a normalised base URL", async () => {
    const resolved = await store.resolve("3f2a1b4c-1111-2222-3333-444455556666.png");
    expect(resolved).toEqual({
      redirect: "https://media.example.ts.net/media/3f2a1b4c-1111-2222-3333-444455556666.png",
    });
    expect(store.redirects).toBe(true);
  });

  it("refuses to build a URL for an unsafe name", async () => {
    for (const name of ["../../etc/passwd", "evil.html", "noextension", "a/b.png"]) {
      expect(await store.resolve(name)).toBeNull();
    }
  });

  it("forwards the upload with the shared key and returns the API-shaped URL", async () => {
    const file = tempFile(PNG_BYTES);
    const seen: { url?: string; init?: RequestInit } = {};
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.url = url;
      seen.init = init;
      return new Response("", { status: 201 });
    });

    const stored = await store.save(file, "3f2a1b4c-1111-2222-3333-444455556666.png", "image/png");

    // The caller receives a relative /uploads URL regardless of backend, so
    // stored attachment URLs mean the same thing everywhere.
    expect(stored.url).toBe("/uploads/3f2a1b4c-1111-2222-3333-444455556666.png");
    expect(stored.size).toBe(PNG_BYTES.length);
    expect(seen.url).toBe(
      "https://media.example.ts.net/media/3f2a1b4c-1111-2222-3333-444455556666.png"
    );
    expect(seen.init?.method).toBe("PUT");
    expect((seen.init?.headers as Record<string, string>)["x-media-key"]).toBe("a".repeat(32));

    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it("rejects unsafe names before contacting the host", async () => {
    const file = tempFile(PNG_BYTES);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(store.save(file, "../escape.png", "image/png")).rejects.toBeInstanceOf(
      MediaIngestError
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it("reports an unreachable host distinctly from a rejection", async () => {
    const file = tempFile(PNG_BYTES);
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });

    await expect(
      store.save(file, "3f2a1b4c-1111-2222-3333-444455556666.png", "image/png")
    ).rejects.toThrow(/unreachable/i);

    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });

  it("surfaces the status when the host refuses the upload", async () => {
    const file = tempFile(PNG_BYTES);
    vi.stubGlobal("fetch", async () => new Response("Invalid media key", { status: 401 }));

    await expect(
      store.save(file, "3f2a1b4c-1111-2222-3333-444455556666.png", "image/png")
    ).rejects.toThrow(/401/);

    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  });
});

describe("diskMediaStore", () => {
  it("never redirects, so express.static stays in charge", async () => {
    const store = diskMediaStore();
    expect(store.redirects).toBe(false);
    expect(await store.resolve("3f2a1b4c-1111-2222-3333-444455556666.png")).toBeNull();
  });

  it("moves the spooled file to the name it returns in the URL", async () => {
    // The uploader spools under a bare uuid because the extension is only
    // assigned after the magic bytes are verified. If the store did not
    // rename it, express.static would be asked for "<uuid>.png" while the file
    // on disk is still "<uuid>", and every upload would 404.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-store-"));
    const spooled = path.join(dir, "3f2a1b4c-1111-2222-3333-444455556666");
    fs.writeFileSync(spooled, PNG_BYTES);

    const filename = "3f2a1b4c-1111-2222-3333-444455556666.png";
    const target = path.join(dir, filename);

    vi.spyOn(config, "uploadDir", "get").mockReturnValue(dir);

    const stored = await diskMediaStore().save(spooled, filename, "image/png");

    expect(stored.url).toBe(`/uploads/${filename}`);
    expect(stored.size).toBe(PNG_BYTES.length);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target).equals(PNG_BYTES)).toBe(true);
    // The extensionless spool file must not be left behind.
    expect(fs.existsSync(spooled)).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("leaves the file alone when the spool name already matches", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dangro-store-"));
    const target = path.join(dir, "3f2a1b4c-1111-2222-3333-444455556666.png");
    fs.writeFileSync(target, PNG_BYTES);

    vi.spyOn(config, "uploadDir", "get").mockReturnValue(dir);

    await diskMediaStore().save(target, "3f2a1b4c-1111-2222-3333-444455556666.png", "image/png");

    expect(fs.existsSync(target)).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});