import React, { useState, useEffect } from "react";
import { useApp, getActiveChatKey } from "../contexts/AppContext";

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
    const newGroups = [...state.groupChats, group];
    dispatch({ type: "SET_GROUP_CHATS", payload: newGroups });
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "group", activeGroupChatId: id },
    });
    dispatch({
      type: "SET_MESSAGES",
      chatKey: "group_" + id,
      payload: [{ id: "sys_" + Date.now(), sender: "System", content: "Group chat " + name + " created!", timestamp: "Just now", system: true, reactions: {}, replyTo: null }],
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
        payload: [{ id: "sys_" + Date.now(), sender: "System", content: "Group chat started.", timestamp: "Just now", system: true, reactions: {}, replyTo: null }],
      });
    }
  }

  const availableMembers = state.friends.filter(f => f.status !== "offline" && f.status !== "pending_in" && f.status !== "pending_out");

  return (
    <>
      <div className="right-top-section">
        <div className="server-navigation-container">
          <div className="server-section-header">
            <span>Group Chats</span>
            <button className="server-action-btn" title="Create Group Chat" onClick={() => setShowModal(true)}>+</button>
          </div>
        </div>
        <div className="channels-section">
          <div className="group-chats-list">
            {state.groupChats.length === 0 ? (
              <div style={{ padding: "16px", fontSize: "0.75rem", color: "var(--text-muted)", textAlign: "center" }}>
                No group chats yet.<br />Click + to create one.
              </div>
            ) : (
              state.groupChats.map(group => (
                <div key={group.id} className={"group-chat-item" + (state.activeGroupChatId === group.id && state.activeChatType === "group" ? " active" : "")}
                  onClick={() => selectGroup(group)}>
                  <div className="group-chat-icon">👥</div>
                  <div>
                    <div className="group-chat-name">{group.name}</div>
                    <div className="group-chat-count">{group.members.length} members</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="right-section-divider"><span>Members</span></div>
      <div className="right-bottom-section">
        <div className="friends-scroller group-members-list">
          {!activeGroup ? (
            <div style={{ padding: "12px", fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center" }}>
              Select a group chat to see members.
            </div>
          ) : (
            <>
              <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-muted)", padding: "4px 8px", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Members - {activeGroup.members.length}
              </div>
              {activeGroup.members.map(m => {
                const isOnline = state.friends.some(f => f.username === m && f.status !== "offline");
                return (
                  <div key={m} className="group-member-item">
                    <div className="friend-avatar" style={{
                      width: "24px", height: "24px", borderRadius: "50%", background: "#555",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "0.6rem", color: "#fff", flexShrink: 0
                    }}>
                      {m.charAt(0).toUpperCase()}
                    </div>
                    <span>{m === state.displayName ? m + " (you)" : m}</span>
                    <span style={{ marginLeft: "auto", fontSize: "0.6rem", color: isOnline ? "#aaa" : "#444" }}>
                      {isOnline ? "●" : "○"}
                    </span>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Create Group Chat</h3>
            <p>Group Chat Name</p>
            <input type="text" placeholder="Group Name" className="modal-input" value={groupName} onChange={e => setGroupName(e.target.value)} />
            <p>Select members to add:</p>
            <div className="group-member-select">
              {availableMembers.map(f => (
                <label key={f.id}>
                  <input type="checkbox" checked={selectedMembers.includes(f.username)}
                    onChange={() => toggleMember(f.username)} />
                  <span>{f.username}</span>
                </label>
              ))}
              {availableMembers.length === 0 && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", padding: "8px" }}>No online friends available.</div>
              )}
            </div>
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createGroup}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
