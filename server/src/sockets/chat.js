import { getDb, getAll, getOne, run, saveDb } from "../database/init.js";

export function registerChatHandlers(io, socket) {
  socket.on("join:chat", (chatKey) => {
    socket.join(chatKey);
    socket.data.chatKey = chatKey;
  });

  socket.on("leave:chat", (chatKey) => {
    socket.leave(chatKey);
  });

  socket.on("message:send", (data) => {
    const { chatKey, sender, content, isImage, replyTo } = data;
    if (!chatKey || !sender || !content) return;

    const id = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const now = new Date();
    const timestamp = now.toLocaleString("en-US", {
      weekday: "long",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    run(
      "INSERT INTO messages (id, chat_key, sender, content, timestamp, is_image, system, reply_to_sender, reply_to_content) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
      [id, chatKey, sender, content, timestamp, isImage ? 1 : 0, replyTo?.sender || null, replyTo?.content || null]
    );

    const msg = {
      id,
      sender,
      content,
      timestamp,
      isImage: !!isImage,
      system: false,
      reactions: {},
      replyTo: replyTo || null,
    };

    io.to(chatKey).emit("message:new", msg);
  });

  socket.on("message:react", (data) => {
    const { messageId, emoji, username } = data;
    if (!messageId || !emoji || !username) return;

    const existing = getOne("SELECT username FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?", [messageId, emoji, username]);

    if (existing) {
      run("DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?", [messageId, emoji, username]);
    } else {
      run("INSERT OR IGNORE INTO reactions (message_id, emoji, username) VALUES (?, ?, ?)", [messageId, emoji, username]);
    }

    const reactions = getAll("SELECT emoji, username FROM reactions WHERE message_id = ?", [messageId]);
    const grouped = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r.username);
    }

    io.to(socket.data.chatKey || "general").emit("message:updated", { messageId, reactions: grouped });
  });

  socket.on("typing:start", (data) => {
    const { chatKey, username } = data;
    socket.to(chatKey).emit("typing:update", { username, isTyping: true });
  });

  socket.on("typing:stop", (data) => {
    const { chatKey, username } = data;
    socket.to(chatKey).emit("typing:update", { username, isTyping: false });
  });
}
