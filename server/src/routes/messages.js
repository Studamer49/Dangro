import { Router } from "express";
import { getAll, getOne, run } from "../database/init.js";

export const messagesRouter = Router();

messagesRouter.get("/:chatKey", (req, res) => {
  const messages = getAll("SELECT * FROM messages WHERE chat_key = ? ORDER BY rowid ASC", [req.params.chatKey]);
  for (const msg of messages) {
    const reactions = getAll("SELECT emoji, username FROM reactions WHERE message_id = ?", [msg.id]);
    const grouped = {};
    for (const r of reactions) {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r.username);
    }
    msg.reactions = grouped;
    msg.isImage = !!msg.is_image;
    msg.system = !!msg.system;
    msg.replyTo = msg.reply_to_sender ? { sender: msg.reply_to_sender, content: msg.reply_to_content } : null;
    delete msg.is_image;
    delete msg.reply_to_sender;
    delete msg.reply_to_content;
  }
  res.json(messages);
});

messagesRouter.post("/", (req, res) => {
  const { chatKey, sender, content, isImage, replyTo } = req.body;
  if (!chatKey || !sender || !content) return res.status(400).json({ error: "chatKey, sender, and content required" });
  const id = "msg_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const timestamp = new Date().toLocaleString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", hour12: true });
  run(
    "INSERT INTO messages (id, chat_key, sender, content, timestamp, is_image, system, reply_to_sender, reply_to_content) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    [id, chatKey, sender, content, timestamp, isImage ? 1 : 0, replyTo?.sender || null, replyTo?.content || null]
  );
  const msg = getOne("SELECT * FROM messages WHERE id = ?", [id]);
  msg.isImage = !!msg.is_image;
  msg.system = false;
  msg.reactions = {};
  msg.replyTo = replyTo || null;
  delete msg.is_image;
  delete msg.reply_to_sender;
  delete msg.reply_to_content;
  res.status(201).json(msg);
});
