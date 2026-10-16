import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { config, isAllowedOrigin } from "./config.js";
import { prisma } from "./prisma.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { buildCspDirectives } from "./lib/csp.js";
import { checkCloudinaryConnection } from "./lib/cloudinary.js";
import { setupSocketHandlers } from "./socket/index.js";
import { setIO } from "./socket/io.js";
import { ensureIndexes, backfillServerLayout, backfillServerRoles } from "./db/mongoIndexes.js";
import { mongoClient } from "./prisma.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import serverRoutes from "./routes/servers.js";
import serverSettingsRoutes from "./routes/serverSettings.js";
import inviteRoutes from "./routes/invites.js";
import categoryRoutes from "./routes/categories.js";
import roleRoutes from "./routes/roles.js";
import channelRoutes from "./routes/channels.js";
import messageRoutes from "./routes/messages.js";
import dmRoutes from "./routes/dms.js";
import uploadRoutes from "./routes/uploads.js";
import mediaRoutes from "./routes/media.js";
import postRoutes from "./routes/posts.js";
import storyRoutes from "./routes/stories.js";
import followRoutes from "./routes/follows.js";
import notificationRoutes from "./routes/notifications.js";
import blockRoutes from "./routes/blocks.js";
import turnRoutes from "./routes/turn.js";

const app = express();
const httpServer = createServer(app);

// Render (and every other reverse proxy) sits in front of this service.
// Without this, req.ip is the proxy and every caller shares one rate-limit bucket.
app.set("trust proxy", 1);

const io = new SocketServer(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, undefined)),
    credentials: true,
  },
  allowRequest: (req, callback) => {
    callback(null, isAllowedOrigin(req.headers.origin, req.headers.host));
  },
});

setIO(io);

app.use(
  helmet({
    // Uploaded media must be embeddable by the app itself.
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      // helmet's defaults only allow this origin. The remote media host is a
      // different origin, so it has to be named explicitly or every image and
      // video is blocked in the browser while the request itself succeeds.
      directives: buildCspDirectives(
        config.mediaProvider === "remote" ? config.mediaPublicUrl : ""
      ),
    },
  })
);

// The `cors` package only hands the origin header to its callback, so the
// same-host allowance is wired up here with access to the incoming request.
app.use((req, res, next) => {
  cors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin, req.headers.host)),
    credentials: true,
  })(req, res, next);
});

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: false, limit: "2mb" }));
app.use(cookieParser());

const jsonResponse = (code: "RATE_LIMITED", message: string) =>
  ({ success: false, error: { code, message } }) as const;

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => config.isTest || req.path === "/health",
  handler: (_req, res) => {
    res.status(429).json(jsonResponse("RATE_LIMITED", "Too many requests. Please try again later."));
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => config.isTest,
  handler: (_req, res) => {
    res.status(429).json(jsonResponse("RATE_LIMITED", "Too many login attempts. Please try again later."));
  },
});

app.get("/api/health", (_req, res) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      uptime: process.uptime(),
      database: config.usesMongo ? "mongo" : "postgres",
      /**
       * Whether images can actually be stored. The API answers 200 either
       * way — an operator with broken image storage has a live site, and the
       * health check turning red would take the whole site down instead of
       * pointing at the one broken part.
       */
      imageStorage: config.cloudinary.configured ? "cloudinary" : "unconfigured",
    },
  });
});

app.use("/api", globalLimiter);

// Only the endpoints that take a password are limited. Covering the whole
// /api/auth prefix also counted /auth/me and /auth/refresh, which a client
// with a few tabs polling hits constantly — enough to exhaust the budget and
// then lock the same user out of both login and silent refresh.
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// These three declare `/servers/...` paths in full, so they are mounted at the
// API root — mounting them under `/api/servers` would resolve them to
// `/api/servers/servers/...`. They are registered before `serverRoutes` so the
// more specific settings/invite paths win over its `/:id` catch-all.
app.use("/api", inviteRoutes);
app.use("/api", categoryRoutes);
app.use("/api", roleRoutes);
app.use("/api", serverSettingsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/servers", serverRoutes);
app.use("/api/channels", channelRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/dms", dmRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/follows", followRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/blocks", blockRoutes);
app.use("/api/turn", turnRoutes);

// Anything under /api that no router matched is a 404, never the HTML shell.
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
});

