import { v4 as uuidv4 } from "uuid";
import { getOne, getAll, run } from "../manager.js";

export const TokenRepository = {
  create(userId, token, expiresAt) {
    const id = uuidv4();
    run(
      "INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)",
      [id, userId, token, expiresAt]
    );
    return { id, token, expiresAt };
  },

  findByToken(token) {
    return getOne(
      "SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > datetime('now')",
      [token]
    );
  },

  findByUserId(userId) {
    return getAll(
      "SELECT * FROM refresh_tokens WHERE user_id = ? AND expires_at > datetime('now') ORDER BY created_at DESC",
      [userId]
    );
  },

  deleteByToken(token) {
    run("DELETE FROM refresh_tokens WHERE token = ?", [token]);
  },

  deleteAllForUser(userId) {
    run("DELETE FROM refresh_tokens WHERE user_id = ?", [userId]);
  },

  cleanup() {
    run("DELETE FROM refresh_tokens WHERE expires_at <= datetime('now')");
  }
};
