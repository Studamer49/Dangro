import { Router } from "express";
import { getAll, getOne, run } from "../database/init.js";

export const friendsRouter = Router();

friendsRouter.get("/", (req, res) => {
  const friends = getAll("SELECT * FROM friends ORDER BY username ASC");
  res.json(friends);
});

friendsRouter.post("/", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });
  const existing = getOne("SELECT id FROM friends WHERE username = ?", [username]);
  if (existing) return res.status(409).json({ error: "Already exists" });
  const id = "friend_" + Date.now();
  const disc = Math.floor(1000 + Math.random() * 9000).toString();
  run("INSERT INTO friends (id, username, discriminator, status, custom_status, avatar_color) VALUES (?, ?, ?, 'pending_out', 'Waiting...', '#555')", [id, username, disc]);
  const friend = getOne("SELECT * FROM friends WHERE id = ?", [id]);
  res.status(201).json(friend);
});

friendsRouter.delete("/:id", (req, res) => {
  run("DELETE FROM friends WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

friendsRouter.patch("/:id", (req, res) => {
  const { status, customStatus } = req.body;
  if (status) run("UPDATE friends SET status = ? WHERE id = ?", [status, req.params.id]);
  if (customStatus !== undefined) run("UPDATE friends SET custom_status = ? WHERE id = ?", [customStatus, req.params.id]);
  const friend = getOne("SELECT * FROM friends WHERE id = ?", [req.params.id]);
  res.json(friend);
});