// Disk uploads are answered by express.static first. Anything it cannot find —
// a GridFS file, or media still living on a separate host — falls through to
// the store router, which streams or redirects it and 404s if it is genuinely
// gone.
//
// The order matters in both directions. Static first means a file left on disk
// is never shadowed by a store that has no record of it, which is what happens
// the moment you switch provider: switching to gridfs while uploads are still
// in server/uploads made every existing image 404. The router stays mounted
// only when the active store needs it (the disk store returns null from
// `resolve`), and stays *after* static so a missing file gets a JSON 404 rather
// than the SPA shell.
app.use("/uploads", express.static(config.uploadDir, { fallthrough: true, maxAge: "1d" }));
if (config.mediaProvider !== "disk") {
  app.use("/uploads", mediaRoutes);
}

const clientDistPath = path.resolve(__dirname, "../../client/dist");
const hasClientBuild = fs.existsSync(path.join(clientDistPath, "index.html"));

if (hasClientBuild) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
} else if (config.isProduction) {
  console.warn("[startup] client/dist is missing — the SPA will not be served.");
}

// Registered last: everything above it already handled the request.
app.use(errorHandler);

setupSocketHandlers(io);

async function main(): Promise<void> {
  try {
    await prisma.$connect();
    console.log(
      `Connected to database (${config.usesMongo ? `MongoDB ${config.mongoDbName} @ ${config.mongoUri}` : "PostgreSQL via Prisma"})`
    );

    if (config.usesMongo && mongoClient) {
      // MongoDB enforces nothing on its own, so the unique and foreign-key
      // indexes declared in mongoSchema.ts are applied on every boot.
      await ensureIndexes(mongoClient.db(config.mongoDbName));
      console.log("MongoDB indexes verified");

      // Servers created before categories existed would otherwise show every
      // channel in one unsorted, uncategorised group.
      await backfillServerLayout(mongoClient.db(config.mongoDbName));

      // Servers created before roles existed would otherwise fail every
      // permission check and lock their own admins out.
      await backfillServerRoles(mongoClient.db(config.mongoDbName));
    }

    /**
     * Says out loud, once per boot, whether images will work.
     *
     * Every other symptom of a broken Cloudinary setup is invisible from the
     * outside: the API starts, the site loads, posts and messages work, and
     * the only evidence is a toast in a browser that happens to try an image
     * upload. This is the one line that turns that into a visible boot log —
     * including the case where the credentials exist but Cloudinary rejects
     * them, which otherwise stays hidden until the first real upload.
     *
     * Deliberately not fatal: images are one feature, and the rest of the app
     * must keep serving while an operator fixes this.
     */
    void checkCloudinaryConnection().then((check) => {
      if (!check.configured) {
        console.warn(
          `[startup] Image uploads are DISABLED — Cloudinary is not configured (missing ${config.cloudinary.missingVars.join(", ")}). Set them in server/.env or in the service environment.`
        );
      } else if (check.reachable) {
        console.log(
          `[startup] Image uploads: Cloudinary OK (${check.detail}), folder "${config.cloudinary.folder}", credentials from ${config.cloudinary.credentialSource}`
        );
      } else {
        console.error(
          `[startup] Image uploads are CONFIGURED BUT NOT WORKING — Cloudinary rejected the credentials (${check.detail}). Check CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.`
        );
      }
    });

    httpServer.listen(config.port, () => {
      console.log(`Server running on port ${config.port}`);
      console.log(`Serving ${hasClientBuild ? "client build + " : ""}API from the same origin`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

function shutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down...`);
  httpServer.close(() => {
    prisma
      .$disconnect()
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

if (!config.isTest) {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("[error] Unhandled promise rejection:", reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("[error] Uncaught exception:", err);
    process.exit(1);
  });

  void main();
}

export { app, httpServer, io };
