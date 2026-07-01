import { Router } from "express";
import { getOne, run, getAll } from "../database/init.js";

export const channelsRouter = Router();

channelsRouter.post("/", (req, res) => {
  const { serverId, name, type, category } = req.body;
  if (!serverId || !name) return res.status(400).json({ error: "serverId and name required" });

  const memberCheck = getOne("SELECT * FROM server_members WHERE server_id = ? AND user_id = ?", [serverId, req.userId]);
  if (!memberCheck) return res.status(403).json({ error: "Not a member of this server" });

  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
  const existing = getOne("SELECT id FROM channels WHERE id = ? AND server_id = ?", [id, serverId]);
  if (existing) return res.status(409).json({ error: "Channel already exists" });

  const channelType = type === "voice" ? "voice" : "text";
  const maxPos = getOne("SELECT MAX(position) as max_pos FROM channels WHERE server_id = ?", [serverId]);
  const position = (maxPos?.max_pos || 0) + 1;

  run("INSERT INTO channels (id, server_id, name, type, category, position) VALUES (?, ?, ?, ?, ?, ?)",
    [id, serverId, name, channelType, category || "", position]);

  res.status(201).json({ id, server_id: serverId, name, type: channelType, category: category || "", position });
});

channelsRouter.delete("/:serverId/:channelId", (req, res) => {
  const { serverId, channelId } = req.params;
  const server = getOne("SELECT * FROM servers WHERE id = ?", [serverId]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  if (server.owner_id !== req.userId) return res.status(403).json({ error: "Only the server owner can delete channels" });

  run("DELETE FROM channels WHERE id = ? AND server_id = ?", [channelId, serverId]);
  res.json({ success: true });
});
