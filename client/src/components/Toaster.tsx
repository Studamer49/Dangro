import { useToastStore } from "@/stores/toastStore";

const styles: Record<string, string> = {
  success: "border-emerald-500/40 bg-emerald-950/90 text-emerald-100",
  error: "border-red-500/40 bg-red-950/90 text-red-100",
  info: "border-gray-600/60 bg-gray-900/95 text-gray-100",
};

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismiss(toast.id)}
          className={`pointer-events-auto w-full rounded-lg border px-4 py-3 text-left text-sm shadow-xl backdrop-blur transition-opacity hover:opacity-90 ${styles[toast.variant]}`}
        >
          {toast.message}
        </button>
      ))}
    </div>
  );
}
