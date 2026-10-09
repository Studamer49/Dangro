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
import { setupSocketHandlers } from "./socket/index.js";
import { setIO } from "./socket/io.js";

import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import friendRoutes from "./routes/friends.js";
import serverRoutes from "./routes/servers.js";
import channelRoutes from "./routes/channels.js";
import messageRoutes from "./routes/messages.js";
import dmRoutes from "./routes/dms.js";
import uploadRoutes from "./routes/uploads.js";
import mediaRoutes from "./routes/media.js";
import postRoutes from "./routes/posts.js";
import storyRoutes from "./routes/stories.js";
import followRoutes from "./routes/follows.js";
import notificationRoutes from "./routes/notifications.js";

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
  res.json({ success: true, data: { status: "ok", uptime: process.uptime() } });
});

app.use("/api", globalLimiter);
app.use("/api/auth", authLimiter);

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

// Anything under /api that no router matched is a 404, never the HTML shell.
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` } });
});

// On the MongoDB backend, media is streamed out of GridFS instead of disk.
// Mounted before the static handler so database-backed files win.
if (config.usesMongo) {
  app.use("/uploads", mediaRoutes);
}
app.use("/uploads", express.static(config.uploadDir, { fallthrough: true, maxAge: "1d" }));

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

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  console.error("[error] Unhandled promise rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[error] Uncaught exception:", err);
  process.exit(1);
});

if (!config.isTest) {
  void main();
}

export { app, httpServer, io };
