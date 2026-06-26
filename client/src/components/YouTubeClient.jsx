import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function YouTubeClient() {
  const { state, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [liked, setLiked] = useState(false);

  const activeVideo = state.youtubeVideos.find(v => v.id === state.activeYtVideoId);

  function searchOrPlay() {
    if (!query.trim()) return;
    const urlPattern = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = query.match(urlPattern);
    if (match && match[1]) {
      const videoId = match[1];
      if (!state.youtubeVideos.find(v => v.id === videoId)) {
        dispatch({
          type: "ADD_YOUTUBE_VIDEO",
          payload: { id: videoId, title: "Imported: " + videoId, channelName: "Custom", views: "Stream", likes: "0", thumbnail: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?auto=format&fit=crop&w=400&q=80" },
        });
      }
      dispatch({ type: "SET_YT_VIDEO", payload: videoId });
    }
  }

  function playVideo(videoId) {
    dispatch({ type: "SET_YT_VIDEO", payload: videoId });
  }

  const filtered = query.trim()
    ? state.youtubeVideos.filter(v => v.title.toLowerCase().includes(query.toLowerCase()) || v.channelName.toLowerCase().includes(query.toLowerCase()))
    : state.youtubeVideos;

  return (
    <>
      <div className="youtube-search-wrapper">
        <input type="text" placeholder="Search or paste URL..." value={query}
          onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") searchOrPlay(); }} />
        <button onClick={searchOrPlay}>Go</button>
      </div>
      <div className="youtube-player-container">
        <iframe
          src={`https://www.youtube.com/embed/${state.activeYtVideoId}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          title="YouTube Player"
        ></iframe>
      </div>
      <div className="youtube-video-meta">
        <h3 id="yt-active-title">{activeVideo?.title || "Loading..."}</h3>
        <div className="yt-meta-details">
          <span className="yt-channel-badge">{activeVideo?.channelName || "Channel"}</span>
          <span>{activeVideo?.views || "0 views"}</span>
          <button className={"yt-like-btn" + (liked ? " liked" : "")} onClick={() => setLiked(!liked)}>Like</button>
        </div>
      </div>
      <div className="youtube-feed-list">
        <h4 className="feed-section-title">Recommended</h4>
        <div className="youtube-grid">
          {filtered.map(video => (
            <div key={video.id} className="yt-video-card" onClick={() => playVideo(video.id)}>
              <div className="yt-card-thumbnail" style={{ backgroundImage: `url(${video.thumbnail})` }}></div>
              <div className="yt-card-info">
                <div className="yt-card-title">{video.title}</div>
                <div className="yt-card-chan">{video.channelName}</div>
                <div className="yt-card-views">{video.views}</div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: "10px", fontSize: "0.75rem", color: "var(--text-muted)" }}>No videos found.</div>
          )}
        </div>
      </div>
    </>
  );
}
