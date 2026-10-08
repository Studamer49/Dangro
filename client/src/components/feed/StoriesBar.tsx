import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import Avatar from "@/components/Avatar";
import type { Story, StoryGroup, User } from "@/types";

interface StoriesBarProps {
  groups: StoryGroup[];
  viewer: User | null;
  onAdded: (story: Story | undefined) => void;
}

export default function StoriesBar({ groups, viewer, onAdded }: StoriesBarProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [storyIndex, setStoryIndex] = useState(0);

  const myGroup = viewer ? (groups.find((group) => group.author.id === viewer.id) ?? null) : null;
  const otherGroups = viewer ? groups.filter((group) => group.author.id !== viewer.id) : groups;
  const viewingGroup = viewingId
    ? (groups.find((group) => group.author.id === viewingId) ?? null)
    : null;
  const viewingStory = viewingGroup
    ? (viewingGroup.stories[storyIndex] ?? null)
    : null;

  useEffect(() => {
    if (!viewingStory) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewingId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [viewingStory]);

  const openStory = (authorId: string) => {
    setStoryIndex(0);
    setViewingId(authorId);
  };

  const advance = () => {
    if (!viewingGroup) return;
    if (storyIndex + 1 < viewingGroup.stories.length) setStoryIndex((index) => index + 1);
    else setViewingId(null);
  };

  const handleFileInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
      toast.error("Only images and videos can be added to your story");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/uploads", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data.type !== "image" && data.type !== "video") {
        throw new Error("Only images and videos can be added to your story");
      }
      const mediaType = data.type === "video" ? "video" : "image";
      const { data: storyData } = await api.post("/stories", { mediaUrl: data.url, mediaType });
      const story = storyData.story as Story | undefined;
      toast.success("Story added");
      onAdded(story);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="flex gap-4 overflow-x-auto">
        <div className="flex w-16 shrink-0 flex-col items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={() => (myGroup ? openStory(myGroup.author.id) : fileInputRef.current?.click())}
              disabled={uploading}
              aria-label={myGroup ? "View your story" : "Add to your story"}
              className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 bg-gray-800 transition-colors disabled:cursor-wait disabled:opacity-60 ${
                myGroup
                  ? "border-accent-500 hover:border-accent-400"
                  : "border-dashed border-gray-600 hover:border-gray-400"
              }`}
            >
              {myGroup?.author.avatar ? (
                <img src={myGroup.author.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-gray-300">
                  {myGroup ? (myGroup.author.username?.[0]?.toUpperCase() ?? "?") : "+"}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Add to your story"
              title="Add to your story"
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent-600 text-sm font-bold leading-none text-white ring-2 ring-gray-950 transition-colors hover:bg-accent-500 disabled:cursor-wait disabled:opacity-60"
            >
              +
            </button>
          </div>
          <span className="text-[10px] text-gray-400">Your story</span>
        </div>

        {otherGroups.map((group) => (
          <button
            key={group.author.id}
            type="button"
            onClick={() => openStory(group.author.id)}
            className="flex w-16 shrink-0 flex-col items-center gap-1"
          >
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-red-500 bg-gray-800 text-sm font-bold">
              {group.author.avatar ? (
                <img src={group.author.avatar} alt="" className="h-full w-full object-cover" />
              ) : (
                group.author.username?.[0]?.toUpperCase() ?? "?"
              )}
            </span>
            <span className="w-full truncate text-center text-[10px] text-gray-400">
              {group.author.username}
            </span>
          </button>
        ))}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(event) => void handleFileInput(event)}
      />

      {viewingGroup && viewingStory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`${viewingGroup.author.username}'s story`}
          onClick={() => setViewingId(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-xl border border-gray-800 bg-gray-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-gray-800 p-3">
              <Avatar user={viewingGroup.author} className="h-8 w-8 text-sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">
                  {viewingGroup.author.username}
                </p>
                <p className="text-xs text-gray-500">
                  {storyIndex + 1} of {viewingGroup.stories.length}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingId(null)}
                aria-label="Close story"
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex aspect-[4/5] max-h-[70vh] items-center justify-center bg-black">
              {viewingStory.mediaType === "video" ? (
                <video
                  src={viewingStory.mediaUrl}
                  controls
                  autoPlay
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <img
                  src={viewingStory.mediaUrl}
                  alt=""
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-gray-800 p-3">
              <div className="flex gap-1.5">
                {viewingGroup.stories.map((story, index) => (
                  <span
                    key={story.id}
                    className={`h-1.5 w-6 rounded-full ${index === storyIndex ? "bg-accent-500" : "bg-gray-700"}`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={advance}
                className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-gray-700"
              >
                {storyIndex + 1 < viewingGroup.stories.length ? "Next" : "Close"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
