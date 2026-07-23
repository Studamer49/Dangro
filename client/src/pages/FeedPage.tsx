import { useEffect, useState } from "react";
import api from "@/lib/api";
import type { Post, Story } from "@/types";

export default function FeedPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFeed();
    fetchStories();
  }, []);

  const fetchFeed = async () => {
    try {
      const { data } = await api.get("/posts/feed");
      setPosts(data.posts);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchStories = async () => {
    try {
      const { data } = await api.get("/stories");
      setStories(data.stories);
    } catch {
      // silent
    }
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto bg-gray-950">
      {stories.length > 0 && (
        <div className="w-full max-w-lg border-b border-gray-800 px-4 py-4">
          <div className="flex gap-4 overflow-x-auto">
            <button className="flex flex-col items-center gap-1">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-gray-700 bg-gray-800 text-xl">
                +
              </div>
              <span className="text-[10px] text-gray-400">Your story</span>
            </button>
            {stories.map((story) => (
              <button key={story.id} className="flex flex-col items-center gap-1">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-500 bg-gray-800 text-sm font-bold">
                  {story.author?.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-[10px] text-gray-400">{story.author?.username}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="w-full max-w-lg space-y-4 p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mb-4 text-6xl">📸</div>
            <p className="text-lg text-gray-400">No posts yet</p>
            <p className="text-sm text-gray-500">Follow people or create a post to see content here</p>
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="rounded-xl border border-gray-800 bg-gray-900">
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-sm font-bold">
                  {post.author?.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-medium text-white">{post.author?.username}</span>
              </div>
              {post.media?.[0] && (
                <div className="aspect-square bg-gray-800">
                  {post.media[0].type === "image" ? (
                    <img src={post.media[0].url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video src={post.media[0].url} controls className="h-full w-full object-cover" />
                  )}
                </div>
              )}
              <div className="p-4">
                <div className="mb-2 flex gap-4">
                  <button className="text-gray-400 hover:text-red-400">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                  <button className="text-gray-400 hover:text-white">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-white">{post._count?.likes || 0} likes</p>
                {post.caption && (
                  <p className="mt-1 text-sm text-gray-300">
                    <span className="font-medium text-white">{post.author?.username}</span>{" "}
                    {post.caption}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {new Date(post.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
