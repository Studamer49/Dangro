import React, { useState, useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import { api } from "../services/api";
import ServerSection from "./ServerSection";
import GroupChatSection from "./GroupChatSection";
import DMList from "./DMList";

export default function RightPanel() {
  const { state, dispatch } = useApp();

  return (
    <>
      <div id="right-servers-view" className={"right-view" + (state.activeNavTab === "servers" ? " active" : "")}>
        <ServerSection />
      </div>
      <div id="right-groupchats-view" className={"right-view" + (state.activeNavTab === "groupchats" ? " active" : "")}>
        <GroupChatSection />
      </div>
      <div id="right-dms-view" className={"right-view" + (state.activeNavTab === "dms" ? " active" : "")}>
        <DMList />
      </div>
    </>
  );
}
