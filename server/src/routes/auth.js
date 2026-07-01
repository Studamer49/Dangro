import { Router } from "express";
import { UserRepository } from "../database/repositories/userRepository.js";
import { TokenRepository } from "../database/repositories/tokenRepository.js";
import { generateAccessToken, generateRefreshToken } from "../services/jwt.js";
import { authenticateToken } from "../middleware/auth.js";

export const authRouter = Router();

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.display_name,
    bio: user.bio,
    status: user.status,
    customStatus: user.custom_status,
    profilePic: user.profile_pic,
    theme: user.theme,
    createdAt: user.created_at,
  };
}

authRouter.post("/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    if (username.length < 2 || username.length > 32) {
      return res.status(400).json({ error: "Username must be between 2 and 32 characters" });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return res.status(400).json({ error: "Username can only contain letters, numbers, and underscores" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (email && !validateEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    const existingUser = UserRepository.findByUsername(username);
    if (existingUser) {
      return res.status(409).json({ error: "Username is already taken" });
    }

    if (email) {
      const existingEmail = UserRepository.findByEmail(email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email is already registered" });
      }
    }

    const user = await UserRepository.create({ username, email, password });
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.status(201).json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = UserRepository.findByUsername(username);
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const valid = await UserRepository.verifyPassword(user, password);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    res.json({
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      rememberMe: !!rememberMe,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/refresh", (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const stored = TokenRepository.findByToken(refreshToken);
    if (!stored) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = UserRepository.findById(stored.user_id);
    if (!user) {
      TokenRepository.deleteByToken(refreshToken);
      return res.status(401).json({ error: "User not found" });
    }

    TokenRepository.deleteByToken(refreshToken);
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    res.json({
      user: sanitizeUser(user),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.post("/logout", authenticateToken, (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      TokenRepository.deleteByToken(refreshToken);
    } else {
      TokenRepository.deleteAllForUser(req.userId);
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.get("/me", authenticateToken, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

authRouter.put("/me", authenticateToken, async (req, res) => {
  try {
    const { displayName, bio, status, customStatus, profilePic, theme } = req.body;
    const updates = {};
    if (displayName !== undefined) updates.display_name = displayName;
    if (bio !== undefined) updates.bio = bio;
    if (status !== undefined) updates.status = status;
    if (customStatus !== undefined) updates.custom_status = customStatus;
    if (profilePic !== undefined) updates.profile_pic = profilePic;
    if (theme !== undefined) updates.theme = theme;

    const user = UserRepository.updateProfile(req.userId, updates);
    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.put("/me/password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current password and new password are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const user = UserRepository.findById(req.userId);
    const valid = await UserRepository.verifyPassword(user, currentPassword);
    if (!valid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    await UserRepository.updatePassword(req.userId, newPassword);
    TokenRepository.deleteAllForUser(req.userId);

    res.json({ success: true, message: "Password updated. Please log in again." });
  } catch (err) {
    console.error("Password change error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

authRouter.get("/users/search", authenticateToken, (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 1) {
    return res.json([]);
  }
  const users = UserRepository.search(q, req.userId);
  res.json(users.map(u => ({
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    status: u.status,
    customStatus: u.custom_status,
    profilePic: u.profile_pic,
  })));
});
