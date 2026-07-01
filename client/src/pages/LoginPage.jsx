import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

const ERRORS = {
  "Username and password are required": "Please fill in all fields",
  "Username must be between 2 and 32 characters": "Username must be 2-32 characters",
  "Username can only contain letters, numbers, and underscores": "Only letters, numbers, and underscores allowed",
  "Password must be at least 6 characters": "Password must be at least 6 characters",
  "Username is already taken": "That username is already taken",
  "Email is already registered": "That email is already in use",
  "Invalid email address": "Please enter a valid email",
  "Invalid username or password": "Incorrect username or password",
  "User not found": "Account not found",
};

function friendlyError(raw) {
  return ERRORS[raw] || raw || "Something went wrong. Please try again.";
}

export default function LoginPage() {
  const { login, signup } = useApp();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please fill in all required fields");
      return;
    }
    if (tab === "signup") {
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }
      if (username.length < 2 || username.length > 32) {
        setError("Username must be between 2 and 32 characters");
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        setError("Only letters, numbers, and underscores allowed");
        return;
      }
    }

    setLoading(true);
    try {
      if (tab === "login") {
        await login(username, password, rememberMe);
      } else {
        await signup(username, email, password);
      }
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">d</div>
          <h1 className="login-title">Dangro</h1>
          <p className="login-subtitle">
            {tab === "login" ? "Welcome back! Sign in to continue." : "Create your account to get started."}
          </p>
        </div>

        <div className="login-tabs">
          <button className={`login-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setError(""); }}>Sign In</button>
          <button className={`login-tab ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab("signup"); setError(""); }}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} className="login-form" autoComplete={tab === "login" ? "on" : "off"}>
          <div className="login-field">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoFocus
              autoComplete="username"
              disabled={loading}
            />
          </div>
          {tab === "signup" && (
            <div className="login-field">
              <label>Email <span className="login-optional">(optional)</span></label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={loading}
              />
            </div>
          )}
          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              disabled={loading}
            />
          </div>
          {tab === "signup" && (
            <div className="login-field">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                disabled={loading}
              />
            </div>
          )}
          {tab === "login" && (
            <label className="login-remember">
              <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
              <span>Remember me</span>
            </label>
          )}
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? (
              <span className="login-loading">
                <span className="loading-spinner-small" />
                {tab === "login" ? "Signing in..." : "Creating account..."}
              </span>
            ) : (
              tab === "login" ? "Sign In" : "Create Account"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
