import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useAuthStore } from "@/stores/authStore";
import PostDetailModal from "@/components/feed/PostDetailModal";
import Media from "@/components/Media";
import type { Post, PostLike, Server, User } from "@/types";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

function Spinner() {
  return (
    <div className="flex justify-center py-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-400 border-t-transparent shadow-glow" />
    </div>
  );
}

function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="py-6 text-center">
      <p className="text-sm text-red-400">{message}</p>
      <button type="button" onClick={onRetry} className="btn-ghost mt-3">
        Retry
      </button>
    </div>
  );
}

export default function ExplorePage() {
  const toast = useToast();
  const currentUser = useAuthStore((s) => s.user);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [servers, setServers] = useState<Server[]>([]);
  const [serversLoading, setServersLoading] = useState(true);
  const [serversError, setServersError] = useState<string | null>(null);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinedIds, setJoinedIds] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    setPostsError(null);
    try {
      const { data } = await api.get("/posts/feed");
      setPosts(data.posts ?? []);
    } catch (err) {
      setPostsError(apiErrorMessage(err));
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const loadServers = useCallback(async () => {
    setServersLoading(true);
    setServersError(null);
    try {
      const { data } = await api.get("/servers/explore");
      setServers(data.servers ?? []);
    } catch (err) {
      setServersError(apiErrorMessage(err));
    } finally {
      setServersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPosts();
    void loadServers();
  }, [loadPosts, loadServers]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery.length < MIN_QUERY_LENGTH) {
      setUsers([]);
      setUsersError(null);
      setUsersLoading(false);
      return;
    }

    let cancelled = false;
    setUsersLoading(true);
    setUsersError(null);

    (async () => {
      try {
        const { data } = await api.get(
          `/users/search?q=${encodeURIComponent(debouncedQuery)}`
        );
        if (!cancelled) setUsers(data.users ?? []);
      } catch (err) {
        if (!cancelled) {
          setUsers([]);
          setUsersError(apiErrorMessage(err));
        }
      } finally {
        if (!cancelled) setUsersLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, searchNonce]);

  const retrySearch = () => {
    setSearchNonce((nonce) => nonce + 1);
  };

  const joinServer = async (server: Server) => {
    if (joiningId) return;
    setJoiningId(server.id);
    try {
      const { data } = await api.post(
        `/servers/join/${encodeURIComponent(server.inviteCode)}`
      );
      setJoinedIds((prev) => (prev.includes(server.id) ? prev : [...prev, server.id]));
      toast.success(`Joined ${data.server?.name ?? server.name}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setJoiningId(null);
    }
  };

  const handleLike = async (post: Post) => {
    const wasLiked = (post.likes?.length ?? 0) > 0;
    const previousCount = post._count?.likes ?? 0;
    const viewerLike: PostLike = {
      id: `optimistic-${post.id}`,
      postId: post.id,
      userId: currentUser?.id ?? "",
      createdAt: new Date().toISOString(),
    };
    const apply = (liked: boolean, count: number) =>
      setPosts((prev) =>
        prev.map((entry) =>
          entry.id === post.id
            ? {
                ...entry,
                likes: liked ? [viewerLike] : [],
                _count: { likes: count, comments: entry._count?.comments ?? 0 },
              }
            : entry
        )
      );

    apply(!wasLiked, Math.max(0, previousCount + (wasLiked ? -1 : 1)));
    try {
      const { data } = await api.post(`/posts/${post.id}/like`);
      apply(Boolean(data.liked), data.likeCount);
    } catch (err) {
      apply(wasLiked, previousCount);
      toast.error(apiErrorMessage(err));
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      await api.delete(`/posts/${postId}`);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setExpandedId((current) => (current === postId ? null : current));
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

  const handleEdit = (updated: Post) => {
    setPosts((prev) => prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)));
  };

  const trimmedQuery = query.trim();
  const expandedPost = posts.find((post) => post.id === expandedId) ?? null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="glass sticky top-0 z-10 border-b px-4 py-3">
        <div className="relative mx-auto max-w-lg">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people..."
            aria-label="Search people"
            className="field py-2.5 pl-10 pr-10"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-gray-500 transition-all duration-200 ease-out hover:bg-white/10 hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-6 p-4 md:p-6">
        <section className="glass-panel rounded-2xl animate-fade-up">
          <div className="border-b border-gray-800/60 px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight text-white">People</h2>
            <p className="mt-1 text-xs text-gray-500">Find people by username or bio</p>
          </div>
          <div className="p-5">
            {trimmedQuery.length < MIN_QUERY_LENGTH ? (
              <p className="text-sm text-gray-500">
                {trimmedQuery.length > 0
                  ? `Keep typing — at least ${MIN_QUERY_LENGTH} characters are needed to search.`
                  : "Start typing to search for people."}
              </p>
            ) : usersLoading ? (
              <Spinner />
            ) : usersError ? (
              <ErrorBlock message={usersError} onRetry={retrySearch} />
            ) : users.length === 0 ? (
              <p className="text-sm text-gray-500">No people found for “{debouncedQuery}”.</p>
            ) : (
              <ul className="space-y-2">
                {users.map((found) => (
                  <li key={found.id}>
                    <Link
                      to={`/profile/${found.id}`}
                      className="glass-card glass-card-hover flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-sm font-bold text-white">
                          {found.avatar ? (
                            <Media src={found.avatar} alt="" className="h-full w-full object-cover" />
                          ) : (
                            found.username?.[0]?.toUpperCase() ?? "?"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight text-white">
                            {found.username}
                          </p>
                          {found.bio && (
                            <p className="truncate text-xs text-gray-500">{found.bio}</p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-accent-300">
                        View profile
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="glass-panel rounded-2xl animate-fade-up">
          <div className="border-b border-gray-800/60 px-5 py-4">
            <h2 className="text-sm font-semibold tracking-tight text-white">Servers</h2>
            <p className="mt-1 text-xs text-gray-500">Communities you can join right now</p>
          </div>
          <div className="p-5">
            {serversLoading ? (
              <Spinner />
            ) : serversError ? (
              <ErrorBlock message={serversError} onRetry={() => void loadServers()} />
            ) : servers.length === 0 ? (
              <p className="text-sm text-gray-500">No servers to explore yet.</p>
            ) : (
              <ul className="space-y-2">
                {servers.map((server) => {
                  const memberCount = server._count?.members ?? 0;
                  const joined = joinedIds.includes(server.id);
                  const joining = joiningId === server.id;
                  return (
                    <li
                      key={server.id}
                      className="glass-card glass-card-hover flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-accent-500 to-accent-700 text-sm font-bold text-white shadow-glow">
                          {server.icon ? (
                            <img src={server.icon} alt="" className="h-full w-full object-cover" />
                          ) : (
                            server.name?.[0]?.toUpperCase() ?? "?"
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold tracking-tight text-white">
                            {server.name}
                          </p>
                          <p className="tabular text-xs text-gray-500">
                            {memberCount} {memberCount === 1 ? "member" : "members"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void joinServer(server)}
                        disabled={joined || joining}
                        className="btn-primary shrink-0 !px-3.5 !py-1.5 !text-xs"
                      >
                        {joining ? "Joining..." : joined ? "Joined" : "Join"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="animate-fade-up">
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-white">Posts</h2>
          {postsLoading ? (
            <Spinner />
          ) : postsError ? (
            <ErrorBlock message={postsError} onRetry={() => void loadPosts()} />
          ) : posts.length === 0 ? (
            <div className="glass-card rounded-2xl py-14 text-center">
              <div className="mb-4 text-5xl">🔍</div>
              <p className="text-lg font-semibold tracking-tight text-gray-300">Explore posts</p>
              <p className="mt-1 text-sm text-gray-500">Discover content from the community</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  onClick={() => setExpandedId(post.id)}
                  className="group relative aspect-square cursor-pointer overflow-hidden rounded-xl bg-gray-800/50 ring-1 ring-gray-700/40 transition-all duration-200 ease-out hover:shadow-elev2 hover:ring-accent-400/40"
                >
                  {post.media?.[0] ? (
                    post.media[0].type === "image" ? (
                      <img src={post.media[0].url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <video src={post.media[0].url} className="h-full w-full object-cover" />
                    )
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gray-900/40 p-3">
                      <p className="text-center text-xs text-gray-400">{post.caption}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-5 bg-gray-950/70 opacity-0 backdrop-blur-sm transition-opacity duration-200 ease-out group-hover:opacity-100">
                    <span className="tabular flex items-center gap-1.5 text-sm font-bold text-white">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                      </svg>
                      {post._count?.likes || 0}
                    </span>
                    <span className="tabular flex items-center gap-1.5 text-sm font-bold text-white">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z" />
                      </svg>
                      {post._count?.comments || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {expandedPost && (
        <PostDetailModal
          key={expandedPost.id}
          post={expandedPost}
          viewer={currentUser}
          onClose={() => setExpandedId(null)}
          onLike={(target) => void handleLike(target)}
          onDelete={(postId) => void handleDelete(postId)}
          onEdit={handleEdit}
          onCommentCountChange={handleCommentCountChange}
        />
      )}
    </div>
  );
}
