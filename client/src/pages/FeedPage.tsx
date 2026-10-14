import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import type { Post, PostLike, Story, StoryGroup } from "@/types";
import CreatePostComposer from "@/components/feed/CreatePostComposer";
import PostCard from "@/components/feed/PostCard";
import StoriesBar from "@/components/feed/StoriesBar";

export default function FeedPage() {
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingLikes = useRef<Set<string>>(new Set());

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get("/posts/feed");
      setPosts(data.posts ?? []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStories = useCallback(async () => {
    try {
      const { data } = await api.get("/stories");
      setStories(data.stories ?? []);
    } catch {
      // Stories are non-critical: the bar still renders the "add story" affordance.
    }
  }, []);

  useEffect(() => {
    void fetchFeed();
    void fetchStories();
  }, [fetchFeed, fetchStories]);

  const handleLike = async (post: Post) => {
    if (pendingLikes.current.has(post.id)) return;
    pendingLikes.current.add(post.id);

    const wasLiked = (post.likes?.length ?? 0) > 0;
    const previousCount = post._count?.likes ?? 0;
    const viewerLike: PostLike = {
      id: `optimistic-${post.id}`,
      postId: post.id,
      userId: user?.id ?? "",
      createdAt: new Date().toISOString(),
    };
    const optimistic: Post = {
      ...post,
      likes: wasLiked ? [] : [viewerLike],
      _count: {
        likes: Math.max(0, previousCount + (wasLiked ? -1 : 1)),
        comments: post._count?.comments ?? 0,
      },
    };
    const revert = (current: Post): Post => ({
      ...current,
      likes: wasLiked ? [viewerLike] : [],
      _count: { likes: previousCount, comments: current._count?.comments ?? 0 },
    });

    setPosts((prev) => prev.map((p) => (p.id === post.id ? optimistic : p)));

    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? {
                ...p,
                likes: data.liked ? [viewerLike] : [],
                _count: { likes: data.likeCount, comments: p._count?.comments ?? 0 },
              }
            : p
        )
      );
    } catch (err) {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? revert(p) : p)));
      toast.error(apiErrorMessage(err));
    } finally {
      pendingLikes.current.delete(post.id);
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Post deleted");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleCommentCountChange = (postId: string, delta: number) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? {
              ...p,
              _count: {
                likes: p._count?.likes ?? 0,
                comments: Math.max(0, (p._count?.comments ?? 0) + delta),
              },
            }
          : p
      )
    );
  };

  const handleCreated = (post: Post) => {
    setPosts((prev) => [post, ...prev]);
  };

  const handleStoryAdded = useCallback(
    (story: Story | undefined) => {
      const author = story?.author;
      if (story && author) {
        setStories((prev) => {
          const existing = prev.find((group) => group.author?.id === author.id);
          if (existing) {
            return prev.map((group) =>
              group.author?.id === author.id
                ? { ...group, stories: [story, ...group.stories] }
                : group
            );
          }
          return [{ author, stories: [story] }, ...prev];
        });
      }
      void fetchStories();
    },
    [fetchStories]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Pinned header: sits above the scroll area so the stories strip never
          slides away while the feed scrolls underneath it. */}
      <div className="glass-panel z-10 w-full shrink-0 border-x-0 border-t-0 px-4 py-4">
        <div className="mx-auto w-full max-w-lg">
          <StoriesBar groups={stories} viewer={user} onAdded={handleStoryAdded} />
        </div>
      </div>

      {/* The scroll area spans the whole width so the wheel works anywhere on
          the page, not only over the centered column. */}
      <div className="w-full flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg space-y-4 p-4 pb-10">
        <CreatePostComposer onCreated={handleCreated} />

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="glass-card rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <div className="skeleton h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3 w-28 rounded-full" />
                    <div className="skeleton h-2.5 w-16 rounded-full" />
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <div className="skeleton h-2.5 w-full rounded-full" />
                  <div className="skeleton h-2.5 w-4/5 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="glass-card rounded-2xl p-8 text-center animate-fade-up">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/15 text-red-400">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"
                />
              </svg>
            </div>
            <p className="font-semibold tracking-tight text-white">Could not load the feed</p>
            <p className="mt-1.5 text-sm text-red-400">{error}</p>
            <button type="button" onClick={() => void fetchFeed()} className="btn-ghost mt-5">
              Retry
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="glass-card rounded-2xl px-6 py-12 text-center animate-fade-up">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-400">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.7}
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
            </div>
            <p className="font-semibold tracking-tight text-white">No posts yet</p>
            <p className="mt-1.5 text-sm text-gray-500">Be the first to share something</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              viewer={user}
              onLike={(target) => void handleLike(target)}
              onDelete={(postId) => void handleDelete(postId)}
              onEdit={(updated) =>
                setPosts((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)))
              }
              onCommentCountChange={handleCommentCountChange}
            />
          ))
        )}
        </div>
      </div>
    </div>
  );
}
