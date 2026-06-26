import React from "react";
import { useApp } from "../contexts/AppContext";

export default function MessageItem({ msg, onReply }) {
  const { state } = useApp();
  const isMe = msg.sender === state.displayName;
  const avatarChar = msg.system ? "⚙️" : (isMe ? state.displayName.charAt(0).toUpperCase() : msg.sender.charAt(0).toUpperCase());
  const avatarColor = msg.system ? "transparent" : (isMe ? "var(--accent)" : "#555");

  let isImage = msg.isImage || /\.(jpeg|jpg|gif|png|webp)(\?.*)?$/i.test(msg.content) || msg.content.startsWith("https://images.unsplash.com/");

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  const reactions = msg.reactions || {};

  return (
    <div className={"message" + (msg.system ? " system-msg" : "")} data-msg-id={msg.id}>
      <div className="msg-avatar" style={{ backgroundColor: msg.system ? "transparent" : avatarColor }}>
        {avatarChar}
      </div>
      <div className="msg-content">
        <div className="msg-header">
          <span className="msg-sender">{msg.system ? "System" : escapeHtml(msg.sender)}</span>
          <span className="msg-timestamp">{msg.timestamp || ""}</span>
        </div>
        {msg.replyTo && (
          <div className="msg-text">
            <div className="reply-preview">
              <strong>{escapeHtml(msg.replyTo.sender)}</strong>: {escapeHtml(msg.replyTo.content.substring(0, 80))}
            </div>
          </div>
        )}
        <div className="msg-text">
          {isImage ? (
            <>
              {escapeHtml(msg.content)}
              <div>
                <img src={escapeHtml(msg.content)} alt="Attachment" className="msg-image"
                  onError={(e) => { e.target.style.display = "none"; }} />
              </div>
            </>
          ) : (
            escapeHtml(msg.content)
          )}
        </div>
        {Object.keys(reactions).length > 0 && (
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {Object.entries(reactions).map(([emoji, users]) => (
              <span key={emoji} style={{ background: "var(--bg-tertiary)", borderRadius: 4, padding: "2px 6px", fontSize: 12, cursor: "pointer", border: "1px solid var(--border)" }}>
                {emoji} {users.length}
              </span>
            ))}
          </div>
        )}
        <div className="msg-actions">
          {!msg.system && (
            <button onClick={() => onReply(msg)} title="Reply">↩️</button>
          )}
        </div>
      </div>
    </div>
  );
}
