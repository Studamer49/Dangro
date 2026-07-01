import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { initDatabase } from "./database/init.js";
import { registerChatHandlers } from "./sockets/chat.js";
import { authenticateToken } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { serversRouter } from "./routes/servers.js";
import { channelsRouter } from "./routes/channels.js";
import { messagesRouter } from "./routes/messages.js";
import { friendsRouter } from "./routes/friends.js";
import { uploadRouter } from "./routes/upload.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const RAW_ORIGINS = process.env.CORS_ORIGIN || "http://localhost:5173";
const CORS_ORIGINS = RAW_ORIGINS.split(",").map(s => s.trim()).filter(Boolean);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "../uploads");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGINS, methods: ["GET", "POST"], credentials: true },
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));
app.use(express.json({ limit: "10mb" }));

if (process.env.NODE_ENV !== "production") {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const ms = Date.now() - start;
      console.log(`${req.method} ${req.path} ${res.statusCode} ${ms}ms`);
    });
    next();
  });
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use("/api/auth", limiter);

app.use("/uploads", express.static(UPLOAD_DIR));

const publicDir = path.join(__dirname, "../public");
if (process.env.NODE_ENV === "production" && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/servers", authenticateToken, serversRouter);
app.use("/api/channels", authenticateToken, channelsRouter);
app.use("/api/messages", authenticateToken, messagesRouter);
app.use("/api/friends", authenticateToken, friendsRouter);
app.use("/api/upload", uploadRouter);

app.use((req, res) => {
  if (process.env.NODE_ENV === "production" && fs.existsSync(publicDir)) {
    const indexPath = path.join(publicDir, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
  }
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) {
    return next(new Error("Authentication required"));
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dangro-dev-jwt-secret");
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  registerChatHandlers(io, socket);
});

function gracefulShutdown() {
  console.log("Shutting down gracefully...");
  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

initDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Dangro server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
