import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { initDatabase } from "./database/init.js";
import { registerChatHandlers } from "./sockets/chat.js";
import { serversRouter } from "./routes/servers.js";
import { channelsRouter } from "./routes/channels.js";
import { messagesRouter } from "./routes/messages.js";
import { friendsRouter } from "./routes/friends.js";
import { authRouter } from "./routes/auth.js";

const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CORS_ORIGIN, methods: ["GET", "POST"] },
});

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/servers", serversRouter);
app.use("/api/channels", channelsRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/friends", friendsRouter);

io.on("connection", (socket) => {
  registerChatHandlers(io, socket);
});

initDatabase().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Dangro server running on http://localhost:${PORT}`);
  });
});
