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
    <div className="main-content-area" style={style}>
      <section id="left-panel" className={"app-panel left-panel" + (state.leftPanelCollapsed ? " collapsed" : "")}>
        <LeftPanel />
      </section>

      <div id="divider-left" className={"resize-divider" + (isDraggingLeft ? " dragging" : "")}
        onMouseDown={(e) => { if (!e.target.closest(".divider-arrow")) { setIsDraggingLeft(true); } }}>
        <button className={"divider-arrow arrow-left" + (state.leftPanelCollapsed ? " hidden" : "")} id="btn-collapse-left"
          onClick={() => saveLayout({ leftPanelCollapsed: true })}>◀</button>
        <div className="resize-handle-visual"></div>
        <button className={"divider-arrow arrow-right" + (!state.leftPanelCollapsed ? " hidden" : "")} id="btn-expand-left"
          onClick={() => saveLayout({ leftPanelCollapsed: false })}>▶</button>
      </div>

      <main id="middle-panel" className="app-panel chat-panel">
        <ChatPanel />
      </main>

      <div id="divider-right" className={"resize-divider" + (isDraggingRight ? " dragging" : "")}
        onMouseDown={(e) => { if (!e.target.closest(".divider-arrow")) { setIsDraggingRight(true); } }}>
        <button className={"divider-arrow arrow-left" + (!state.rightPanelCollapsed ? " hidden" : "")} id="btn-expand-right"
          onClick={() => saveLayout({ rightPanelCollapsed: false })}>◀</button>
        <div className="resize-handle-visual"></div>
        <button className={"divider-arrow arrow-right" + (state.rightPanelCollapsed ? " hidden" : "")} id="btn-collapse-right"
          onClick={() => saveLayout({ rightPanelCollapsed: true })}>▶</button>
      </div>

      <aside id="right-panel" className={"app-panel right-panel" + (state.rightPanelCollapsed ? " collapsed" : "")}>
        <RightPanel />
      </aside>
    </div>
  );
}
