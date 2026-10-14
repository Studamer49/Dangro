import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Per-server, per-viewer state that only the client needs to remember. */
interface ServerPrefs {
  /** Muted servers stop raising their own unread/notification badges. */
  muted: boolean;
  /** ISO timestamp of the last "Mark as read". */
  lastReadAt: string;
}

interface ServerPrefsState {
  prefs: Record<string, ServerPrefs>;
  isMuted: (serverId: string) => boolean;
  toggleMute: (serverId: string) => void;
  markRead: (serverId: string) => void;
}

const EMPTY: ServerPrefs = { muted: false, lastReadAt: "" };

/**
 * "Mark as read" and "Mute server" live here rather than on the server: the
 * backend has no per-server read state (only DMs and notifications track
 * unread), so persisting these in the browser keeps the context-menu actions
 * working without a schema change.
 */
function sanitize(persisted: unknown): Record<string, ServerPrefs> {
  const input = (persisted ?? {}) as Record<string, unknown>;
  const out: Record<string, ServerPrefs> = {};
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

export const useServerPrefsStore = create<ServerPrefsState>()(
  persist(
    (set, get) => ({
      prefs: {},

      isMuted: (serverId) => get().prefs[serverId]?.muted ?? EMPTY.muted,

      toggleMute: (serverId) =>
        set((state) => {
          const current = state.prefs[serverId] ?? EMPTY;
          return {
            prefs: { ...state.prefs, [serverId]: { ...current, muted: !current.muted } },
          };
        }),

      markRead: (serverId) =>
        set((state) => {
          const current = state.prefs[serverId] ?? EMPTY;
          return {
            prefs: { ...state.prefs, [serverId]: { ...current, lastReadAt: new Date().toISOString() } },
          };
        }),
    }),
    {
      name: "dangro-server-prefs",
      version: 1,
      migrate: (persisted) => ({ prefs: sanitize((persisted as { prefs?: unknown })?.prefs) }),
      partialize: (state) => ({ prefs: state.prefs }),
      merge: (persisted, current) => ({
        ...current,
        prefs: sanitize((persisted as { prefs?: unknown })?.prefs),
      }),
    }
  )
);
