import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import type { Post, PostLike, StoryGroup } from "@/types";
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

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-gray-950">
      <div className="w-full max-w-lg border-b border-gray-800 px-4 py-4">
        <StoriesBar groups={stories} viewer={user} onAdded={() => void fetchStories()} />
      </div>

      <div className="w-full max-w-lg space-y-4 p-4">
        <CreatePostComposer onCreated={handleCreated} />

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 text-center">
            <p className="text-sm text-red-400">Could not load the feed: {error}</p>
            <button
              type="button"
              onClick={() => void fetchFeed()}
              className="mt-3 rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-700"
            >
              Retry
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 text-6xl">📸</div>
            <p className="text-lg text-gray-400">No posts yet</p>
            <p className="text-sm text-gray-500">Follow people or create a post to see content here</p>
          </div>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              viewer={user}
              onLike={(target) => void handleLike(target)}
              onDelete={(postId) => void handleDelete(postId)}
              onCommentCountChange={handleCommentCountChange}
            />
          ))
        )}
      </div>
    </div>
  );
}
