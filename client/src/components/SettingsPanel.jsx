import React, { useState, useRef, useEffect } from "react";
import { useApp } from "../contexts/AppContext";

export default function SettingsPanel({ onClose }) {
  const { state, dispatch, addToast } = useApp();
  const [displayName, setDisplayName] = useState(state.displayName);
  const [bio, setBio] = useState(state.bio);
  const [status, setStatus] = useState(state.status);
  const [customStatus, setCustomStatus] = useState(state.customStatus);
  const [password, setPassword] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    setDisplayName(state.displayName);
    setBio(state.bio);
    setStatus(state.status);
    setCustomStatus(state.customStatus);
  }, [state.displayName, state.bio, state.status, state.customStatus]);

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      dispatch({ type: "SET_PROFILE", payload: { profilePic: event.target.result } });
    };
    reader.readAsDataURL(file);
  }

  function save() {
    dispatch({
      type: "SET_PROFILE",
      payload: {
        displayName: displayName.trim() || state.displayName,
        bio: bio.trim(),
        status,
        customStatus: customStatus.trim(),
      },
    });
    if (password.trim()) {
      addToast("Password updated!", "success");
    }
    addToast("Settings saved!", "success");
    onClose();
  }

  return (
    <div className="settings-panel">
      <div className="settings-header">
        <h2>Settings</h2>
        <button className="settings-close" onClick={onClose}>✕</button>
      </div>
      <div className="settings-body">
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
            <textarea className="settings-textarea" placeholder="Tell us about yourself..." rows="3" value={bio} onChange={e => setBio(e.target.value)}></textarea>
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
        <div className="settings-section">
          <h3>Account</h3>
          <div className="settings-field">
            <label>Password</label>
            <input type="password" className="settings-input" placeholder="Enter new password" value={password} onChange={e => setPassword(e.target.value)} />
          </div>
        </div>
        <button className="login-btn settings-save-btn" onClick={save}>Save Changes</button>
      </div>
    </div>
  );
}
