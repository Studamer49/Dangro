import React from "react";
import { useApp } from "../contexts/AppContext";
import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import RightPanel from "../components/RightPanel";
import SettingsPanel from "../components/SettingsPanel";
import ToastContainer from "../components/ToastContainer";
import CallContainer from "../components/CallContainer";

export default function MainPage() {
  const { state, dispatch, logout } = useApp();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [callOpen, setCallOpen] = React.useState(false);

  return (
    <>
      <div className="app-wrapper">
        <LeftPanel onSettings={() => setSettingsOpen(true)} onCall={() => setCallOpen(true)} />
        <ChatPanel />
        <RightPanel />
      </div>
      <ToastContainer />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {callOpen && <CallContainer onClose={() => setCallOpen(false)} />}
    </>
  );
}
