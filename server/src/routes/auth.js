import { Router } from "express";
import { getDb, getOne, run } from "../database/init.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = getOne("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
  if (user) {
    res.json({ success: true, username: user.username, displayName: user.display_name });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

authRouter.post("/signup", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });
  if (username.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (password.length < 4) return res.status(400).json({ error: "Password must be at least 4 characters" });
  const existing = getOne("SELECT username FROM users WHERE username = ?", [username]);
  if (existing) return res.status(409).json({ error: "Username already taken" });
  run("INSERT INTO users (username, password, display_name, bio, status, custom_status, profile_pic) VALUES (?, ?, ?, '', 'online', '', '')",
    [username, password, username]);
  res.status(201).json({ success: true, username });
});
