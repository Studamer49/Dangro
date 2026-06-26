import React from "react";
import TopBar from "../components/TopBar";
import MainLayout from "../layouts/MainLayout";
import ToastContainer from "../components/ToastContainer";
import SettingsPanel from "../components/SettingsPanel";
import CallContainer from "../components/CallContainer";

export default function MainPage() {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [callOpen, setCallOpen] = React.useState(false);

  return (
    <div className="app-wrapper">
      <div className="bg-gradient-overlay"></div>
      <TopBar onSettings={() => setSettingsOpen(true)} onCall={() => setCallOpen(true)} />
      <MainLayout />
      <ToastContainer />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {callOpen && <CallContainer onClose={() => setCallOpen(false)} />}
    </div>
  );
}
