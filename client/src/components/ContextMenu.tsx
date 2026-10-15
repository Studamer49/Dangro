import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  children: React.ReactNode;
  /** Preferred width; the menu is clamped to the viewport regardless. */
  width?: number;
}

/**
 * A portal-rendered context menu consistent with the server/server-settings
 * menus. Rendering into `document.body` escapes the `backdrop-filter` panes
 * that would otherwise trap the popup, and the position is clamped to the
 * viewport so menus near an edge stay fully visible.
 */
export default function ContextMenu({ x, y, onClose, children, width = 220 }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(x, window.innerWidth - rect.width - margin);
    const top = Math.min(y, window.innerHeight - rect.height - margin);
    setPos({ left: Math.max(margin, left), top: Math.max(margin, top) });
  }, [x, y]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="layer-popup fixed inset-0"
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        role="menu"
        className="glass-panel anim-pop-in fixed rounded-xl border border-gray-700/60 p-1.5 shadow-elev2"
        style={{ left: pos.left, top: pos.top, width }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

interface ContextMenuItemProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

export function ContextMenuItem({ label, onClick, icon, danger = false, disabled = false }: ContextMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? "text-red-400 hover:bg-red-500/10 hover:text-red-300"
          : "text-gray-300 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

export function ContextMenuSeparator() {
  return <div className="my-1 h-px bg-gray-700/50" />;
}
