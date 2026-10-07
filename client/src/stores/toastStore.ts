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

/** Convenience wrapper: `const toast = useToast(); toast.error("Nope")`. */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    success: (message: string) => push(message, "success"),
    error: (message: string) => push(message, "error"),
    info: (message: string) => push(message, "info"),
  };
}
