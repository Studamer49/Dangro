import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

const GROUP_COLORS = ["#5865f2", "#a855f7", "#22d3ee", "#f0b232", "#3ba55d"];

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

  return (
    <div className="dm-section">
      <div className="dm-section-header">
        <span>Group Chats</span>
        <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}
          onClick={() => setShowModal(true)}>+</button>
      </div>

      {state.groupChats.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">&#128101;</div>
          <div className="empty-state-title">No group chats</div>
          <div className="empty-state-desc">Click + to create one with friends.</div>
        </div>
      ) : (
        state.groupChats.map((group, i) => (
          <div key={group.id} className={"dm-item" + (state.activeGroupChatId === group.id && state.activeChatType === "group" ? " active" : "")}
            onClick={() => selectGroup(group)}>
            <div className="dm-avatar" style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}>
              {group.name.charAt(0).toUpperCase()}
            </div>
            <div className="dm-info">
              <div className="dm-username">{group.name}</div>
              <div className="dm-status">{group.members.length} members</div>
            </div>
          </div>
        ))
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3>Create Group Chat</h3>
            <div className="settings-field">
              <label>Group Name</label>
              <input className="settings-input" type="text" placeholder="Group Name" value={groupName} onChange={e => setGroupName(e.target.value)} />
            </div>
            <div className="settings-field">
              <label>Select Members</label>
              <div style={{ maxHeight: 150, overflowY: "auto", marginTop: 4 }}>
                {state.friends.filter(f => f.status !== "pending_in" && f.status !== "pending_out").length === 0 ? (
                  <div style={{ fontSize: 13, color: "var(--text-muted)", padding: 8 }}>No friends available.</div>
                ) : (
                  state.friends.filter(f => f.status !== "pending_in" && f.status !== "pending_out").map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", padding: "6px 0" }}>
                      <input type="checkbox" checked={selectedMembers.includes(f.username)}
                        onChange={() => toggleMember(f.username)} style={{ accentColor: "var(--accent)" }} />
                      <span>{f.username}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={createGroup}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
