import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Post } from "@/types";

export default function ExplorePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExplore();
  }, []);

  const fetchExplore = async () => {
    try {
      const { data } = await api.get("/posts/feed");
      setPosts(data.posts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const searchPosts = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      fetchExplore();
      return;
    }
    try {
      const { data } = await api.get(`/posts/feed`);
      setPosts(data.posts);
    } catch {
      // silent
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-950">
      <div className="sticky top-0 z-10 border-b border-gray-800 bg-gray-950 px-4 py-3">
        <div className="relative mx-auto max-w-lg">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => searchPosts(e.target.value)}
            placeholder="Search..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-2.5 pl-10 pr-4 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 p-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 text-6xl">🔍</div>
            <p className="text-lg text-gray-400">Explore posts</p>
            <p className="text-sm text-gray-500">Discover content from the community</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {posts.map((post) => (
              <div
                key={post.id}
                className="group relative aspect-square cursor-pointer overflow-hidden bg-gray-800"
              >
                {post.media?.[0] ? (
                  post.media[0].type === "image" ? (
                    <img src={post.media[0].url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={post.media[0].url} className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="flex h-full items-center justify-center bg-gray-800 p-2">
                    <p className="text-center text-xs text-gray-400">{post.caption}</p>
                  </div>
                )}
                <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex items-center gap-1 text-sm font-bold text-white">
                    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                    </svg>
                    {post._count?.likes || 0}
                  </span>
                  <span className="flex items-center gap-1 text-sm font-bold text-white">
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
      </div>
    </div>
  );
}
