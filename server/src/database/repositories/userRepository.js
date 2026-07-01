import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcryptjs";
import { getOne, getAll, run } from "../manager.js";

export const UserRepository = {
  findById(id) {
    return getOne("SELECT * FROM users WHERE id = ?", [id]);
  },

  findByUsername(username) {
    return getOne("SELECT * FROM users WHERE username = ?", [username]);
  },

  findByEmail(email) {
    return getOne("SELECT * FROM users WHERE email = ?", [email]);
  },

  async create({ username, email, password }) {
    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    run(
      `INSERT INTO users (id, username, email, password_hash, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
      [id, username, email || "", passwordHash, username]
    );
    return this.findById(id);
  },

  async updatePassword(id, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    run("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?", [passwordHash, id]);
  },

  updateProfile(id, fields) {
    const allowed = ["display_name", "bio", "status", "custom_status", "profile_pic", "theme"];
    const updates = [];
    const values = [];
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        updates.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }
    if (updates.length === 0) return this.findById(id);
    updates.push("updated_at = datetime('now')");
    values.push(id);
    run(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, values);
    return this.findById(id);
  },

  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  },

  search(query, excludeId) {
    const q = `%${query}%`;
    if (excludeId) {
      return getAll("SELECT id, username, display_name, status, custom_status, profile_pic FROM users WHERE (username LIKE ? OR display_name LIKE ?) AND id != ? LIMIT 20", [q, q, excludeId]);
    }
    return getAll("SELECT id, username, display_name, status, custom_status, profile_pic FROM users WHERE username LIKE ? OR display_name LIKE ? LIMIT 20", [q, q]);
  }
};
