import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { ConfirmContext, type ConfirmOptions } from "@/hooks/useConfirm";

/**
 * Mounts a single themed confirmation dialog and hands components a
 * promise-returning `useConfirm()` (see `@/hooks/useConfirm`) so no screen has
 * to fall back to the browser's native `confirm()` chrome.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setOptions(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    // If a dialog is somehow still open, settle it before showing the next.
    resolverRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options && (
        <Modal
          title={options.title}
          subtitle={options.message}
          onClose={() => close(false)}
          maxWidth="max-w-sm"
          overlayClassName="layer-call"
          footer={
            <>
              <button
                type="button"
                onClick={() => close(false)}
                className="btn-ghost px-4 py-2 text-sm"
              >
                {options.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                className={`${options.tone === "danger" ? "btn-danger" : "btn-primary"} px-4 py-2 text-sm`}
              >
                {options.confirmLabel ?? "Confirm"}
              </button>
            </>
          }
        >
          {null}
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
