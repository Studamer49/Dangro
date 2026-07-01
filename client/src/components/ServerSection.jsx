import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";

export default function ServerSection() {
  const { state, dispatch, addToast } = useApp();
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [showServerModal, setShowServerModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverIcon, setServerIcon] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const currentServer = state.servers.find(s => s.id === state.activeServerId);

  function handleServerClick(server) {
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: {
        activeServerId: server.id,
        activeChatType: "channel",
        activeChannelId: server.channels[0]?.id || "general",
      },
    });
    dispatch({ type: "SET_NAV_TAB", payload: "servers" });
  }

  function handleChannelClick(channelId) {
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "channel", activeChannelId: channelId },
    });
  }

  async function joinServer() {
    const code = joinCode.trim();
    if (!code) return;
    try {
      const server = await api.servers.get(code);
      if (server) {
        dispatch({
          type: "SET_ACTIVE_CHAT",
          payload: {
            activeServerId: server.id,
            activeChatType: "channel",
            activeChannelId: server.channels?.[0]?.id || "general",
          },
        });
        dispatch({ type: "SET_NAV_TAB", payload: "servers" });
        setShowJoinModal(false);
        setJoinCode("");
        addToast("Joined " + server.name + "!", "success");
      }
    } catch (e) {
      addToast("Server not found: " + e.message, "error");
    }
  }

  async function createChannel() {
    let name = channelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
    if (!name) return;
    try {
      await api.channels.create(state.activeServerId, name);
      const servers = await api.servers.list();
      dispatch({ type: "SET_SERVERS", payload: servers });
      dispatch({
        type: "SET_ACTIVE_CHAT",
        payload: { activeChatType: "channel", activeChannelId: name },
      });
      setShowChannelModal(false);
      setChannelName("");
      addToast("Channel #" + name + " created!", "success");
    } catch (e) {
      addToast(e.message || "Failed to create channel", "error");
    }
  }

  const serverColors = ["#5b5bf0", "#3ba55d", "#ed4245", "#f0b232", "#a855f7", "#22d3ee"];

  return (
    <div className="server-section">
      <div className="dm-section-header">
        <h3>Servers</h3>
        <div style={{ display: "flex", gap: 4 }}>
          <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: "2px 4px" }}
            onClick={() => setShowServerModal(true)} title="Create Server">+</button>
          <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: "2px 4px" }}
            onClick={() => setShowJoinModal(true)} title="Join Server">🔗</button>
        </div>
      </div>

      {state.servers.map((server, i) => (
        <div key={server.id}>
          <div className={"server-item" + (server.id === state.activeServerId ? " active" : "")}
            onClick={() => handleServerClick(server)}>
            <div className="server-icon" style={{ backgroundColor: serverColors[i % serverColors.length] }}>
              {server.icon || server.name.charAt(0).toUpperCase()}
            </div>
            <div className="server-name">{server.name}</div>
          </div>
          {server.id === state.activeServerId && (
            <div className="channel-list">
              <div className="dm-section-header" style={{ padding: "4px 10px" }}>
                <h3>Channels</h3>
                <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, padding: 0 }}
                  onClick={() => setShowChannelModal(true)}>+</button>
              </div>
              {server.channels.map(chan => (
                <div key={chan.id} className={"channel-item" + (state.activeChatType === "channel" && chan.id === state.activeChannelId ? " active" : "")}
                  onClick={() => handleChannelClick(chan.id)}>
                  <span className="channel-hash">#</span> {chan.name}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {state.servers.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">💻</div>
          <div className="empty-state-title">No servers</div>
          <div className="empty-state-desc">Create or join a server to get started.</div>
        </div>
      )}

      {showChannelModal && (
        <div className="call-overlay" onClick={() => setShowChannelModal(false)}>
          <div className="call-card" onClick={e => e.stopPropagation()} style={{ minWidth: 300 }}>
            <h3 style={{ marginBottom: 16 }}>Create Channel</h3>
            <input type="text" placeholder="Channel name" className="dm-friend-search" value={channelName} onChange={e => setChannelName(e.target.value)} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="login-submit" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => setShowChannelModal(false)}>Cancel</button>
              <button className="login-submit" style={{ width: "auto", padding: "10px 20px" }} onClick={createChannel}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showServerModal && (
        <div className="call-overlay" onClick={() => setShowServerModal(false)}>
          <div className="call-card" onClick={e => e.stopPropagation()} style={{ minWidth: 300 }}>
            <h3 style={{ marginBottom: 16 }}>Create Server</h3>
            <input type="text" placeholder="Server Name" className="dm-friend-search" value={serverName} onChange={e => setServerName(e.target.value)} />
            <input type="text" placeholder="Icon letter or emoji" className="dm-friend-search" value={serverIcon} onChange={e => setServerIcon(e.target.value)} style={{ marginTop: 8 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="login-submit" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => setShowServerModal(false)}>Cancel</button>
              <button className="login-submit" style={{ width: "auto", padding: "10px 20px" }} onClick={createServer}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="call-overlay" onClick={() => setShowJoinModal(false)}>
          <div className="call-card" onClick={e => e.stopPropagation()} style={{ minWidth: 300 }}>
            <h3 style={{ marginBottom: 16 }}>Join Server</h3>
            <input type="text" placeholder="Server ID" className="dm-friend-search" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="login-submit" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => setShowJoinModal(false)}>Cancel</button>
              <button className="login-submit" style={{ width: "auto", padding: "10px 20px" }} onClick={joinServer}>Join</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
