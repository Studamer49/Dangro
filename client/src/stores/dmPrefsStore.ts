import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Per-conversation, per-viewer state that only the client needs to remember. */
interface DmPrefs {
  /** Muted conversations stop raising their own unread badge. */
  muted: boolean;
  /** ISO timestamp of the last "Mark as read", used to clear the badge. */
  lastReadAt: string;
}

interface DmPrefsState {
  prefs: Record<string, DmPrefs>;
  isMuted: (conversationId: string) => boolean;
  toggleMute: (conversationId: string) => void;
  markRead: (conversationId: string) => void;
}

const EMPTY: DmPrefs = { muted: false, lastReadAt: "" };

/**
 * Mirrors `serverPrefsStore` for direct messages: the backend tracks unread
 * counts but has no notion of "mute", so these two chat-menu actions persist
 * locally instead of forcing another column onto conversations.
 */
function sanitize(persisted: unknown): Record<string, DmPrefs> {
  const input = (persisted ?? {}) as Record<string, unknown>;
  const out: Record<string, DmPrefs> = {};
  for (const [id, value] of Object.entries(input)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    out[id] = {
      muted: entry.muted === true,
      lastReadAt: typeof entry.lastReadAt === "string" ? entry.lastReadAt : "",
    };
  }
  return out;
}

export const useDmPrefsStore = create<DmPrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},

      isMuted: (conversationId) => get().prefs[conversationId]?.muted ?? EMPTY.muted,

      toggleMute: (conversationId) =>
        set((state) => {
          const current = state.prefs[conversationId] ?? EMPTY;
          return {
            prefs: { ...state.prefs, [conversationId]: { ...current, muted: !current.muted } },
          };
        }),

      markRead: (conversationId) =>
        set((state) => {
          const current = state.prefs[conversationId] ?? EMPTY;
          return {
            prefs: {
              ...state.prefs,
              [conversationId]: { ...current, lastReadAt: new Date().toISOString() },
            },
          };
        }),
    }),
    {
      name: "dangro-dm-prefs",
      version: 1,
      partialize: (state) => ({ prefs: state.prefs }),
      merge: (persisted, current) => ({
        ...current,
        prefs: sanitize((persisted as { prefs?: unknown })?.prefs),
      }),
    }
  )
);
