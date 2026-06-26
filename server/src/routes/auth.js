import { Router } from "express";
import { getDb, getOne } from "../database/init.js";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body;
  const user = getOne("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
  if (user) {
    res.json({ success: true, username: user.username });
  } else {
    res.status(401).json({ success: false, error: "Invalid credentials" });
  }
});

authRouter.post("/guest", (req, res) => {
  res.json({ success: true, username: "guest" });
});
