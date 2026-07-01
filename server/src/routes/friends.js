import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { getAll, getOne, run } from "../database/init.js";
import { UserRepository } from "../database/repositories/userRepository.js";

export const friendsRouter = Router();

friendsRouter.get("/", (req, res) => {
  const userId = req.userId;
  const friends = getAll(`
    SELECT f.id, u.id as user_id, u.username, u.display_name, u.status, u.custom_status, u.profile_pic,
           f.status as friendship_status, f.created_at
    FROM friendships f
    JOIN users u ON (CASE WHEN f.user_id = ? THEN f.friend_id ELSE f.user_id END) = u.id
    WHERE (f.user_id = ? OR f.friend_id = ?)
    ORDER BY u.username ASC
  `, [userId, userId, userId]);
  res.json(friends.map(f => ({
    id: f.id,
    username: f.username,
    displayName: f.display_name,
    status: f.friendship_status === "accepted" ? f.status : f.friendship_status,
    customStatus: f.custom_status,
    avatarColor: "#555",
    profilePic: f.profile_pic,
  })));
});

friendsRouter.post("/", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "Username required" });

  const targetUser = UserRepository.findByUsername(username);
  if (!targetUser) return res.status(404).json({ error: "User not found" });
  if (targetUser.id === req.userId) return res.status(400).json({ error: "Cannot add yourself" });

  const existing = getOne(
    "SELECT id FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)",
    [req.userId, targetUser.id, targetUser.id, req.userId]
  );
  if (existing) return res.status(409).json({ error: "Friend request already exists" });

  const id = uuidv4();
  run("INSERT INTO friendships (id, user_id, friend_id, status) VALUES (?, ?, ?, 'pending')",
    [id, req.userId, targetUser.id]);

  res.status(201).json({
    id,
    username: targetUser.username,
    displayName: targetUser.display_name,
    status: "pending_out",
    customStatus: "Waiting...",
    avatarColor: "#555",
  });
});

friendsRouter.delete("/:id", (req, res) => {
  run("DELETE FROM friendships WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

friendsRouter.patch("/:id", (req, res) => {
  const { status } = req.body;
  if (status === "accepted") {
    run("UPDATE friendships SET status = 'accepted', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  }
  const friend = getOne("SELECT * FROM friendships WHERE id = ?", [req.params.id]);
  res.json(friend);
});

friendsRouter.post("/:id/block", (req, res) => {
  run("UPDATE friendships SET status = 'blocked', updated_at = datetime('now') WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});

friendsRouter.post("/:id/unblock", (req, res) => {
  run("DELETE FROM friendships WHERE id = ?", [req.params.id]);
  res.json({ success: true });
});
