import React from "react";
import { useApp } from "../contexts/AppContext";
import GroupChatSection from "./GroupChatSection";
import DMList from "./DMList";

export default function RightPanel() {
  const { state, dispatch } = useApp();

  const currentServer = state.servers.find(s => s.id === state.activeServerId);

  const navItems = [
    { id: "dms", label: "Friends" },
    { id: "groupchats", label: "Groups" },
  ];

  const displayRight = state.activeNavTab !== "dms" || currentServer;

  return (
    <div className="right-panel" style={{ display: state.rightPanelCollapsed ? "none" : "flex" }}>
      {currentServer ? (
        <>
          <div className="right-panel-header">
            <h2>Members</h2>
          </div>
          <div className="right-panel-content">
            <div className="right-section-header">
              <span>Online — {currentServer.members?.length || 0}</span>
            </div>
            {currentServer.members?.map(member => (
              <div key={member.id} className="member-item">
                <div className="member-avatar" style={{ background: "#5865f2" }}>
                  {member.username.charAt(0).toUpperCase()}
                </div>
                <span className="member-name">{member.display_name || member.username}</span>
                <span className="member-status" style={{
                  background: member.status === "online" ? "var(--green)" :
                    member.status === "idle" ? "var(--yellow)" :
                    member.status === "dnd" ? "var(--red)" : "var(--text-muted)"
                }} />
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="right-panel-header">
            <h2>Social</h2>
          </div>
          <div className="right-panel-content">
            <DMList />
          </div>
        </>
      )}
    </div>
  );
}
