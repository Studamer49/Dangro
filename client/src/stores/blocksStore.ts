import { create } from "zustand";
import api from "../lib/api";

interface BlocksState {
  blockedIds: string[];
  loaded: boolean;
  load: () => Promise<void>;
  isBlocked: (userId: string) => boolean;
  /** Toggles a block and returns whether the user is now blocked. */
  toggle: (userId: string) => Promise<boolean>;
}

/**
 * The one in-flight `/blocks` request, shared by every caller.
 *
 * The DM page mounts the conversation list and the chat area in the same tick,
 * and neither has loaded yet, so both fired the identical request. Sharing the
 * promise collapses that to a single round trip without freezing the value the
 * way a "load once" guard would.
 */
let inFlightLoad: Promise<void> | null = null;

/**
 * Who the signed-in user has blocked. Kept in one place so the DM header,
 * conversation list, and message menus share a single source of truth; the
 * server is still authoritative and enforces blocks on send/follow/call.
 */
export const useBlocksStore = create<BlocksState>()((set, get) => ({
  blockedIds: [],
  loaded: false,

  load: async () => {
    if (inFlightLoad) return inFlightLoad;
    inFlightLoad = (async () => {
      try {
        const { data } = await api.get<{ blockedIds: string[] }>("/blocks");
        set({ blockedIds: data.blockedIds ?? [], loaded: true });
      } catch {
        set({ loaded: true });
      } finally {
        inFlightLoad = null;
      }
    })();
    return inFlightLoad;
  },

  isBlocked: (userId) => get().blockedIds.includes(userId),

  toggle: async (userId) => {
    const { data } = await api.post<{ blocked: boolean }>(`/blocks/${userId}`);
    set((state) => ({
      blockedIds: data.blocked
        ? [...state.blockedIds, userId]
        : state.blockedIds.filter((id) => id !== userId),
    }));
    return data.blocked;
  },
}));
