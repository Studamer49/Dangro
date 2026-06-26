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

  async function createServer() {
    const name = serverName.trim();
    if (!name) { addToast("Server name required!", "error"); return; }
    try {
      const server = await api.servers.create(name, serverIcon.trim() || name.charAt(0).toUpperCase());
      dispatch({ type: "SET_SERVERS", payload: [...state.servers, server] });
      dispatch({
        type: "SET_ACTIVE_CHAT",
        payload: { activeServerId: server.id, activeChatType: "channel", activeChannelId: "general" },
      });
      setShowServerModal(false);
      setServerName("");
      setServerIcon("");
      addToast("Server " + name + " created!", "success");
    } catch (e) {
      addToast(e.message || "Failed to create server", "error");
    }
  }

  function joinServer() {
    const code = joinCode.trim().toLowerCase().replace(/\s+/g, "-");
    const server = state.servers.find(s => s.id === code);
    if (server) {
      dispatch({
        type: "SET_ACTIVE_CHAT",
        payload: { activeServerId: code, activeChatType: "channel", activeChannelId: server.channels[0]?.id || "general" },
      });
      setShowJoinModal(false);
      setJoinCode("");
      addToast("Joined server " + server.name + "!", "success");
    } else {
      addToast("Server not found with that code!", "error");
    }
  }

  return (
    <>
      <div className="right-top-section">
        <div className="server-navigation-container">
          <div className="server-section-header">
            <span>Servers</span>
            <div className="server-actions">
              <button className="server-action-btn" title="Create Server" onClick={() => setShowServerModal(true)}>+</button>
              <button className="server-action-btn" title="Join Server" onClick={() => setShowJoinModal(true)}>🔗</button>
            </div>
          </div>
          <div className="server-icons-list">
            {state.servers.map(server => (
              <button key={server.id} className={"server-icon-btn" + (server.id === state.activeServerId ? " active" : "")}
                title={server.name} onClick={() => handleServerClick(server)}>
                {server.icon}
              </button>
            ))}
          </div>
        </div>
        <div className="channels-section">
          <div className="channels-header">
            <span id="active-server-title">{currentServer?.name || "Dangro"}</span>
            <button className="btn-add-channel" onClick={() => setShowChannelModal(true)}>+</button>
          </div>
          <div className="channels-list">
            {currentServer?.channels.map(chan => (
              <button key={chan.id} className={"channel-btn" + (state.activeChatType === "channel" && chan.id === state.activeChannelId ? " active" : "")}
                onClick={() => handleChannelClick(chan.id)}>
                <span className="hash">#</span> {chan.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showChannelModal && (
        <div className="modal" onClick={() => setShowChannelModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create Text Channel</h3>
            <p>Channel Name</p>
            <input type="text" placeholder="new-channel" className="modal-input" value={channelName} onChange={e => setChannelName(e.target.value)} />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowChannelModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createChannel}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showServerModal && (
        <div className="modal" onClick={() => setShowServerModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create Server</h3>
            <p>Give your server a name</p>
            <input type="text" placeholder="Server Name" className="modal-input" value={serverName} onChange={e => setServerName(e.target.value)} />
            <p>Server Icon (emoji or letter)</p>
            <input type="text" placeholder="D" className="modal-input" maxLength="2" value={serverIcon} onChange={e => setServerIcon(e.target.value)} />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowServerModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createServer}>Create</button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="modal" onClick={() => setShowJoinModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Join Server</h3>
            <p>Enter invite code to join a server</p>
            <input type="text" placeholder="Invite Code" className="modal-input" value={joinCode} onChange={e => setJoinCode(e.target.value)} />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowJoinModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={joinServer}>Join</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
