import React from "react";
import { useApp } from "../contexts/AppContext";

export default function ToastContainer() {
  const { state } = useApp();
  return (
    <div className="toast-container">
      {state.toasts.map(t => (
        <div key={t.id} className={"toast toast-" + t.type}>
          <span className="toast-icon">
            {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "⚡"}
          </span>
          <div className="toast-msg">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
