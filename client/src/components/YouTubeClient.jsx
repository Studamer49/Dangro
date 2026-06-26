import React, { useState } from "react";
import { useApp } from "../contexts/AppContext";

export default function YouTubeClient() {
  const { state: { youtubeVideos, activeYtVideoId, friends }, dispatch } = useApp();
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [videos, setVideos] = useState(youtubeVideos);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!search.trim()) { setVideos(youtubeVideos); return; }
    const q = search.toLowerCase();
    setVideos(youtubeVideos.filter(v => v.title.toLowerCase().includes(q) || v.channelName.toLowerCase().includes(q)));
  };

  const handlePlayVideo = (videoId) => {
    dispatch({ type: "SET_YT_VIDEO", payload: videoId });
  };

  return (
    <div className="yt-panel">
      <div className="yt-video-container">
        <iframe
          src={`https://www.youtube.com/embed/${activeYtVideoId}?autoplay=1&mute=1`}
          title="YouTube player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="yt-controls">
        <form onSubmit={handleSearch} className="yt-search-form">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search videos..."
            className="yt-search-input"
          />
          <button type="submit" className="yt-search-btn">Search</button>
        </form>
      </div>
      <div className="yt-video-list">
        {videos.map(video => (
          <div
            key={video.id}
            className={`yt-video-item ${activeYtVideoId === video.id ? "active" : ""}`}
            onClick={() => handlePlayVideo(video.id)}
          >
            <div className="yt-thumb">
              <img src={video.thumbnail} alt={video.title} />
              <span className="yt-play-icon">▶</span>
            </div>
            <div className="yt-video-info">
              <div className="yt-video-title">{video.title}</div>
              <div className="yt-video-channel">{video.channelName}</div>
              <div className="yt-video-meta">{video.views} • {video.likes}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
