import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApp, getActiveChatKey } from "../contexts/AppContext";
import socket from "../services/socket";
import { api } from "../services/api";
import MessageItem from "./MessageItem";
import EmojiPicker from "./EmojiPicker";

const ACCEPTED_TYPES = "image/*,video/mp4,video/webm,application/pdf,.txt,.zip,.rar";

export default function ChatPanel() {
  const { state, dispatch, loadMessages, sendMessage, addToast } = useApp();
  const [input, setInput] = useState("");
  const [replyTarget, setReplyTarget] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatKey = getActiveChatKey(state);
  const messages = state.messages[chatKey] || [];
  const query = state.chatSearchQuery.trim().toLowerCase();
  const filtered = query
    ? messages.filter(m => m.content?.toLowerCase().includes(query) || m.sender?.toLowerCase().includes(query))
    : messages;

  const hasMore = state.messageCursors[chatKey]?.hasMore;
  const typingData = state.typingUsers[chatKey];
  const typingUsers = typingData?.isTyping ? [typingData.username] : [];

  useEffect(() => {
    if (chatKey) {
      setLoading(true);
      loadMessages(chatKey).finally(() => setLoading(false));
      socket.emit("join:chat", chatKey);
      return () => { socket.emit("leave:chat", chatKey); };
    }
  }, [chatKey, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [filtered.length]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !hasMore || loading) return;
    if (el.scrollTop < 100) {
      const firstMsg = messages[0];
      if (firstMsg) {
        setLoading(true);
        loadMessages(chatKey, { before: firstMsg.id, limit: 50 }).finally(() => setLoading(false));
      }
    }
  }, [hasMore, loading, messages, chatKey, loadMessages]);

  function handleSend() {
    const content = input.trim();
    if (!content && attachments.length === 0) return;
    sendMessage(
      content || " ",
      false,
      replyTarget ? { sender: replyTarget.sender, content: replyTarget.content } : null,
      attachments
    );
    setInput("");
    setReplyTarget(null);
    setAttachments([]);
    socket.emit("typing:stop", { chatKey, username: state.displayName });
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setReplyTarget(null);
      setShowEmojiPicker(false);
    }
  }

  function startReply(msg) {
    setReplyTarget({ id: msg.id, sender: msg.sender, content: msg.content });
    inputRef.current?.focus();
  }

  function handleEmojiSelect(emoji) {
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  }

  async function handleFileSelect(files) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await api.upload.multiple(fileArray, (progress) => {
        dispatch({ type: "SET_UPLOAD_PROGRESS", payload: progress });
      });
      setAttachments(prev => [...prev, ...uploaded]);
      addToast(`${uploaded.length} file(s) uploaded`, "success");
    } catch (e) {
      addToast(e.message || "Upload failed", "error");
    } finally {
      setUploading(false);
      dispatch({ type: "SET_UPLOAD_PROGRESS", payload: null });
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function removeAttachment(index) {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }

  function getChatInfo() {
    if (state.activeChatType === "channel") {
      const server = state.servers.find(s => s.id === state.activeServerId);
      const channel = server?.channels?.find(c => c.id === state.activeChannelId);
      return { prefix: "#", name: channel?.name || "general", desc: channel ? "Text channel in " + server?.name : "" };
    } else if (state.activeChatType === "dm") {
      const friend = state.friends.find(f => f.id === state.activeDmFriendId);
      return { prefix: "@", name: friend?.username || "User", desc: "" };
    } else if (state.activeChatType === "group") {
      const group = state.groupChats.find(g => g.id === state.activeGroupChatId);
      return { prefix: "\uD83D\uDCE2", name: group?.name || "Group", desc: group ? group.members?.length + " members" : "" };
    }
    return { prefix: "#", name: "general", desc: "" };
  }

  const info = getChatInfo();

  if (!chatKey) {
    return (
      <div className="chat-area">
        <div className="empty-state" style={{ height: "100%" }}>
          <div className="empty-state-icon">\uD83D\uDCAC</div>
          <div className="empty-state-title">Select a conversation</div>
          <div className="empty-state-desc">Choose a channel or friend from the sidebar to start chatting.</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={"chat-area" + (dragOver ? " drag-over" : "")}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-hash">{info.prefix}</span>
          <span className="chat-header-name">{info.name}</span>
          {info.desc && <span className="chat-header-desc">{info.desc}</span>}
        </div>
        <div className="chat-header-actions">
          <div className="chat-search">
            <input type="text" placeholder="Search" value={state.chatSearchQuery}
              onChange={e => dispatch({ type: "SET_CHAT_SEARCH", payload: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="chat-messages" ref={scrollRef} onScroll={handleScroll}>
        {loading && messages.length > 0 && (
          <div className="chat-loading">
            <div className="loading-spinner" />
            Loading more...
          </div>
        )}
        {filtered.length === 0 && !loading ? (
          <div className="empty-state" style={{ height: "100%" }}>
            <div className="empty-state-icon">{query ? "\uD83D\uDD0D" : "\uD83D\uDCAC"}</div>
            <div className="empty-state-title">{query ? "No results" : "No messages yet"}</div>
            <div className="empty-state-desc">
              {query ? "No messages match your search." : "Send a message to start the conversation."}
            </div>
          </div>
        ) : (
          filtered.map(msg => (
            <MessageItem key={msg.id} msg={msg} onReply={startReply} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-upload-area">
        {dragOver && (
          <div className="drag-overlay">
            Drop files to upload
          </div>
        )}
        {uploading && state.uploadProgress !== null && (
          <div className="upload-progress">
            <div className="upload-progress-bar" style={{ width: state.uploadProgress + "%" }} />
            <span className="upload-progress-text">{state.uploadProgress}%</span>
          </div>
        )}
      </div>

      {attachments.length > 0 && (
        <div className="attachment-preview-bar">
          {attachments.map((att, i) => (
            <div key={i} className="attachment-preview-item">
              <div className="attachment-icon">
                {att.type === "image" ? "\uD83D\uDDBC" : "\uD83D\uDCCE"}
              </div>
              <div className="attachment-info">
                <div className="attachment-name">{att.name}</div>
                <div className="attachment-size">{Math.round(att.size / 1024)}KB</div>
              </div>
              <button className="attachment-remove" onClick={() => removeAttachment(i)}>&#10005;</button>
            </div>
          ))}
        </div>
      )}

      {replyTarget && (
        <div className="reply-preview">
          <div className="reply-preview-content">
            <span className="reply-preview-label">Replying to {replyTarget.sender}</span>
            <span className="reply-preview-text">{replyTarget.content?.substring(0, 80)}</span>
          </div>
          <button className="reply-cancel-btn" onClick={() => setReplyTarget(null)}>&#10005;</button>
        </div>
      )}

      <div className="typing-indicator">
        {typingUsers.length > 0 && typingUsers[0] !== state.displayName && (
          <>
            <div className="typing-dots">
              <span /><span /><span />
            </div>
            {typingUsers[0]} is typing...
          </>
        )}
      </div>

      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <button className="input-action-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
            +
          </button>
          <input
            type="file"
            ref={fileInputRef}
            accept={ACCEPTED_TYPES}
            multiple
            className="hidden"
            onChange={e => { handleFileSelect(e.target.files); e.target.value = ""; }}
          />
          <button className="input-action-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Emoji">
            &#128522;
          </button>
          <input
            ref={inputRef}
            type="text"
            placeholder={"Message #" + info.name}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              if (e.target.value.trim()) socket.emit("typing:start", { chatKey, username: state.displayName });
              else socket.emit("typing:stop", { chatKey, username: state.displayName });
            }}
            onKeyDown={handleKeyDown}
          />
          <button className="send-btn" onClick={handleSend} disabled={!input.trim() && attachments.length === 0} title="Send">
            &#10148;
          </button>
        </div>
      </div>

      {showEmojiPicker && (
        <EmojiPicker onSelect={handleEmojiSelect} onClose={() => setShowEmojiPicker(false)} />
      )}
    </div>
  );
}
