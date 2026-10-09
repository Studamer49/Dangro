import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { contentTypeForName, safeUploadName } from "../db/mediaNames.js";

/**
 * Standalone media host.
 *
 * Runs on a separate machine from the API (a laptop reachable over a
 * Tailscale Funnel, for example) and holds the actual image and video bytes
 * on local disk. The API pushes uploads here and redirects browsers here, so
 * large files never pass through the API host.
 *
 * Deliberately self-contained: it reads its own environment and never
 * imports the API's config, so it does not need the database URL or the JWT
 * secret on this machine.
 *
 *   MEDIA_DIR   directory to store files in (default ./media)
 *   MEDIA_KEY   shared secret the API sends as `x-media-key`
 *   MEDIA_PORT  port to listen on (default 8081)
 */

const mediaDir = path.resolve(process.env.MEDIA_DIR ?? "media");
const mediaKey = process.env.MEDIA_KEY ?? "";
const port = Number.parseInt(process.env.MEDIA_PORT ?? "8081", 10);

const MAX_BYTES = 50 * 1024 * 1024;

if (!mediaKey) {
  console.error("[media] MEDIA_KEY is not set — refusing to start.");
  console.error("        It must match MEDIA_INGEST_KEY on the API host.\n");
  process.exit(1);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`[media] MEDIA_PORT must be a valid port, received "${process.env.MEDIA_PORT}"`);
  process.exit(1);
}

fs.mkdirSync(mediaDir, { recursive: true });

/**
 * Constant-time comparison, so the length of the match cannot be measured
 * from response timing to recover the key byte by byte.
 */
function keyMatches(provided: string): boolean {
  const expected = Buffer.from(mediaKey, "utf8");
  const actual = Buffer.from(provided, "utf8");
  // timingSafeEqual throws on a length mismatch, so compare lengths first —
  // the length itself is not secret.
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(
  helmet({
    // Media is embedded by the app on a different origin than this one.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
  })
);

// Ingest is rate limited so a leaked URL cannot be used to fill the disk.
const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Too many uploads" });
  },
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), dir: mediaDir });
});

/** Streams a stored file, with Range support so <video> seeking works. */
app.get("/media/:filename", (req, res) => {
  const name = safeUploadName(String(req.params.filename));
  if (!name) {
    res.status(400).json({ error: "Invalid media name" });
    return;
  }

  const file = path.join(mediaDir, name);
  if (!fs.existsSync(file)) {
    res.status(404).json({ error: "Media not found" });
    return;
  }

  res.setHeader("Content-Type", contentTypeForName(name));
  res.setHeader("Cache-Control", "public, max-age=1d");
  // sendFile handles Range, ETag and Last-Modified for us.
  res.sendFile(file);
});

app.put(
  "/media/:filename",
  ingestLimiter,
  (req, res) => {
    const name = safeUploadName(String(req.params.filename));
    if (!name) {
      res.status(400).json({ error: "Invalid media name" });
      return;
    }

    const provided = req.header("x-media-key") ?? "";
    if (!keyMatches(provided)) {
      res.status(401).json({ error: "Invalid media key" });
      return;
    }

    const declared = Number.parseInt(req.header("content-length") ?? "0", 10);
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      res.status(413).json({ error: "File too large" });
      return;
    }

    const target = path.join(mediaDir, name);
    const temp = `${target}.part`;
    const out = fs.createWriteStream(temp);

    let received = 0;
    let failed = false;

    const fail = (status: number, message: string): void => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.destroy();
      fs.rm(temp, { force: true }, () => {
        res.status(status).json({ error: message });
      });
    };

    req.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > MAX_BYTES) fail(413, "File too large");
    });

    req.on("error", () => fail(400, "Upload interrupted"));
    out.on("error", () => fail(500, "Could not write file"));

    out.on("finish", () => {
      if (failed) return;
      fs.rename(temp, target, (err) => {
        if (err) {
          fs.rm(temp, { force: true }, () => {
            res.status(500).json({ error: "Could not store file" });
          });
          return;
        }
        res.status(201).json({ size: received });
      });
    });

    req.pipe(out);
  }
);

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`[media] serving ${mediaDir} on 127.0.0.1:${port}`);
  console.log(`[media] expose it publicly with: tailscale funnel --bg ${port}`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`\n[media] ${signal} received, shutting down...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}