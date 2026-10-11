import { useMemo } from "react";
import { create } from "zustand";

export type ToastVariant = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],

  push: (message, variant = "info") => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, message, variant }] });
    setTimeout(() => get().dismiss(id), 4500);
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/**
 * Convenience wrapper: `const toast = useToast(); toast.error("Nope")`.
 *
 * The returned object is memoised on the store's `push`. Returning a fresh
 * literal on every render gave it a new identity each time, so any effect or
 * callback that depended on it re-ran on every render — which several call
 * sites had to work around by mirroring it into a ref.
 */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return useMemo(
    () => ({
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error"),
      info: (message: string) => push(message, "info"),
    }),
    [push]
  );
}
