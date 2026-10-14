import { useMemo, useState } from "react";
import StoryComposer from "@/components/feed/StoryComposer";
import StoryViewer from "@/components/feed/StoryViewer";
import Avatar from "@/components/Avatar";
import { useStorySeenStore } from "@/stores/storySeenStore";
import type { Story, StoryGroup, User } from "@/types";

/** The newest story's timestamp in a group, used to decide if it is unseen. */
function latestCreatedAt(group: StoryGroup): string {
  return group.stories.reduce(
    (max, story) => (Date.parse(story.createdAt) > Date.parse(max) ? story.createdAt : max),
    ""
  );
}

interface StoriesBarProps {
  groups: StoryGroup[];
  viewer: User | null;
  onAdded: (story: Story | undefined) => void;
}

/**
 * The gradient ring Instagram and Discord both use for "you have stories".
 *
 * The hues are read from the themeable accent ramp rather than fixed brand
 * colours so the ring tracks whichever accent the viewer picked, and so it
 * stays legible in the light and amoled themes.
 */
const RING_UNSEEN =
  "bg-[conic-gradient(from_210deg,rgb(var(--accent-300-rgb)/0.95),rgb(var(--accent-400-rgb))_30%,rgb(var(--accent-600-rgb))_60%,rgb(var(--accent-400-rgb))_85%)]";
const RING_SEEN = "bg-gray-700/70";

/**
 * The stories strip.
 *
 * Compositing and viewing were split out into StoryComposer and StoryViewer;
 * this file only owns the strip itself and which of the two is open.
 */
export default function StoriesBar({ groups, viewer, onAdded }: StoriesBarProps) {
  const [viewing, setViewing] = useState<{ authorId: string; startIndex: number } | null>(null);
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<Story | null>(null);

  // A group without a resolvable author cannot be rendered or acted on, so it
  // is dropped here rather than crashing the whole bar.
  const renderable = useMemo(
    () => groups.filter((group) => Boolean(group?.author?.id)),
    [groups]
  );

  const myGroup = viewer ? (renderable.find((group) => group.author.id === viewer.id) ?? null) : null;
  const otherGroups = viewer
    ? renderable.filter((group) => group.author.id !== viewer.id)
    : renderable;

  const viewingGroup = viewing
    ? (renderable.find((group) => group.author.id === viewing.authorId) ?? null)
    : null;

  const seenByAuthor = useStorySeenStore((s) => s.seen);
  const markGroupSeen = useStorySeenStore((s) => s.markGroupSeen);

  const openComposer = (story: Story | null) => {
    setEditing(story);
    setComposing(true);
  };

  return (
    <>
      <div className="relative">
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* You */}
          <button
            type="button"
            onClick={() => (myGroup ? setViewing({ authorId: myGroup.author.id, startIndex: 0 }) : openComposer(null))}
            aria-label={myGroup ? "View your story" : "Add a story"}
            className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5"
          >
            <span className="relative">
              <span
                className={`block rounded-full p-[2.5px] transition-transform duration-200 ease-out group-hover:scale-105 ${
                  myGroup ? `${RING_UNSEEN} shadow-glow` : RING_SEEN
                }`}
              >
                <span className="block rounded-full bg-gray-950 p-[2px]">
                  <Avatar user={myGroup?.author ?? viewer} className="h-14 w-14" linkToProfile={false} />
                </span>
              </span>
              <span
                className="glass absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-white/20 text-xs font-bold leading-none text-white shadow-elev1 transition-transform duration-200 ease-out group-hover:scale-110"
                aria-hidden
              >
                +
              </span>
            </span>
            <span className="w-full truncate text-center text-[11px] font-medium text-gray-400 transition-colors duration-200 ease-out group-hover:text-white">
              Your story
            </span>
          </button>

          {/* Everyone else */}
          {otherGroups.map((group) => {
            const seenStamp = Date.parse(seenByAuthor[group.author.id] ?? "");
            const latest = Date.parse(latestCreatedAt(group));
            const seen = Number.isFinite(seenStamp) && Number.isFinite(latest) && seenStamp >= latest;
            return (
              <button
                key={group.author.id}
                type="button"
                onClick={() => {
                  markGroupSeen(group);
                  setViewing({ authorId: group.author.id, startIndex: 0 });
                }}
                className="group flex w-[68px] shrink-0 flex-col items-center gap-1.5"
              >
                <span
                  className={`block rounded-full p-[2.5px] transition-transform duration-200 ease-out group-hover:scale-105 ${
                    seen ? RING_SEEN : RING_UNSEEN
                  }`}
                >
                  <span className="block rounded-full bg-gray-950 p-[2px]">
                    <Avatar user={group.author} className="h-14 w-14" linkToProfile={false} />
                  </span>
                </span>
                <span className="w-full truncate text-center text-[11px] font-medium text-gray-400 transition-colors duration-200 ease-out group-hover:text-white">
                  {group.author.username}
                </span>
              </button>
            );
          })}

          {otherGroups.length === 0 && (
            <p className="flex items-center pl-2 text-xs text-gray-500">
              Follow people to see their stories.
            </p>
          )}
        </div>
      </div>

      {composing && (
        <StoryComposer
          editing={editing}
          onClose={() => {
            setComposing(false);
            setEditing(null);
          }}
          onCreated={(story) => {
            setComposing(false);
            setEditing(null);
            onAdded(story);
          }}
        />
      )}

      {viewingGroup && viewing && (
        <StoryViewer
          group={viewingGroup}
          startIndex={viewing.startIndex}
          viewerId={viewer?.id ?? null}
          onClose={() => setViewing(null)}
          onChanged={onAdded}
          onEdit={(story) => {
            setViewing(null);
            openComposer(story);
          }}
        />
      )}
    </>
  );
}
