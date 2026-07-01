import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";

const AVATARS = ["#5865f2", "#3ba55d", "#ed4245", "#f0b232", "#a855f7", "#22d3ee"];

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATARS[Math.abs(hash) % AVATARS.length];
}

export default function DMList() {
  const { state, dispatch, addToast } = useApp();
  const [feedback, setFeedback] = useState({ message: "", type: "" });

  function switchSubtab(subtab) {
    dispatch({ type: "SET_FRIEND_SUBTAB", payload: subtab });
  }

  function openDM(friendId) {
    dispatch({
      type: "SET_ACTIVE_CHAT",
      payload: { activeChatType: "dm", activeDmFriendId: friendId },
    });
    const key = "dm_" + friendId;
    if (!state.messages[key]) {
      dispatch({
        type: "SET_MESSAGES",
        chatKey: key,
        payload: [{ id: "sys_dm_" + Date.now(), sender: "System", content: "Private messages with this user.", timestamp: "Just now", system: true, reactions: {}, replyTo: null }],
      });
    }
    dispatch({ type: "SET_NAV_TAB", payload: "dms" });
  }

  async function removeFriend(friendId, username) {
    if (!window.confirm("Remove @" + username + "?")) return;
    try {
      await api.friends.remove(friendId);
      dispatch({ type: "SET_FRIENDS", payload: state.friends.filter(f => f.id !== friendId) });
      addToast("Removed @" + username, "info");
      if (state.activeChatType === "dm" && state.activeDmFriendId === friendId) {
        dispatch({
          type: "SET_ACTIVE_CHAT",
          payload: { activeChatType: "channel", activeServerId: null, activeChannelId: null },
        });
      }
    } catch {}
  }

  async function addFriend() {
    const input = document.getElementById("add-friend-input");
    const val = input?.value?.trim();
    if (!val) return;
    const username = val.split("#")[0];
    try {
      await api.friends.add(username);
      const friends = await api.friends.list();
      dispatch({ type: "SET_FRIENDS", payload: friends });
      input.value = "";
      setFeedback({ message: "Friend request sent to " + username + "!", type: "success" });
      addToast("Request sent to @" + username, "success");
      setTimeout(async () => {
        const updated = await api.friends.list();
        dispatch({ type: "SET_FRIENDS", payload: updated });
      }, 6000);
    } catch (e) {
      setFeedback({ message: e.message || "Failed to add friend", type: "error" });
    }
  }

  let visibleFriends = state.friends;
  if (state.activeFriendSubtab === "online") {
    visibleFriends = state.friends.filter(f => f.status !== "offline" && f.status !== "pending_in" && f.status !== "pending_out");
  } else if (state.activeFriendSubtab === "all") {
    visibleFriends = state.friends.filter(f => f.status !== "pending_in" && f.status !== "pending_out");
  }

  const query = state.friendSearchQuery.trim().toLowerCase();
  if (query) visibleFriends = visibleFriends.filter(f => f.username.toLowerCase().includes(query));

  const pendingFriends = state.friends.filter(f => f.status === "pending_in" || f.status === "pending_out");

  const statusColor = (status) =>
    status === "online" ? "var(--green)" :
    status === "idle" ? "var(--yellow)" :
    status === "dnd" ? "var(--red)" : "var(--text-muted)";

  return (
    <div className="dm-section">
      <div className="dm-section-header">
        <span>Direct Messages</span>
      </div>

      <div className="dm-subtabs">
        <button className={"dm-subtab" + (state.activeFriendSubtab === "online" ? " active" : "")} onClick={() => switchSubtab("online")}>Online</button>
        <button className={"dm-subtab" + (state.activeFriendSubtab === "all" ? " active" : "")} onClick={() => switchSubtab("all")}>All</button>
        <button className={"dm-subtab" + (state.activeFriendSubtab === "pending" ? " active" : "")} onClick={() => switchSubtab("pending")}>Pending</button>
        <button className={"dm-subtab" + (state.activeFriendSubtab === "add-friend" ? " active" : "")} onClick={() => switchSubtab("add-friend")}>+ Add</button>
      </div>

      {(state.activeFriendSubtab === "online" || state.activeFriendSubtab === "all") && (
        <>
          <div className="dm-friend-search">
            <input type="text" placeholder="Search friends..." value={state.friendSearchQuery}
              onChange={e => dispatch({ type: "SET_FRIEND_SEARCH", payload: e.target.value })} />
          </div>
          {visibleFriends.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">&#128101;</div>
              <div className="empty-state-title">No friends found</div>
              <div className="empty-state-desc">Add friends using the + Add tab to start chatting.</div>
            </div>
          ) : (
            visibleFriends.map(friend => (
              <div key={friend.id} className={"dm-item" + (state.activeChatType === "dm" && state.activeDmFriendId === friend.id ? " active" : "")}
                onClick={() => openDM(friend.id)}>
                <div className="dm-avatar" style={{ backgroundColor: hashColor(friend.username) }}>
                  {friend.username.charAt(0).toUpperCase()}
                </div>
                <div className="dm-info">
                  <div className="dm-username">{friend.username}</div>
                  <div className="dm-status">{friend.customStatus || friend.status}</div>
                </div>
                <span className="dm-status-dot" style={{ background: statusColor(friend.status) }} />
              </div>
            ))
          )}
        </>
      )}

      {state.activeFriendSubtab === "pending" && (
        pendingFriends.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">&#128231;</div>
            <div className="empty-state-title">No pending requests</div>
            <div className="empty-state-desc">Friend requests will appear here.</div>
          </div>
        ) : (
          pendingFriends.map(friend => {
            const isIncoming = friend.status === "pending_in";
            return (
              <div key={friend.id} className="dm-item">
                <div className="dm-avatar" style={{ backgroundColor: hashColor(friend.username) }}>
                  {friend.username.charAt(0).toUpperCase()}
                </div>
                <div className="dm-info">
                  <div className="dm-username">{friend.username}</div>
                  <div className="dm-status" style={{ color: isIncoming ? "var(--yellow)" : "var(--text-muted)", fontSize: 11 }}>
                    {isIncoming ? "Incoming Request" : "Outgoing Request"}
                  </div>
                </div>
                {isIncoming && (
                  <button style={{ background: "var(--accent-green)", border: "none", color: "#fff", borderRadius: 4, padding: "4px 8px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                    onClick={async () => {
                      await api.friends.update(friend.id, { status: "accepted" });
                      const friends = await api.friends.list();
                      dispatch({ type: "SET_FRIENDS", payload: friends });
                      addToast("Accepted @" + friend.username + "'s request!", "success");
                    }}>Accept</button>
                )}
                <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, padding: 2 }}
                  onClick={async () => {
                    await api.friends.remove(friend.id);
                    dispatch({ type: "SET_FRIENDS", payload: state.friends.filter(f => f.id !== friend.id) });
                  }}>&#10005;</button>
              </div>
            );
          })
        )
      )}

      {state.activeFriendSubtab === "add-friend" && (
        <div className="dm-add-section">
          <h4>Add Friend</h4>
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>Enter a username to send a friend request.</p>
          <div className="dm-add-form">
            <input type="text" id="add-friend-input" placeholder="Enter username..." autoComplete="off" />
            <button onClick={addFriend}>Send</button>
          </div>
          {feedback.message && (
            <div style={{ marginTop: 8, fontSize: 12, color: feedback.type === "success" ? "var(--green)" : "var(--red)" }}>
              {feedback.message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
