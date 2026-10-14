import { useToastStore } from "@/stores/toastStore";

/**
 * Toasts keep their own tinted surface rather than the neutral glass panel:
 * the variant IS the message here, so the colour has to be visible at a
 * glance without reading the text. Each carries a coloured glow on the same
 * edge so the stack reads as one system.
 */
const styles: Record<string, string> = {
  success:
    "!border-emerald-400/30 !bg-emerald-950/80 !text-emerald-100 shadow-[0_10px_40px_-12px_rgb(16_185_129/0.55)]",
  error:
    "!border-red-400/30 !bg-red-950/80 !text-red-100 shadow-[0_10px_40px_-12px_rgb(239_68_68/0.55)]",
  info: "!border-gray-600/50 !bg-gray-900/80 !text-gray-100 shadow-elev3",
};

const dots: Record<string, string> = {
  success: "bg-emerald-400",
  error: "bg-red-400",
  info: "bg-gray-400",
};

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      // `role=status` so screen readers announce a toast that arrives while
      // the user is focused elsewhere on the page.
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`glass-panel pointer-events-auto flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium backdrop-blur animate-toast-in transition-transform duration-150 hover:scale-[1.02] ${
            styles[toast.variant] ?? styles.info
          }`}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${dots[toast.variant] ?? dots.info}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1">{toast.message}</span>
        </button>
      ))}
    </div>
  );
}