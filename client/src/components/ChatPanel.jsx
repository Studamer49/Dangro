import React, { useState, useEffect, useRef } from "react";
import { useApp, getActiveChatKey } from "../contexts/AppContext";
import socket from "../services/socket";
import MessageItem from "./MessageItem";

export default function ChatPanel() {
  const { state, dispatch, loadMessages, sendMessage, addToast } = useApp();
  const [input, setInput] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");

  const chatKey = getActiveChatKey(state);
  const messages = state.messages[chatKey] || [];
  const query = state.chatSearchQuery.trim().toLowerCase();
  const filtered = query ? messages.filter(m => m.content.toLowerCase().includes(query) || m.sender.toLowerCase().includes(query)) : messages;

  useEffect(() => {
    if (chatKey) {
      loadMessages(chatKey);
      socket.emit("join:chat", chatKey);
      return () => { socket.emit("leave:chat", chatKey); };
    }
  }, [chatKey, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered.length]);

  useEffect(() => {
    socket.on("typing:update", (data) => {
      if (data.isTyping) setTypingUser(data.username);
      else setTypingUser(null);
    });
    return () => { socket.off("typing:update"); };
  }, []);

  function handleSend() {
    const content = input.trim();
    if (!content) return;
    sendMessage(content, false, replyTarget ? { sender: replyTarget.sender, content: replyTarget.content } : null);
    setInput("");
    setReplyTarget(null);
    socket.emit("typing:stop", { chatKey, username: state.displayName });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function startReply(msg) {
    setReplyTarget({ id: msg.id, sender: msg.sender, content: msg.content });
    inputRef.current?.focus();
  }

  function sendMedia() {
    const url = mediaUrl.trim();
    if (!url) return;
    sendMessage(url, true, null);
    setMediaUrl("");
    setMediaModalOpen(false);
  }

  function getChatInfo() {
    if (state.activeChatType === "channel") {
      const server = state.servers.find(s => s.id === state.activeServerId);
      const channel = server?.channels.find(c => c.id === state.activeChannelId);
      return { prefix: "#", name: channel?.name || "general", desc: channel ? "Text channel in " + server?.name : "" };
    } else if (state.activeChatType === "dm") {
      const friend = state.friends.find(f => f.id === state.activeDmFriendId);
      return { prefix: "@", name: friend?.username || "User DMs", desc: friend?.status?.toUpperCase() + (friend?.customStatus ? " - " + friend.customStatus : "") };
    } else if (state.activeChatType === "group") {
      const group = state.groupChats.find(g => g.id === state.activeGroupChatId);
      return { prefix: "📢", name: group?.name || "Group Chat", desc: group ? group.members.length + " members" : "" };
    }
    return { prefix: "#", name: "general", desc: "" };
  }

  const info = getChatInfo();

  return (
    <>
      <div className="chat-header-bar">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="chat-header-hash">{info.prefix}</span>
          <h2 className="chat-header-name">{info.name}</h2>
          {info.desc && <span className="chat-header-desc">{info.desc}</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="search-chat">
            <input type="text" placeholder="Search..." value={state.chatSearchQuery}
              onChange={e => dispatch({ type: "SET_CHAT_SEARCH", payload: e.target.value })} />
            <span>🔍</span>
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {filtered.length === 0 ? (
          <div className="empty-state" style={{ height: "100%" }}>
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">{query ? "No results" : "No messages yet"}</div>
            <div className="empty-state-desc">{query ? "No messages match your search." : "Send a message to start the conversation."}</div>
          </div>
        ) : (
          filtered.map(msg => (
            <MessageItem key={msg.id} msg={msg} onReply={startReply} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {replyTarget && (
        <div style={{ padding: "6px 16px 0", background: "var(--bg-secondary)" }}>
          <div className="reply-indicator">
            <span>Replying to <strong>{replyTarget.sender}</strong>: {replyTarget.content.substring(0, 60)}</span>
            <span className="cancel-reply" onClick={() => setReplyTarget(null)}>✕</span>
          </div>
        </div>
      )}

      <div className="chat-input-area">
        {typingUser && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ display: "inline-flex", gap: 2 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-muted)", animation: "pulse 1s infinite" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-muted)", animation: "pulse 1s infinite 0.2s" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--text-muted)", animation: "pulse 1s infinite 0.4s" }} />
            </span>
            {typingUser} is typing...
          </div>
        )}
        <div className="chat-input-wrapper">
          <button className="upload-btn" title="Attach image" onClick={() => setMediaModalOpen(true)}>📎</button>
          <input ref={inputRef} type="text" placeholder="Type a message..."
            value={input} onChange={e => {
              setInput(e.target.value);
              if (e.target.value.trim()) socket.emit("typing:start", { chatKey, username: state.displayName });
              else socket.emit("typing:stop", { chatKey, username: state.displayName });
            }}
            onKeyDown={handleKeyDown} />
          <button className="send-btn" onClick={handleSend} disabled={!input.trim()}>➤</button>
        </div>
      </div>

      {mediaModalOpen && (
        <div className="call-overlay" onClick={() => setMediaModalOpen(false)}>
          <div className="call-card" onClick={e => e.stopPropagation()} style={{ minWidth: 340 }}>
            <h3 style={{ marginBottom: 16 }}>Attach Image Link</h3>
            <input type="text" placeholder="https://..." className="dm-friend-search" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button className="login-submit" style={{ background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)" }} onClick={() => setMediaModalOpen(false)}>Cancel</button>
              <button className="login-submit" style={{ width: "auto", padding: "10px 20px" }} onClick={sendMedia}>Attach</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
