import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function InstagramClient() {
  const { state: { instagramPosts }, dispatch } = useApp();
  const [commentInputs, setCommentInputs] = useState({});

  const handleLike = (postId) => {
    dispatch({ type: "TOGGLE_IG_LIKE", payload: postId });
  };

  const handleComment = (postId) => {
    const text = commentInputs[postId];
    if (!text?.trim()) return;
    dispatch({ type: "ADD_IG_COMMENT", payload: { postId, text } });
    setCommentInputs(p => ({ ...p, [postId]: "" }));
  };

  return (
    <div className="ig-panel">
      <div className="ig-header">
        <h2>Instagram</h2>
        <span className="ig-header-icon">📷</span>
      </div>
      <div className="ig-feed">
        {instagramPosts.map(post => (
          <div key={post.id} className="ig-post">
            <div className="ig-post-header">
              <div className="ig-user-avatar" style={{ backgroundColor: post.userAvatarColor }}>
                {post.username[0].toUpperCase()}
              </div>
              <span className="ig-username">{post.username}</span>
            </div>
            <div className="ig-post-image">
              <img src={post.image} alt="Post" />
            </div>
            <div className="ig-post-actions">
              <button className={`ig-action-btn ${post.liked ? "liked" : ""}`} onClick={() => handleLike(post.id)}>
                {post.liked ? "❤️" : "🤍"}
              </button>
              <span className="ig-likes">{post.likes} likes</span>
            </div>
            <div className="ig-post-caption">
              <strong>{post.username}</strong> {post.caption}
            </div>
            <div className="ig-post-comments">
              {post.comments.map((c, i) => (
                <div key={i} className="ig-comment"><strong>{c.username}</strong> {c.text}</div>
              ))}
            </div>
            <div className="ig-comment-form">
              <input
                type="text"
                value={commentInputs[post.id] || ""}
                onChange={e => setCommentInputs(p => ({ ...p, [post.id]: e.target.value }))}
                placeholder="Add a comment..."
                onKeyDown={e => e.key === "Enter" && handleComment(post.id)}
              />
              <button onClick={() => handleComment(post.id)}>Post</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
