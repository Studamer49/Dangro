import { getAll, getOne, run } from "../database/init.js";

const onlineUsers = new Map();
const typingTimeouts = new Map();

export function registerChatHandlers(io, socket) {
  const username = socket.username || "unknown";
  const userId = socket.userId;

  onlineUsers.set(userId, { socketId: socket.id, username, userId, status: "online" });
  io.emit("presence:update", { userId, username, status: "online" });

  socket.on("join:chat", (chatKey) => {
    socket.join(chatKey);
    socket.data.chatKey = chatKey;
  });

  socket.on("leave:chat", (chatKey) => {
    socket.leave(chatKey);
  });

  socket.on("message:send", (data) => {
    const { chatKey, sender, content, isImage, replyTo, attachments } = data;
    if (!chatKey || !sender || !content) return;

    const id = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const timestamp = new Date().toISOString();

    run(
      `INSERT INTO messages (id, chat_key, sender, content, timestamp, is_image, system, reply_to_sender, reply_to_content, attachments)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        id, chatKey, sender, content, timestamp, isImage ? 1 : 0,
        replyTo?.sender || null, replyTo?.content || null,
        attachments ? JSON.stringify(attachments) : null,
      ]
    );

    io.to(chatKey).emit("message:new", {
      id,
      chatKey,
      sender,
      content,
      timestamp,
      isImage: !!isImage,
      system: false,
      reactions: {},
      replyTo: replyTo || null,
      attachments: attachments || [],
      editedAt: null,
    });
  });

  socket.on("message:edit", (data) => {
    const { messageId, content } = data;
    if (!messageId || !content) return;

    const existing = getOne("SELECT * FROM messages WHERE id = ?", [messageId]);
    if (!existing) return;

    run("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?",
      [content, new Date().toISOString(), messageId]);

    io.to(socket.data.chatKey || "general").emit("message:updated", {
      messageId,
      content,
      editedAt: new Date().toISOString(),
    });
  });

  socket.on("message:delete", (data) => {
    const { messageId } = data;
    if (!messageId) return;

    run("DELETE FROM messages WHERE id = ?", [messageId]);
    io.to(socket.data.chatKey || "general").emit("message:deleted", { messageId });
  });

  socket.on("message:react", (data) => {
    const { messageId, emoji, username } = data;
    if (!messageId || !emoji || !username) return;

    const existing = getOne(
      "SELECT username FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?",
      [messageId, emoji, username]
    );

    if (existing) {
      run("DELETE FROM reactions WHERE message_id = ? AND emoji = ? AND username = ?",
        [messageId, emoji, username]);
    } else {
      run("INSERT OR IGNORE INTO reactions (message_id, emoji, username) VALUES (?, ?, ?)",
        [messageId, emoji, username]);
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

    const key = chatKey + "_" + username;
    if (typingTimeouts.has(key)) clearTimeout(typingTimeouts.get(key));
    typingTimeouts.set(key, setTimeout(() => {
      socket.to(chatKey).emit("typing:update", { username, isTyping: false });
      typingTimeouts.delete(key);
    }, 4000));
  });

  socket.on("typing:stop", (data) => {
    const { chatKey, username } = data;
    socket.to(chatKey).emit("typing:update", { username, isTyping: false });

    const key = chatKey + "_" + username;
    if (typingTimeouts.has(key)) {
      clearTimeout(typingTimeouts.get(key));
      typingTimeouts.delete(key);
    }
  });

  socket.on("presence:status", (data) => {
    const { status } = data;
    const user = onlineUsers.get(userId);
    if (user) {
      user.status = status;
      onlineUsers.set(userId, user);
    }
    io.emit("presence:update", { userId, username, status });
  });

  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("presence:update", { userId, username, status: "offline" });
  });
}

export function getOnlineUsers() {
  return Array.from(onlineUsers.values());
}
