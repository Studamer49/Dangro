import { createContext, useContext } from "react";

export interface ConfirmOptions {
  /** The question, used as the dialog title. */
  title: string;
  /** Optional supporting line under the title. */
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` paints the confirm action red. */
  tone?: "default" | "danger";
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

/**
 * The context the provider mounts. Lives beside the hook (rather than in the
 * provider's component file) so that file only exports a component and stays
 * eligible for fast refresh.
 */
export const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Replaces the browser's `window.confirm`. Returns a promise, so a call site
 * keeps the familiar `if (!(await confirm(...))) return;` shape while the
 * dialog itself is rendered by the app's own themed modal.
 */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
