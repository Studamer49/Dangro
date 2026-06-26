import React, { useState, useEffect } from "react";
import { useApp } from "../contexts/AppContext";

export default function MessageItem({ msg, onReply }) {
  const { state } = useApp();
  const isMe = msg.sender === state.displayName;
  const avatarChar = msg.system ? "⚙️" : (isMe ? state.displayName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase());
  const avatarColor = msg.system ? "transparent" : (isMe ? "#ffffff" : "#444444");

  let contentDisplay = msg.content;
  let isImage = msg.isImage || /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(msg.content) || msg.content.startsWith("https://images.unsplash.com/");

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  const reactions = msg.reactions || {};

  return (
    <div className={"message-item" + (msg.system ? " system-msg" : "")} data-msg-id={msg.id}>
      <div className="msg-avatar" style={{
        backgroundColor: avatarColor,
        ...(isMe && !msg.system ? { color: "#000" } : {})
      }}>
        {avatarChar}
      </div>
      <div className="msg-body">
        <div className="msg-header">
          <span className="msg-sender">{msg.system ? "System" : escapeHtml(msg.sender)}</span>
          <span className="msg-time">{msg.timestamp || ""}</span>
        </div>
        {msg.replyTo && (
          <div className="msg-reply-preview">
            <span className="msg-reply-sender">{escapeHtml(msg.replyTo.sender)}</span>
            <span className="msg-reply-text">{escapeHtml(msg.replyTo.content.substring(0, 80))}</span>
          </div>
        )}
        <div className="msg-content">
          {isImage ? (
            <>
              {escapeHtml(msg.content)}
              <div className="msg-image-attachment">
                <img src={escapeHtml(msg.content)} alt="Attachment"
                  onError={(e) => { e.target.style.display = "none"; e.target.parentElement.innerHTML = '<span style="color:#666;font-size:0.7rem;padding:4px;">Image failed to load</span>'; }} />
              </div>
            </>
          ) : (
            escapeHtml(contentDisplay)
          )}
        </div>
        {Object.keys(reactions).length > 0 && (
          <div className="msg-reactions">
            {Object.entries(reactions).map(([emoji, users]) => (
              <span key={emoji} className={"msg-reaction" + (users.includes(state.displayName) ? " active" : "")}>
                {emoji} <span className="msg-reaction-count">{users.length}</span>
              </span>
            ))}
          </div>
        )}
        {!msg.system && (
          <div className="msg-actions-bar">
            <button className="msg-action-btn btn-reply" title="Reply" onClick={() => onReply(msg)}>↩️</button>
            <button className="msg-action-btn btn-react" title="React">😀</button>
          </div>
        )}
      </div>
    </div>
  );
}
