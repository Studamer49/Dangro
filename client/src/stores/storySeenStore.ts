import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StoryGroup } from "@/types";

interface StorySeenState {
  /**
   * authorId -> ISO timestamp of the newest story the viewer has opened.
   *
   * Storing the newest *seen* time (rather than a set of ids) is what makes a
   * new upload flip the ring back: any story newer than this timestamp is
   * unseen by definition.
   */
  seen: Record<string, string>;
  /** True when the viewer has already opened a group with this newest story. */
  isGroupSeen: (authorId: string, latestCreatedAt: string) => boolean;
  /** Records that the viewer opened a group, keeping the newest timestamp. */
  markGroupSeen: (group: StoryGroup) => void;
}

/** Only keep well-formed entries from storage. */
function sanitize(persisted: unknown): Record<string, string> {
  const input = (persisted ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(input)) {
    if (typeof value === "string" && value) out[id] = value;
  }
  return out;
}

export const useStorySeenStore = create<StorySeenState>()(
  persist(
    (set, get) => ({
      seen: {},

      isGroupSeen: (authorId, latestCreatedAt) => {
        const stored = Date.parse(get().seen[authorId] ?? "");
        const latest = Date.parse(latestCreatedAt);
        return Number.isFinite(stored) && Number.isFinite(latest) && stored >= latest;
      },

      markGroupSeen: (group) =>
        set((state) => {
          const newest = group.stories.reduce(
            (max, story) => (Date.parse(story.createdAt) > Date.parse(max) ? story.createdAt : max),
            ""
          );
          if (!newest) return state;
          const current = state.seen[group.author.id];
          if (current && Date.parse(current) >= Date.parse(newest)) return state;
          return { seen: { ...state.seen, [group.author.id]: newest } };
        }),
    }),
    {
      name: "dangro-story-seen",
      version: 1,
      partialize: (state) => ({ seen: state.seen }),
      merge: (persisted, current) => ({
        ...current,
        seen: sanitize((persisted as { seen?: unknown })?.seen),
      }),
    }
  )
);
