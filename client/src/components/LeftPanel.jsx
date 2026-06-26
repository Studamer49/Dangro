import React from "react";
import { useApp } from "../contexts/AppContext";
import YouTubeClient from "./YouTubeClient";
import InstagramClient from "./InstagramClient";
import CustomBrowser from "./CustomBrowser";

export default function LeftPanel() {
  const { state, dispatch } = useApp();

  const tabs = [
    { id: "youtube-client", label: "YT" },
    { id: "instagram-client", label: "IG" },
    { id: "custom-browser", label: "Web" },
  ];

  return (
    <>
      <div className="left-panel-header">
        <h2>Dangro Hub</h2>
      </div>
      <div className="left-panel-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={"left-panel-tab" + (state.activeLeftTab === tab.id ? " active" : "")}
            onClick={() => dispatch({ type: "SET_LEFT_TAB", payload: tab.id })}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="left-panel-content">
        {state.activeLeftTab === "youtube-client" && <YouTubeClient />}
        {state.activeLeftTab === "instagram-client" && <InstagramClient />}
        {state.activeLeftTab === "custom-browser" && <CustomBrowser />}
      </div>
    </>
  );
}
