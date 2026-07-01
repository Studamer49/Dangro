import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";

const SERVER_COLORS = ["#5865f2", "#3ba55d", "#ed4245", "#f0b232", "#a855f7", "#22d3ee", "#eb459e", "#57f287"];

export default function LeftPanel({ onSettings, onCall }) {
  const { state, dispatch, logout, addToast } = useApp();
  const [showServerModal, setShowServerModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [serverName, setServerName] = useState("");
  const [serverIcon, setServerIcon] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelType, setChannelType] = useState("text");
  const [voiceUsers, setVoiceUsers] = useState({});

  const currentServer = state.servers.find(s => s.id === state.activeServerId);

  function handleServerClick(server) {
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: {
        activeServerId: server.id,
        activeChatType: "channel",
        activeChannelId: server.channels?.[0]?.id || null,
      },
    });
  }

  function handleChannelClick(channel) {
    if (channel.type === "voice") {
      const key = channel.server_id + "_" + channel.id;
      setVoiceUsers(prev => ({
        ...prev,
        [key]: prev[key] ? null : [{ username: state.displayName, speaking: false }],
      }));
      addToast(channel.name + (voiceUsers[key] ? " - Left" : " - Connected"), "info");
      return;
    }
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "channel", activeChannelId: channel.id },
    });
  }

  async function createServer() {
    const name = serverName.trim();
    if (!name) return;
    try {
      const server = await api.servers.create(name, serverIcon || undefined);
      const servers = await api.servers.list();
      dispatch({ type: "SET_SERVERS", payload: servers });
      dispatch({
        type: "SET_ACTIVE_CHAT",
        payload: { activeServerId: server.id, activeChatType: "channel", activeChannelId: "general" },
      });
      setShowServerModal(false);
      setServerName("");
      setServerIcon("");
      addToast("Server created!", "success");
    } catch (e) {
      addToast(e.message || "Failed to create server", "error");
    }
  }

  async function createChannel() {
    const name = channelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
    if (!name || !state.activeServerId) return;
    try {
      await api.channels.create(state.activeServerId, name, channelType);
      const servers = await api.servers.list();
      dispatch({ type: "SET_SERVERS", payload: servers });
      if (channelType === "text") {
        dispatch({
          type: "SET_ACTIVE_CHAT",
          payload: { activeChatType: "channel", activeChannelId: name },
        });
      }
      setShowChannelModal(false);
      setChannelName("");
      addToast("Channel created!", "success");
    } catch (e) {
      addToast(e.message || "Failed to create channel", "error");
    }
  }

  const textChannels = currentServer?.channels?.filter(c => c.type !== "voice") || [];
  const voiceChannels = currentServer?.channels?.filter(c => c.type === "voice") || [];

  const statusColor = state.status === "online" ? "var(--green)" :
    state.status === "idle" ? "var(--yellow)" :
    state.status === "dnd" ? "var(--red)" : "var(--text-muted)";

  return (
    <>
      <div className="server-bar">
        <div className="server-bar-icon home-icon active" onClick={() => dispatch({ type: "SET_NAV_TAB", payload: "dms" })} title="Home">
          D
        </div>
        <div className="server-bar-divider" />
        {state.servers.map((server, i) => (
          <div
            key={server.id}
            className={"server-bar-icon" + (server.id === state.activeServerId ? " active" : "")}
            onClick={() => handleServerClick(server)}
            title={server.name}
            style={{ backgroundColor: SERVER_COLORS[i % SERVER_COLORS.length] }}
          >
            {server.icon || server.name.charAt(0).toUpperCase()}
          </div>
        ))}
        <div className="server-bar-icon" onClick={() => setShowServerModal(true)} title="Add Server" style={{ background: "var(--bg-surface)", color: "var(--accent-green)", fontSize: 24 }}>
          +
        </div>
      </div>

      <div className="left-panel">
        <div className="left-panel-header">
          <h2>{currentServer ? currentServer.name : "Direct Messages"}</h2>
        </div>

        <div className="left-panel-content">
          {currentServer ? (
            <>
              <div className="channel-section">
                <div className="channel-section-header">
                  <span className="arrow">&#9660;</span>
                  Text Channels
                  <button className="channel-add-btn" onClick={() => setShowChannelModal(true)}>+</button>
                </div>
                {textChannels.map(ch => (
                  <div
                    key={ch.id}
                    className={"channel-item" + (state.activeChatType === "channel" && ch.id === state.activeChannelId ? " active" : "")}
                    onClick={() => handleChannelClick(ch)}
                  >
                    <span className="hash">#</span>
                    <span className="name">{ch.name}</span>
                  </div>
                ))}
              </div>

              {voiceChannels.length > 0 && (
                <div className="channel-section" style={{ marginTop: 8 }}>
                  <div className="channel-section-header">
                    <span className="arrow">&#9660;</span>
                    Voice Channels
                  </div>
                  {voiceChannels.map(ch => {
                    const key = ch.server_id + "_" + ch.id;
                    const users = voiceUsers[key];
                    return (
                      <div key={ch.id}>
                        <div
                          className={"channel-item" + (users ? " active" : "")}
                          onClick={() => handleChannelClick(ch)}
                        >
                          <span className="hash">&#128266;</span>
                          <span className="name">{ch.name}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state" style={{ padding: "20px 16px" }}>
              <div className="empty-state-title">No server selected</div>
              <div className="empty-state-desc">Select a server from the sidebar or create one.</div>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="user-profile">
          <div className="user-avatar" style={{ background: "var(--accent)" }}>
            {state.displayName.charAt(0).toUpperCase()}
            <span className="status-dot" style={{ background: statusColor }} />
          </div>
          <div className="user-info">
            <div className="user-name">{state.displayName}</div>
            <div className="user-status-text">{state.customStatus || state.status}</div>
          </div>
          <div className="user-controls">
            <button className="user-control-btn" onClick={onCall} title="Start Call">&#128222;</button>
            <button className="user-control-btn" onClick={onSettings} title="Settings">&#9881;</button>
            <button className="user-control-btn" onClick={logout} title="Log Out">&#128682;</button>
          </div>
        </div>
      </div>

      {showServerModal && (
        <div className="modal-overlay" onClick={() => setShowServerModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Create Server</h3>
            <p>Create a new server for you and your friends.</p>
            <div className="settings-field">
              <label>Server Name</label>
              <input className="settings-input" type="text" placeholder="My Server" value={serverName} onChange={e => setServerName(e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Icon Letter</label>
              <input className="settings-input" type="text" placeholder="D" value={serverIcon} onChange={e => setServerIcon(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowServerModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createServer}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showChannelModal && (
        <div className="modal-overlay" onClick={() => setShowChannelModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Create Channel</h3>
            <div className="settings-field">
              <label>Channel Name</label>
              <input className="settings-input" type="text" placeholder="new-channel" value={channelName} onChange={e => setChannelName(e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Type</label>
              <select className="settings-select" value={channelType} onChange={e => setChannelType(e.target.value)}>
                <option value="text">Text</option>
                <option value="voice">Voice</option>
              </select>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowChannelModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createChannel}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
