import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

/**
 * The app's modal shell: overlay, title bar, Escape/backdrop dismissal.
 *
 * Every dialog in the app repeats this markup, and each copy had to remember
 * its own Escape handling. Centralised so dismissal — and the focus handling
 * that goes with it — behaves the same everywhere.
 *
 * Visually this is the heaviest glass surface in the app: fully opaque behind
 * the blur so whatever opened it never shows through the text, plus the widest
 * shadow, because a dialog is the one thing that must read as "above".
 */
export default function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  maxWidth = "max-w-md",
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape has to call the *current* onClose, but the listener and the initial
  // focus below must each be set up exactly once. Keeping both effects keyed on
  // [onClose] re-ran them whenever the caller passed an inline arrow (which has
  // a new identity on every parent render), and the re-focus pulled the caret
  // off the input the user was typing into after a single keystroke.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Move focus into the dialog so Tab stays inside it and Escape is caught
  // without the user having to click the overlay first. Once, on open only.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm animate-overlay-in"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`glass-panel animate-pop-in w-full ${maxWidth} rounded-2xl bg-gray-900/95 p-6 outline-none`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight text-white">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="icon-btn -mr-1 -mt-1">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18.3 5.71a1 1 0 00-1.41 0L12 10.59 7.11 5.7A1 1 0 105.7 7.11L10.59 12 5.7 16.89a1 1 0 101.41 1.41L12 13.41l4.89 4.89a1 1 0 001.41-1.41L13.41 12l4.89-4.89a1 1 0 000-1.4z" />
            </svg>
          </button>
        </div>

        {children}

        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}