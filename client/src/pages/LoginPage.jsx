import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function LoginPage() {
  const { login, signup } = useApp();
  const [tab, setTab] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!username || !password) { setError("Please fill in all fields"); return; }
    if (tab === "signup" && password !== confirmPassword) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      if (tab === "login") {
        await login(username, password);
      } else {
        await signup(username, password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">dangro</div>
          <p className="login-subtitle">{tab === "login" ? "Welcome back" : "Create your account"}</p>
        </div>

        <div className="login-tabs">
          <button className={`login-tab ${tab === "login" ? "active" : ""}`} onClick={() => setTab("login")}>Sign In</button>
          <button className={`login-tab ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Sign Up</button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Username</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Enter your username" autoFocus />
          </div>
          <div className="login-field">
            <label>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
          </div>
          {tab === "signup" && (
            <div className="login-field">
              <label>Confirm Password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm your password" />
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Please wait..." : tab === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
