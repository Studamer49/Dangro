import React, { useState } from "react";

const BLOCKED_DOMAINS = ["google.com", "youtube.com", "instagram.com", "facebook.com", "github.com", "discord.com", "twitter.com", "x.com"];

export default function CustomBrowser() {
  const [url, setUrl] = useState("https://wikipedia.org");
  const [history, setHistory] = useState(["https://wikipedia.org"]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [loadUrl, setLoadUrl] = useState("https://wikipedia.org");
  const [showWarning, setShowWarning] = useState(false);

  function navigate(newUrl) {
    let finalUrl = newUrl;
    if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      finalUrl = "https://" + finalUrl;
    }
    setUrl(finalUrl);
    setLoadUrl(finalUrl);
    const next = history.slice(0, historyIndex + 1);
    next.push(finalUrl);
    setHistory(next);
    setHistoryIndex(next.length - 1);
    setShowWarning(BLOCKED_DOMAINS.some(d => finalUrl.toLowerCase().includes(d)));
  }

  function goBack() {
    if (historyIndex > 0) {
      const newIdx = historyIndex - 1;
      setHistoryIndex(newIdx);
      setUrl(history[newIdx]);
      setLoadUrl(history[newIdx]);
    }
  }

  function goForward() {
    if (historyIndex < history.length - 1) {
      const newIdx = historyIndex + 1;
      setHistoryIndex(newIdx);
      setUrl(history[newIdx]);
      setLoadUrl(history[newIdx]);
    }
  }

  function refresh() {
    setLoadUrl(prev => prev + "#" + Date.now());
  }

  return (
    <>
      <div className="browser-address-bar">
        <div className="browser-controls">
          <button onClick={goBack}>◀</button>
          <button onClick={goForward}>▶</button>
          <button onClick={refresh}>🔄</button>
        </div>
        <input type="text" value={url} onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") navigate(url); }} />
        <button onClick={() => navigate(url)}>Go</button>
      </div>
      <div className="browser-viewport-wrapper">
        {loadUrl && (
          <iframe
            key={loadUrl}
            src={loadUrl}
            title="Browser"
            loading="lazy"
          ></iframe>
        )}
        {showWarning && (
          <div className="browser-overlay-warning">
            <div className="warning-box">
              <div className="warning-icon">⚠️</div>
              <h4>Frame Embedding Restricted</h4>
              <p>This website prevents embed loading inside other pages for security reasons.</p>
              <p className="warning-tip">Try sites like <strong>wikipedia.org</strong> or <strong>example.com</strong>.</p>
              <button onClick={() => setShowWarning(false)}>I Understand</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
