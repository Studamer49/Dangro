import React from "react";
import { AppProvider, useApp } from "./contexts/AppContext";
import LoginPage from "./pages/LoginPage";
import MainPage from "./pages/MainPage";

function AppContent() {
  const { state } = useApp();
  return state.user ? <MainPage /> : <LoginPage />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
