import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Deriving a Cloudinary asset ID from a stored delivery URL.
 *
 * Avatars, post media and stories store only the URL — the schema has no
 * public-id column for them — so this is the only way an asset a row *used to*
 * point at can be removed instead of accumulating in the media library for
 * ever. Because it takes a URL and produces the identifier used to delete, it
 * is deliberately narrow: it must refuse anything that is not a URL this
 * deployment produced, or a stored link could be steered at another asset.
 */

const uploadMock = vi.hoisted(() => vi.fn());
const destroyMock = vi.hoisted(() => vi.fn());
const configMock = vi.hoisted(() => vi.fn());
const pingMock = vi.hoisted(() => vi.fn());

vi.mock("cloudinary", () => ({
  default: {},
  v2: {
    config: configMock,
    api: { ping: pingMock },
    uploader: { upload: uploadMock, destroy: destroyMock },
  },
}));

const CLOUD = "dangro-test-cloud";

let cloudinary: typeof import("./cloudinary.js");

beforeEach(async () => {
  destroyMock.mockReset();
  destroyMock.mockResolvedValue({ result: "ok" });
  configMock.mockReset();
  pingMock.mockReset();
  pingMock.mockResolvedValue({ status: "ok" });

  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  process.env.CLOUDINARY_API_KEY = "123456789012345";
  process.env.CLOUDINARY_API_SECRET = "secret-value-for-tests-only";

  vi.resetModules();
  cloudinary = await import("./cloudinary.js");
});

const stored = (id: string, ext = "png") =>
  `https://res.cloudinary.com/${CLOUD}/image/upload/c_limit,w_1920,f_auto,q_auto/${id}.${ext}`;

describe("publicIdFromUrl", () => {
  it("recovers the ID from a URL carrying a transformation and a folder", () => {
    const url = stored("dangro/images/6d5ddb7f-3b49-4d10-add3-7c1fcef3e695");

    expect(cloudinary.publicIdFromUrl(url)).toBe("dangro/images/6d5ddb7f-3b49-4d10-add3-7c1fcef3e695");
  });

  it("recovers the ID from a URL with no transformation at all", () => {
    expect(cloudinary.publicIdFromUrl(`https://res.cloudinary.com/${CLOUD}/image/upload/abc-123.jpg`)).toBe(
      "abc-123"
    );
  });

  it("skips the version segment Cloudinary adds when it re-encodes an asset", () => {
    const url = `https://res.cloudinary.com/${CLOUD}/image/upload/v1699999999/dangro/images/abc.png`;

    expect(cloudinary.publicIdFromUrl(url)).toBe("dangro/images/abc");
  });

  it("keeps a GIF's identity, extension and all", () => {
    expect(cloudinary.publicIdFromUrl(stored("dangro/images/anim", "gif"))).toBe("dangro/images/anim");
  });

  it("refuses a local /uploads path", () => {
    // A non-image asset. There is nothing on Cloudinary to point at.
    expect(cloudinary.publicIdFromUrl("/uploads/6d5ddb7f-3b49-4d10-add3-7c1fcef3e695.png")).toBeNull();
  });

  it("refuses a delivery URL belonging to a different cloud", () => {
    // The realistic cross-account mistake: a URL pasted in from another site.
    const foreign = "https://res.cloudinary.com/someone-elses-cloud/image/upload/dangro/images/abc.png";
    expect(cloudinary.publicIdFromUrl(foreign)).toBeNull();
  });

  it("refuses a look-alike host", () => {
    const lookalike = "https://res.cloudinary.com.evil.example/image/upload/dangro/images/abc.png";
    expect(cloudinary.publicIdFromUrl(lookalike)).toBeNull();
  });

  it("refuses plain http and anything that is not a URL", () => {
    expect(cloudinary.publicIdFromUrl(`http://res.cloudinary.com/${CLOUD}/image/upload/abc.png`)).toBeNull();
    expect(cloudinary.publicIdFromUrl("C:\\Users\\me\\photo.png")).toBeNull();
    expect(cloudinary.publicIdFromUrl("data:image/png;base64,AAAA")).toBeNull();
    expect(cloudinary.publicIdFromUrl("")).toBeNull();
    expect(cloudinary.publicIdFromUrl(null)).toBeNull();
    expect(cloudinary.publicIdFromUrl(undefined)).toBeNull();
  });

  it("refuses an image path that is not an upload", () => {
    expect(cloudinary.publicIdFromUrl(`https://res.cloudinary.com/${CLOUD}/image/fetch/abc.png`)).toBeNull();
  });
});

describe("destroyImageForUrl", () => {
  it("removes the asset behind a stored delivery URL", async () => {
    await cloudinary.destroyImageForUrl(stored("dangro/images/old-avatar"), "a test");

    expect(destroyMock).toHaveBeenCalledTimes(1);
    expect(destroyMock.mock.calls[0]?.[0]).toBe("dangro/images/old-avatar");
  });

  it("does nothing for a local /uploads URL", async () => {
    await cloudinary.destroyImageForUrl("/uploads/abc.webm", "a voice note");

    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("does nothing for an external link a user typed", async () => {
    await cloudinary.destroyImageForUrl("https://example.com/photo.png", "an avatar");

    expect(destroyMock).not.toHaveBeenCalled();
  });

  it("never throws when Cloudinary rejects the delete", async () => {
    // The database write has already happened by the time this runs, so a
    // failed delete must not turn a successful save into a failed request.
    destroyMock.mockRejectedValue(new Error("rate limited"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      cloudinary.destroyImageForUrl(stored("dangro/images/abc"), "a test")
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("does nothing at all when Cloudinary is not configured", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    vi.resetModules();
    const unconfigured = await import("./cloudinary.js");

    await unconfigured.destroyImageForUrl(stored("dangro/images/abc"), "a test");

    expect(destroyMock).not.toHaveBeenCalled();
    // The same URL is not even a Cloudinary URL without a cloud name.
    expect(unconfigured.publicIdFromUrl(stored("dangro/images/abc"))).toBeNull();
  });
});

describe("checkCloudinaryConnection", () => {
  it("reports reachable when Cloudinary answers the ping", async () => {
    const check = await cloudinary.checkCloudinaryConnection();

    expect(check).toMatchObject({ configured: true, reachable: true });
    expect(pingMock).toHaveBeenCalled();
  });

  it("reports the missing variables instead of throwing when unconfigured", async () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    vi.resetModules();
    const unconfigured = await import("./cloudinary.js");

    const check = await unconfigured.checkCloudinaryConnection();

    expect(check).toMatchObject({ configured: false, reachable: false });
    expect(check.detail).toContain("CLOUDINARY_CLOUD_NAME");
    expect(pingMock).not.toHaveBeenCalled();
  });

  it("reports unreachable, and never the secret, when the credentials are wrong", async () => {
    // The failure that otherwise stays invisible until the first real upload.
    pingMock.mockRejectedValue({
      error: { message: "Invalid credentials" },
      message: "Invalid credentials",
    });

    const check = await cloudinary.checkCloudinaryConnection();

    expect(check).toMatchObject({ configured: true, reachable: false });
    expect(check.detail).toContain("Invalid credentials");
    expect(check.detail).not.toContain("secret-value-for-tests-only");
  });
});