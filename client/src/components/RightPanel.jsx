import React from "react";
import { useApp } from "../contexts/AppContext";
import ServerSection from "./ServerSection";
import GroupChatSection from "./GroupChatSection";
import DMList from "./DMList";

export default function RightPanel() {
  const { state, dispatch } = useApp();

  const navItems = [
    { id: "servers", label: "Servers" },
    { id: "groupchats", label: "Groups" },
    { id: "dms", label: "DMs" },
  ];

  return (
    <>
      <div className="right-panel-header">
        <h2>Dangro</h2>
      </div>
      <div className="right-panel-nav">
        {navItems.map(item => (
          <button
            key={item.id}
            className={"right-nav-btn" + (state.activeNavTab === item.id ? " active" : "")}
            onClick={() => dispatch({ type: "SET_NAV_TAB", payload: item.id })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="right-panel-content">
        {state.activeNavTab === "servers" && <ServerSection />}
        {state.activeNavTab === "groupchats" && <GroupChatSection />}
        {state.activeNavTab === "dms" && <DMList />}
      </div>
    </>
  );
}
