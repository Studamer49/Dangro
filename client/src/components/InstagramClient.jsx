import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function InstagramClient() {
  const { state, dispatch } = useApp();
  const [commentText, setCommentText] = useState({});

  function toggleLike(postId) {
    dispatch({ type: "TOGGLE_IG_LIKE", payload: postId });
  }

  function addComment(postId) {
    const text = commentText[postId]?.trim();
    if (!text) return;
    dispatch({ type: "ADD_IG_COMMENT", payload: { postId, text } });
    setCommentText(prev => ({ ...prev, [postId]: "" }));
  }

  return (
    <>
      <div className="ig-profile-header">
        <div className="ig-logo">Instagram</div>
        <div className="ig-user-badge">
          <div className="user-avatar-small" style={{ background: "#555" }}>D</div>
          <span>dangro_user</span>
        </div>
      </div>
      <div className="ig-feed">
        {state.instagramPosts.map(post => (
          <div key={post.id} className="ig-post-card">
            <div className="ig-post-header">
              <div className="user-avatar-small" style={{ backgroundColor: post.userAvatarColor }}>
                {post.username.charAt(0).toUpperCase()}
              </div>
              <span className="ig-post-author">{post.username}</span>
            </div>
            <div className="ig-post-image" style={{ backgroundImage: `url(${post.image})` }}></div>
            <div className="ig-post-actions">
              <button className={"ig-action-btn" + (post.liked ? " liked" : "")} onClick={() => toggleLike(post.id)}>
                <span>{post.liked ? "❤️" : "🤍"}</span>
              </button>
              <button className="ig-action-btn" onClick={() => document.getElementById("ig-comment-" + post.id)?.focus()}>
                <span>💬</span>
              </button>
            </div>
            <div className="ig-post-likes">{post.likes.toLocaleString()} likes</div>
            <div className="ig-post-caption">
              <span className="author">{post.username}</span>
              {post.caption}
            </div>
            <div className="ig-comments-box">
              <div className="ig-comments-list">
                {post.comments.map((c, i) => (
                  <div key={i} className="ig-comment-item">
                    <span className="commenter">{c.username}</span>
                    {c.text}
                  </div>
                ))}
              </div>
              <div className="ig-add-comment">
                <input
                  id={"ig-comment-" + post.id}
                  type="text"
                  placeholder="Add a comment..."
                  value={commentText[post.id] || ""}
                  onChange={e => setCommentText(prev => ({ ...prev, [post.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") addComment(post.id); }}
                />
                <button onClick={() => addComment(post.id)}>Post</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
