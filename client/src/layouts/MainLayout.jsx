import React, { useState, useCallback, useEffect } from "react";
import { useApp } from "../contexts/AppContext";
import LeftPanel from "../components/LeftPanel";
import ChatPanel from "../components/ChatPanel";
import RightPanel from "../components/RightPanel";

export default function MainLayout() {
  const { state, dispatch } = useApp();
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const lw = state.leftPanelCollapsed ? 0 : state.leftPanelWidth;
  const rw = state.rightPanelCollapsed ? 0 : state.rightPanelWidth;
  const mw = 100 - lw - rw;

  const style = {
    "--left-width": lw + "%",
    "--middle-width": mw + "%",
    "--right-width": rw + "%",
  };

  const saveLayout = useCallback((patch) => {
    dispatch({ type: "SET_LAYOUT", payload: patch });
  }, [dispatch]);

  useEffect(() => {
    function handleMouseMove(e) {
      if (!isDraggingLeft && !isDraggingRight) return;
      const sw = window.innerWidth;
      if (isDraggingLeft) {
        let np = (e.clientX / sw) * 100;
        if (np < 12) {
          saveLayout({ leftPanelCollapsed: true });
          setIsDraggingLeft(false);
          return;
        }
        saveLayout({ leftPanelCollapsed: false, leftPanelWidth: Math.min(np, 45) });
      }
      if (isDraggingRight) {
        let np = ((sw - e.clientX) / sw) * 100;
        if (np < 12) {
          saveLayout({ rightPanelCollapsed: true });
          setIsDraggingRight(false);
          return;
        }
        saveLayout({ rightPanelCollapsed: false, rightPanelWidth: Math.min(np, 40) });
      }
    }
    function handleMouseUp() {
      if (isDraggingLeft || isDraggingRight) {
        setIsDraggingLeft(false);
        setIsDraggingRight(false);
        document.body.style.cursor = "default";
      }
    }
    if (isDraggingLeft || isDraggingRight) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingLeft, isDraggingRight, saveLayout]);

  return (
    <div className="main-layout" style={style}>
      {!state.leftPanelCollapsed && (
        <section className="left-panel" style={{ width: "var(--left-width)" }}>
          <LeftPanel />
        </section>
      )}
      <div className={`resize-handle resize-handle-left ${isDraggingLeft ? "dragging" : ""}`} onMouseDown={() => setIsDraggingLeft(true)} />
      {state.leftPanelCollapsed && (
        <button className="collapse-toggle" onClick={() => saveLayout({ leftPanelCollapsed: false })} title="Show left panel">
          ▶
        </button>
      )}

      <main className="chat-area" style={{ flex: 1, width: state.leftPanelCollapsed && state.rightPanelCollapsed ? "100%" : undefined }}>
        <ChatPanel />
      </main>

      {state.rightPanelCollapsed && (
        <button className="collapse-toggle" onClick={() => saveLayout({ rightPanelCollapsed: false })} title="Show right panel" style={{ left: "auto", right: 16 }}>
          ◀
        </button>
      )}
      <div className={`resize-handle resize-handle-right ${isDraggingRight ? "dragging" : ""}`} onMouseDown={() => setIsDraggingRight(true)} />
      {!state.rightPanelCollapsed && (
        <aside className="right-panel" style={{ width: "var(--right-width)" }}>
          <RightPanel />
        </aside>
      )}
    </div>
  );
}
