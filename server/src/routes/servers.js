import { Router } from "express";
import { getAll, getOne, run } from "../database/init.js";

export const serversRouter = Router();

serversRouter.get("/", (req, res) => {
  const servers = getAll("SELECT * FROM servers");
  for (const server of servers) {
    server.channels = getAll("SELECT * FROM channels WHERE server_id = ?", [server.id]);
  }
  res.json(servers);
});

serversRouter.post("/", (req, res) => {
  const { name, icon } = req.body;
  if (!name) return res.status(400).json({ error: "Server name required" });
  const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const existing = getOne("SELECT id FROM servers WHERE id = ?", [id]);
  if (existing) return res.status(409).json({ error: "Server already exists" });
  run("INSERT INTO servers (id, name, icon) VALUES (?, ?, ?)", [id, name, icon || id.charAt(0).toUpperCase()]);
  run("INSERT INTO channels (id, server_id, name) VALUES ('general', ?, 'general')", [id]);
  const server = getOne("SELECT * FROM servers WHERE id = ?", [id]);
  server.channels = getAll("SELECT * FROM channels WHERE server_id = ?", [id]);
  res.status(201).json(server);
});

serversRouter.get("/:id", (req, res) => {
  const server = getOne("SELECT * FROM servers WHERE id = ?", [req.params.id]);
  if (!server) return res.status(404).json({ error: "Server not found" });
  server.channels = getAll("SELECT * FROM channels WHERE server_id = ?", [server.id]);
  res.json(server);
});
