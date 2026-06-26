import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";

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
          payload: { activeChatType: "channel", activeServerId: "dangro-hq", activeChannelId: "general" },
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

  return (
    <>
      <div className="friends-sub-header">
        <div className="friends-tabs">
          <button className={"friend-tab-btn" + (state.activeFriendSubtab === "online" ? " active" : "")} onClick={() => switchSubtab("online")}>Online</button>
          <button className={"friend-tab-btn" + (state.activeFriendSubtab === "all" ? " active" : "")} onClick={() => switchSubtab("all")}>All</button>
          <button className={"friend-tab-btn" + (state.activeFriendSubtab === "pending" ? " active" : "")} onClick={() => switchSubtab("pending")}>Pending</button>
          <button className={"friend-tab-btn add-friend-accent" + (state.activeFriendSubtab === "add-friend" ? " active" : "")} onClick={() => switchSubtab("add-friend")}>+ Add</button>
        </div>
      </div>
      <div className="friends-content">
        <div id="friends-list-view" className={"subtab-content" + (state.activeFriendSubtab === "online" || state.activeFriendSubtab === "all" ? " active" : "")}>
          <div className="friends-search">
            <input type="text" placeholder="Search friends..." value={state.friendSearchQuery}
              onChange={e => dispatch({ type: "SET_FRIEND_SEARCH", payload: e.target.value })} />
          </div>
          <div className="friends-scroller">
            {visibleFriends.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px", fontSize: "0.7rem", color: "var(--text-muted)" }}>No friends found.</div>
            ) : (
              visibleFriends.map(friend => (
                <div key={friend.id} className={"friend-item" + (state.activeChatType === "dm" && state.activeDmFriendId === friend.id ? " active" : "")}
                  onClick={(e) => { if (!e.target.closest(".friend-action-btn")) openDM(friend.id); }}>
                  <div className="friend-info-left">
                    <div className="friend-avatar-wrapper">
                      <div className="friend-avatar" style={{ backgroundColor: friend.avatarColor || "#555" }}>
                        {friend.username.charAt(0).toUpperCase()}
                      </div>
                      <div className={"status-indicator " + friend.status}></div>
                    </div>
                    <div className="friend-details">
                      <div className="friend-username-row">
                        <span className="friend-name">{friend.username}</span>
                        <span className="friend-tag">#{friend.discriminator}</span>
                      </div>
                      <div className="friend-custom-status">{friend.customStatus || friend.status}</div>
                    </div>
                  </div>
                  <div className="friend-actions">
                    <button className="friend-action-btn btn-quick-dm" title="Message" onClick={(e) => { e.stopPropagation(); openDM(friend.id); }}>💬</button>
                    <button className="friend-action-btn btn-remove-friend decline" title="Remove" onClick={(e) => { e.stopPropagation(); removeFriend(friend.id, friend.username); }}>✖</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div id="friends-pending-view" className={"subtab-content" + (state.activeFriendSubtab === "pending" ? " active" : "")}>
          <div className="friends-scroller" id="friends-pending-list">
            {pendingFriends.length === 0 ? (
              <div style={{ textAlign: "center", padding: "16px", fontSize: "0.7rem", color: "var(--text-muted)" }}>No pending requests.</div>
            ) : (
              pendingFriends.map(friend => {
                const isIncoming = friend.status === "pending_in";
                return (
                  <div key={friend.id} className="friend-item">
                    <div className="friend-info-left">
                      <div className="friend-avatar-wrapper">
                        <div className="friend-avatar" style={{ backgroundColor: friend.avatarColor || "#555" }}>
                          {friend.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="status-indicator offline"></div>
                      </div>
                      <div className="friend-details">
                        <div className="friend-username-row">
                          <span className="friend-name">{friend.username}</span>
                          <span className="friend-tag">#{friend.discriminator}</span>
                        </div>
                        <div><span className="pending-badge">{isIncoming ? "Incoming Request" : "Outgoing Request"}</span></div>
                      </div>
                    </div>
                    <div className="friend-actions">
                      {isIncoming && (
                        <button className="friend-action-btn btn-accept-req" title="Accept"
                          onClick={async () => {
                            await api.friends.update(friend.id, { status: "online", customStatus: "Friends! 👋" });
                            const friends = await api.friends.list();
                            dispatch({ type: "SET_FRIENDS", payload: friends });
                            addToast("Accepted @" + friend.username + "'s request!", "success");
                          }}>✔</button>
                      )}
                      <button className="friend-action-btn btn-cancel-req decline" title="Decline"
                        onClick={async () => {
                          await api.friends.remove(friend.id);
                          dispatch({ type: "SET_FRIENDS", payload: state.friends.filter(f => f.id !== friend.id) });
                        }}>✖</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div id="friends-add-view" className={"subtab-content" + (state.activeFriendSubtab === "add-friend" ? " active" : "")}>
          <div className="add-friend-box">
            <h4>ADD FRIEND</h4>
            <p>Add friends with their Dangro tag (e.g. <code>username#1234</code>).</p>
            <div className="add-friend-input-row">
              <input type="text" id="add-friend-input" placeholder="Enter username..." autoComplete="off" />
              <button onClick={addFriend}>Send Request</button>
            </div>
            {feedback.message && (
              <div className={"feedback-msg " + feedback.type} style={{ display: "block" }}>{feedback.message}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
