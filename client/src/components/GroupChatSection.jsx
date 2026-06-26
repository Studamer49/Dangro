import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function GroupChatSection() {
  const { state, dispatch, addToast } = useApp();
  const [showModal, setShowModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [selectedMembers, setSelectedMembers] = useState([]);

  const activeGroup = state.groupChats.find(g => g.id === state.activeGroupChatId);

  function createGroup() {
    const name = groupName.trim();
    if (!name) { addToast("Group name required!", "error"); return; }
    if (selectedMembers.length < 2) { addToast("Add at least one other member!", "error"); return; }
    const id = "group_" + Date.now();
    const members = [state.displayName, ...selectedMembers];
    const group = { id, name, members, createdBy: state.displayName, createdAt: new Date().toISOString() };
    dispatch({ type: "SET_GROUP_CHATS", payload: [...state.groupChats, group] });
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "group", activeGroupChatId: id },
    });
    dispatch({
      type: "SET_MESSAGES",
      chatKey: "group_" + id,
      payload: [{ id: "sys_" + Date.now(), sender: "System", content: "Group chat " + name + " created!", timestamp: "Just now", system: true }],
    });
    dispatch({ type: "SET_NAV_TAB", payload: "groupchats" });
    setShowModal(false);
    setGroupName("");
    setSelectedMembers([]);
    addToast("Group chat " + name + " created!", "success");
  }

  function toggleMember(username) {
    setSelectedMembers(prev =>
      prev.includes(username) ? prev.filter(u => u !== username) : [...prev, username]
    );
  }

  function selectGroup(group) {
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "group", activeGroupChatId: group.id },
    });
    const key = "group_" + group.id;
    if (!state.messages[key]) {
      dispatch({
        type: "SET_MESSAGES",
        chatKey: key,
        payload: [{ id: "sys_" + Date.now(), sender: "System", content: "Group chat started.", timestamp: "Just now", system: true }],
      });
    }
  }

  const availableMembers = state.friends.filter(f => f.status !== "offline" && f.status !== "pending_in" && f.status !== "pending_out");

  const groupColors = ["#5b5bf0", "#a855f7", "#22d3ee", "#f0b232", "#3ba55d"];

  return (
    <div className="group-section">
      <div className="dm-section-header">
        <h3>Group Chats</h3>
        <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16, padding: "2px 4px" }}
          onClick={() => setShowModal(true)}>+</button>
      </div>

      {state.groupChats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">No group chats</div>
          <div className="empty-state-desc">Click + to create one with friends.</div>
        </div>
      ) : (
        state.groupChats.map((group, i) => (
          <div key={group.id} className={"group-item" + (state.activeGroupChatId === group.id && state.activeChatType === "group" ? " active" : "")}
            onClick={() => selectGroup(group)}>
            <div className="group-avatar" style={{ backgroundColor: groupColors[i % groupColors.length] }}>
              {group.name.charAt(0).toUpperCase()}
            </div>
            <div className="group-info">
              <div className="group-name">{group.name}</div>
              <div className="group-members">{group.members.length} members</div>
            </div>
          </div>
        ))
      )}

      {activeGroup && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <div className="dm-section-header">
            <h3>Members ({activeGroup.members.length})</h3>
          </div>
          {activeGroup.members.map(m => (
            <div key={m} className="dm-item" style={{ padding: "4px 8px", cursor: "default" }}>
              <div className="dm-avatar" style={{ width: 28, height: 28, fontSize: 11, backgroundColor: "#555" }}>
                {m.charAt(0).toUpperCase()}
              </div>
              <div className="dm-username" style={{ fontSize: 13 }}>
                {m === state.displayName ? m + " (you)" : m}
              </div>
              <div className="dm-status-dot" style={{ backgroundColor: state.friends.some(f => f.username === m && f.status !== "offline") ? "var(--green)" : "var(--text-muted)" }} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="call-overlay" onClick={() => setShowModal(false)}>
          <div className="call-card" onClick={e => e.stopPropagation()} style={{ minWidth: 340, textAlign: "left" }}>
            <h3 style={{ marginBottom: 16 }}>Create Group Chat</h3>
            <div className="settings-field">
              <label>Group Name</label>
              <input type="text" placeholder="Group Name" value={groupName} onChange={e => setGroupName(e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Select Members</label>
              <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
                {availableMembers.length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 8 }}>No online friends available.</div>
                ) : (
                  availableMembers.map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "4px 0" }}>
                      <input type="checkbox" checked={selectedMembers.includes(f.username)}
                        onChange={() => toggleMember(f.username)} style={{ accentColor: "var(--accent)" }} />
                      <span>{f.username}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="login-submit" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => setShowModal(false)}>Cancel</button>
              <button className="login-submit" style={{ width: "auto", padding: "10px 20px" }} onClick={createGroup}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
