import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApp, getActiveChatKey } from "../contexts/AppContext";
import socket from "../services/socket";
import MessageItem from "./MessageItem";
import EmojiPicker from "./EmojiPicker";

export default function ChatPanel() {
  const { state, dispatch, loadMessages, sendMessage, addToast } = useApp();
  const [input, setInput] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmoji, setShowEmoji] = useState(false);
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
      if (data.isTyping) {
        setTypingUser(data.username);
      } else {
        setTypingUser(null);
      }
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
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }

  function handleInputChange(e) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = e.target.scrollHeight + "px";
    if (e.target.value.trim()) {
      socket.emit("typing:start", { chatKey, username: state.displayName });
    } else {
      socket.emit("typing:stop", { chatKey, username: state.displayName });
    }
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

  function cancelReply() {
    setReplyTarget(null);
  }

  function sendMedia() {
    const url = mediaUrl.trim();
    if (!url) return;
    sendMessage(url, true, null);
    setMediaUrl("");
    setMediaModalOpen(false);
  }

  function handleClearChat() {
    if (window.confirm("Clear chat history?")) {
      dispatch({ type: "SET_MESSAGES", chatKey, payload: [] });
    }
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
      <header className="chat-header">
        <div className="chat-header-title">
          <span className="chat-hash">{info.prefix}</span>
          <h2 id="chat-header-name">{info.name}</h2>
          {info.desc && <p className="chat-header-desc">{info.desc}</p>}
        </div>
        <div className="chat-header-actions">
          <div className="chat-search">
            <input type="text" placeholder="Search..." value={state.chatSearchQuery}
              onChange={e => dispatch({ type: "SET_CHAT_SEARCH", payload: e.target.value })} />
          </div>
          <button className="header-action-btn" title="Clear Chat" onClick={handleClearChat}>🗑️</button>
        </div>
      </header>

      <div className="chat-messages" id="chat-messages-container">
        {filtered.length === 0 ? (
          <div style={{
            flexGrow: 1, display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", color: "var(--text-muted)", fontSize: "0.8rem", padding: "20px"
          }}>
            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>💬</div>
            <p>{query ? "No messages match your search." : "No messages yet."}</p>
          </div>
        ) : (
          filtered.map(msg => (
            <MessageItem key={msg.id} msg={msg} onReply={startReply} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {replyTarget && (
        <div className="reply-preview">
          <div className="reply-preview-content">
            <span className="reply-preview-label">Replying to <span id="reply-target-name">{replyTarget.sender}</span></span>
            <span id="reply-target-text" className="reply-preview-text">{replyTarget.content.substring(0, 100)}</span>
          </div>
          <button className="reply-cancel-btn" onClick={cancelReply}>✕</button>
        </div>
      )}

      <footer className="chat-footer">
        {typingUser && (
          <div className="typing-indicator-bar">
            <span className="typing-dots"><span></span><span></span><span></span></span>
            <span className="typing-text">{typingUser} is typing...</span>
          </div>
        )}
        <div className="input-actions-wrapper">
          <button className="input-action-btn" title="Attach" onClick={() => setMediaModalOpen(true)}>📎</button>
          <div className="chat-input-box">
            <textarea ref={inputRef} id="message-input" placeholder={"Message " + info.prefix + info.name + "..."}
              rows="1" value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}></textarea>
          </div>
          <button className="input-action-btn" title="Emoji" onClick={(e) => { e.stopPropagation(); setShowEmoji(!showEmoji); }}>😀</button>
          {showEmoji && <EmojiPicker onSelect={(emoji) => { setInput(prev => prev + emoji); inputRef.current?.focus(); }} onClose={() => setShowEmoji(false)} />}
          <button className="input-action-btn send-btn" title="Send" onClick={handleSend}>➤</button>
        </div>
      </footer>

      {mediaModalOpen && (
        <div className="modal" onClick={() => setMediaModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>Attach Image Link</h3>
            <p>Paste a direct image URL (JPEG, PNG, GIF).</p>
            <input type="text" placeholder="https://..." className="modal-input" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} />
            <div className="modal-buttons">
              <button className="modal-btn cancel" onClick={() => setMediaModalOpen(false)}>Cancel</button>
              <button className="modal-btn submit" onClick={sendMedia}>Attach</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
