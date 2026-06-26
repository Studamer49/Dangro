import { Router } from "express";
import { getOne, run } from "../database/init.js";

export const channelsRouter = Router();

channelsRouter.post("/", (req, res) => {
  const { serverId, name } = req.body;
  if (!serverId || !name) return res.status(400).json({ error: "serverId and name required" });
  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
  const existing = getOne("SELECT id FROM channels WHERE id = ? AND server_id = ?", [id, serverId]);
  if (existing) return res.status(409).json({ error: "Channel already exists" });
  run("INSERT INTO channels (id, server_id, name) VALUES (?, ?, ?)", [id, serverId, name]);
  res.status(201).json({ id, server_id: serverId, name });
});
