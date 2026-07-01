import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";

const SETTINGS_TABS = [
  { id: "profile", label: "Profile", icon: "\uD83D\uDC64" },
  { id: "account", label: "Account", icon: "\uD83D\uDD12" },
  { id: "appearance", label: "Appearance", icon: "\uD83C\uDFA8" },
  { id: "notifications", label: "Notifications", icon: "\uD83D\uDD14" },
  { id: "privacy", label: "Privacy", icon: "\uD83D\uDD75" },
  { id: "shortcuts", label: "Shortcuts", icon: "\u2328\uFE0F" },
];

export default function SettingsPanel({ onClose }) {
  const { state, dispatch, logout, addToast } = useApp();
  const [tab, setTab] = useState("profile");
  const [displayName, setDisplayName] = useState(state.displayName);
  const [bio, setBio] = useState(state.bio);
  const [status, setStatus] = useState(state.status);
  const [customStatus, setCustomStatus] = useState(state.customStatus);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [theme, setTheme] = useState("dark");
  const [notifyMessages, setNotifyMessages] = useState(true);
  const [notifyFriends, setNotifyFriends] = useState(true);
  const [notifySounds, setNotifySounds] = useState(true);
  const [privacyDMs, setPrivacyDMs] = useState(true);
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDisplayName(state.displayName);
    setBio(state.bio);
    setStatus(state.status);
    setCustomStatus(state.customStatus);
  }, [state]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("dangro_theme") || "dark";
    setTheme(savedTheme);
    document.documentElement.setAttribute("data-theme", savedTheme === "light" ? "light" : "");
  }, []);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      dispatch({ type: "SET_PROFILE", payload: { profilePic: event.target.result } });
    };
    reader.readAsDataURL(file);
  }

  async function saveProfile() {
    try {
      await api.auth.updateProfile({
        displayName: displayName.trim() || state.displayName,
        bio: bio.trim(),
        status,
        customStatus: customStatus.trim(),
        theme,
      });
      dispatch({
        type: "SET_PROFILE",
        payload: {
          displayName: displayName.trim() || state.displayName,
          bio: bio.trim(),
          status,
          customStatus: customStatus.trim(),
        },
      });
      addToast("Settings saved!", "success");
    } catch (e) {
      addToast(e.message || "Failed to save settings", "error");
    }
  }

  async function changePassword() {
    if (!currentPassword || !newPassword) {
      addToast("Fill in both password fields", "error");
      return;
    }
    if (newPassword.length < 6) {
      addToast("Password must be at least 6 characters", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast("Passwords do not match", "error");
      return;
    }
    try {
      await api.auth.changePassword(currentPassword, newPassword);
      addToast("Password updated! Please log in again.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      addToast(e.message || "Failed to change password", "error");
    }
  }

  function handleThemeChange(newTheme) {
    setTheme(newTheme);
    document.documentElement.setAttribute("data-theme", newTheme === "light" ? "light" : "");
    localStorage.setItem("dangro_theme", newTheme);
  }

  return (
    <div className="settings-panel" onClick={onClose}>
      <div className="settings-content" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>&#10005;</button>
        </div>
        <div className="settings-layout">
          <div className="settings-sidebar">
            {SETTINGS_TABS.map(t => (
              <button
                key={t.id}
                className={"settings-tab" + (tab === t.id ? " active" : "")}
                onClick={() => setTab(t.id)}
              >
                <span className="settings-tab-icon">{t.icon}</span>
                <span className="settings-tab-label">{t.label}</span>
              </button>
            ))}
          </div>
          <div className="settings-body">
            {tab === "profile" && (
              <div className="settings-section">
                <h3>Profile</h3>
                <div className="settings-profile-pic">
                  <div className="settings-avatar" style={{
                    backgroundImage: state.profilePic ? `url(${state.profilePic})` : undefined,
                    backgroundSize: state.profilePic ? "cover" : undefined,
                  }}>
                    {!state.profilePic && (state.displayName.charAt(0).toUpperCase() || "U")}
                  </div>
                  <button className="settings-btn" onClick={() => fileInputRef.current?.click()}>Upload Photo</button>
                  <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileUpload} />
                </div>
                <div className="settings-field">
                  <label>Display Name</label>
                  <input type="text" className="settings-input" value={displayName} onChange={e => setDisplayName(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>Bio</label>
                  <textarea className="settings-textarea" placeholder="Tell us about yourself..." rows="3" value={bio} onChange={e => setBio(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>Status</label>
                  <select className="settings-select" value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="online">Online</option>
                    <option value="idle">Idle</option>
                    <option value="dnd">Do Not Disturb</option>
                    <option value="offline">Offline</option>
                  </select>
                </div>
                <div className="settings-field">
                  <label>Custom Status</label>
                  <input type="text" className="settings-input" placeholder="What's on your mind?" value={customStatus} onChange={e => setCustomStatus(e.target.value)} />
                </div>
              </div>
            )}

            {tab === "account" && (
              <div className="settings-section">
                <h3>Account</h3>
                <div className="settings-info-row">
                  <span>Username</span>
                  <span className="settings-info-value">{state.user?.username}</span>
                </div>
                <div className="settings-info-row">
                  <span>Email</span>
                  <span className="settings-info-value">{state.user?.email || "Not set"}</span>
                </div>
                <hr className="settings-divider" />
                <div className="settings-field">
                  <label>Current Password</label>
                  <input type="password" className="settings-input" placeholder="Current password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>New Password</label>
                  <input type="password" className="settings-input" placeholder="New password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </div>
                <div className="settings-field">
                  <label>Confirm New Password</label>
                  <input type="password" className="settings-input" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </div>
                <button className="settings-btn" onClick={changePassword}>Change Password</button>
              </div>
            )}

            {tab === "appearance" && (
              <div className="settings-section">
                <h3>Appearance</h3>
                <div className="settings-theme-options">
                  <button className={"settings-theme-card" + (theme === "dark" ? " active" : "")} onClick={() => handleThemeChange("dark")}>
                    <div className="settings-theme-preview dark" />
                    <span>Dark</span>
                  </button>
                  <button className={"settings-theme-card" + (theme === "light" ? " active" : "")} onClick={() => handleThemeChange("light")}>
                    <div className="settings-theme-preview light" />
                    <span>Light</span>
                  </button>
                </div>
              </div>
            )}

            {tab === "notifications" && (
              <div className="settings-section">
                <h3>Notification Settings</h3>
                <label className="settings-toggle">
                  <span>Message notifications</span>
                  <input type="checkbox" checked={notifyMessages} onChange={e => setNotifyMessages(e.target.checked)} />
                </label>
                <label className="settings-toggle">
                  <span>Friend request notifications</span>
                  <input type="checkbox" checked={notifyFriends} onChange={e => setNotifyFriends(e.target.checked)} />
                </label>
                <label className="settings-toggle">
                  <span>Sound effects</span>
                  <input type="checkbox" checked={notifySounds} onChange={e => setNotifySounds(e.target.checked)} />
                </label>
              </div>
            )}

            {tab === "privacy" && (
              <div className="settings-section">
                <h3>Privacy Settings</h3>
                <label className="settings-toggle">
                  <span>Allow direct messages from everyone</span>
                  <input type="checkbox" checked={privacyDMs} onChange={e => setPrivacyDMs(e.target.checked)} />
                </label>
              </div>
            )}

            {tab === "shortcuts" && (
              <div className="settings-section">
                <h3>Keyboard Shortcuts</h3>
                <div className="shortcut-list">
                  {[
                    { keys: "Enter", desc: "Send message" },
                    { keys: "Shift + Enter", desc: "New line" },
                    { keys: "Escape", desc: "Cancel reply / Close picker" },
                    { keys: "Ctrl + K", desc: "Quick switcher" },
                    { keys: "Ctrl + ,", desc: "Settings" },
                    { keys: "Up arrow", desc: "Edit last message" },
                  ].map((s, i) => (
                    <div key={i} className="shortcut-item">
                      <span className="shortcut-desc">{s.desc}</span>
                      <kbd className="shortcut-keys">{s.keys}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(tab === "profile" || tab === "account") && (
              <button className="settings-btn settings-save-btn" onClick={saveProfile}>Save Changes</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
