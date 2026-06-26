import React from "react";
import { useApp } from "../contexts/AppContext";

export default function TopBar({ onSettings, onCall }) {
  const { state, dispatch, logout } = useApp();

  function switchNav(nav) {
    dispatch({ type: "SET_NAV_TAB", payload: nav });
  }

  return (
    <header className="top-bar">
      <div className="top-bar-left">
        <span className="top-bar-logo">Dangro</span>
      </div>
      <div className="top-bar-center">
        <div className="top-nav-tabs">
          {["servers", "groupchats", "dms"].map(nav => (
            <button
              key={nav}
              className={"top-nav-btn" + (state.activeNavTab === nav ? " active" : "")}
              data-nav={nav}
              onClick={() => switchNav(nav)}
            >
              {nav === "servers" ? "Servers" : nav === "groupchats" ? "Group Chats" : "DMs"}
            </button>
          ))}
        </div>
      </div>
      <div className="top-bar-right">
        <button className="top-icon-btn" title="Start a Call" onClick={onCall}>📞</button>
        <button className="top-icon-btn" title="Settings" onClick={onSettings}>⚙️</button>
        <button className="top-icon-btn" title="Log Out" onClick={logout}>🚪</button>
      </div>
    </header>
  );
}
