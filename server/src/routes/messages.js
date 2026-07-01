import { Router } from "express";
import { getAll, getOne, run } from "../database/init.js";

export const messagesRouter = Router();

function formatMessage(msg) {
  const reactions = getAll("SELECT emoji, username FROM reactions WHERE message_id = ?", [msg.id]);
  const grouped = {};
  for (const r of reactions) {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r.username);
  }
  return {
    id: msg.id,
    chatKey: msg.chat_key,
    sender: msg.sender,
    content: msg.content,
    timestamp: msg.timestamp,
    editedAt: msg.edited_at || null,
    isImage: !!msg.is_image,
    system: !!msg.system,
    reactions: grouped,
    replyTo: msg.reply_to_sender ? { sender: msg.reply_to_sender, content: msg.reply_to_content } : null,
    attachments: msg.attachments ? JSON.parse(msg.attachments) : [],
  };
}

messagesRouter.get("/:chatKey", (req, res) => {
  const { limit, before, after } = req.query;
  const pageSize = Math.min(parseInt(limit) || 50, 100);
  const chatKey = req.params.chatKey;

  let sql = "SELECT * FROM messages WHERE chat_key = ?";
  const params = [chatKey];
  const order = [];

  if (before) {
    sql += " AND rowid < (SELECT rowid FROM messages WHERE id = ?)";
    params.push(before);
    order.push("DESC");
  } else if (after) {
    sql += " AND rowid > (SELECT rowid FROM messages WHERE id = ?)";
    params.push(after);
    order.push("ASC");
  } else {
    order.push("DESC");
  }

  sql += ` ORDER BY rowid ${order[0]}`;
  sql += " LIMIT ?";
  params.push(pageSize + 1);

  const messages = getAll(sql, params);
  const hasMore = messages.length > pageSize;
  if (hasMore) messages.pop();

  if (order[0] === "DESC") messages.reverse();

  const total = getOne("SELECT COUNT(*) as count FROM messages WHERE chat_key = ?", [chatKey])?.count || 0;

  res.json({
    messages: messages.map(formatMessage),
    hasMore,
    total,
    nextCursor: messages.length > 0 ? messages[order[0] === "DESC" ? 0 : messages.length - 1].id : null,
  });
});

messagesRouter.post("/", (req, res) => {
  const { chatKey, sender, content, isImage, replyTo, attachments } = req.body;
  if (!chatKey || !sender || !content) {
    return res.status(400).json({ error: "chatKey, sender, and content required" });
  }

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

  const msg = getOne("SELECT * FROM messages WHERE id = ?", [id]);
  res.status(201).json(formatMessage(msg));
});

messagesRouter.patch("/:id", (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: "Content required" });

  const msg = getOne("SELECT * FROM messages WHERE id = ?", [req.params.id]);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  run("UPDATE messages SET content = ?, edited_at = ? WHERE id = ?", [content, new Date().toISOString(), req.params.id]);
  const updated = getOne("SELECT * FROM messages WHERE id = ?", [req.params.id]);
  res.json(formatMessage(updated));
});

messagesRouter.delete("/:id", (req, res) => {
  const msg = getOne("SELECT * FROM messages WHERE id = ?", [req.params.id]);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  run("DELETE FROM messages WHERE id = ?", [req.params.id]);
  res.json({ success: true, messageId: req.params.id });
});
