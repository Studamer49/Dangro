import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function LoginPage() {
  const { login, guestLogin, addToast } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return;
    setLoading(true);
    try {
      await login(username.trim(), password.trim());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuest() {
    setLoading(true);
    try {
      await guestLogin();
      addToast("Logged in as guest", "info");
    } catch {} finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-logo">D</div>
        <h1>Dangro</h1>
        <p className="login-subtitle">Sign in to continue</p>
        <div className="login-form">
          <input type="text" placeholder="Username" className="login-input" value={username} onChange={e => { setUsername(e.target.value); setError(false); }} onKeyDown={handleKey} />
          <input type="password" placeholder="Password" className="login-input" value={password} onChange={e => { setPassword(e.target.value); setError(false); }} onKeyDown={handleKey} />
          {error && <div className="login-error">Invalid credentials</div>}
          <button className="login-btn" onClick={handleLogin} disabled={loading}>Sign In</button>
          <button className="login-btn-secondary" onClick={handleGuest} disabled={loading}>Continue as Guest</button>
        </div>
      </div>
    </div>
  );
}
