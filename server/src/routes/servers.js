import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import { getAll, getOne, run } from "../database/init.js";

export const serversRouter = Router();

serversRouter.get("/", (req, res) => {
  const userId = req.userId;
  const servers = getAll(`
    SELECT s.* FROM servers s
    JOIN server_members sm ON s.id = sm.server_id
    WHERE sm.user_id = ?
    ORDER BY s.name ASC
  `, [userId]);
  for (const server of servers) {
    server.channels = getAll("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC", [server.id]);
    server.memberCount = getOne("SELECT COUNT(*) as count FROM server_members WHERE server_id = ?", [server.id])?.count || 0;
  }
  res.json(servers);
});

serversRouter.post("/", (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: "Server name required" });
  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") + "_" + Date.now();
  const inviteCode = crypto.randomBytes(6).toString("hex");

  run("INSERT INTO servers (id, name, icon, owner_id, invite_code) VALUES (?, ?, ?, ?, ?)",
    [id, name, icon || id.charAt(0).toUpperCase(), req.userId, inviteCode]);
  run("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)", [id, req.userId]);
  run("INSERT INTO channels (id, server_id, name, position) VALUES ('general', ?, 'general', 0)", [id]);

  const server = getOne("SELECT * FROM servers WHERE id = ?", [id]);
  server.channels = getAll("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC", [id]);
  server.memberCount = 1;
  res.status(201).json(server);
});

serversRouter.get("/:id", (req, res) => {
  const server = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  server.channels = getAll("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC", [server.id]);
  server.members = getAll("SELECT u.id, u.username, u.display_name, u.status, u.custom_status, u.profile_pic FROM server_members sm JOIN users u ON sm.user_id = u.id WHERE sm.server_id = ?", [server.id]);
  res.json(server);
});

serversRouter.patch("/:id", (req, res) => {
  const { name, icon } = req.body;
  const server = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (server.owner_id !== req.userId) return res.status(403).json({ error: "Only the server owner can edit this server" });

  if (name) run("UPDATE servers SET name = ? WHERE id = ?", [name, req.params.id]);
  if (icon !== undefined) run("UPDATE servers SET icon = ? WHERE id = ?", [icon, req.params.id]);

  const updated = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  updated.channels = getAll("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC", [updated.id]);
  res.json(updated);
});

serversRouter.delete("/:id", (req, res) => {
  const server = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (server.owner_id !== req.userId) return res.status(403).json({ error: "Only the server owner can delete this server" });

  run("DELETE FROM servers WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

serversRouter.post("/join/:code", (req, res) => {
  const server = getOne("SELECT * FROM servers WHERE invite_code = ?", [req.params.code]);
  if (!server) return res.status(404).json({ error: "Invalid invite code" });

  const existing = getOne("SELECT * FROM server_members WHERE server_id = ? AND user_id = ?", [server.id, req.userId]);
  if (existing) return res.status(409).json({ error: "Already a member of this server" });

  run("INSERT INTO server_members (server_id, user_id) VALUES (?, ?)", [server.id, req.userId]);
  server.channels = getAll("SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC", [server.id]);
  res.json(server);
});

serversRouter.post("/:id/leave", (req, res) => {
  const server = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (server.owner_id === req.userId) {
    return res.status(400).json({ error: "Server owner cannot leave. Transfer ownership or delete the server." });
  }

  run("DELETE FROM server_members WHERE server_id = ? AND user_id = ?", [req.params.id, req.userId]);
  res.json({ success: true });
});
