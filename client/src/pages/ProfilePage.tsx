import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import api from "@/lib/api";
import type { User, Post } from "@/types";

export default function ProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const isOwnProfile = currentUser?.id === userId;

  useEffect(() => {
    if (userId) {
      fetchProfile();
      fetchPosts();
      fetchFollowStatus();
    }
  }, [userId]);

  const fetchProfile = async () => {
    try {
      const { data } = await api.get(`/users/${userId}`);
      setProfileUser(data.user);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const fetchPosts = async () => {
    try {
      const { data } = await api.get(`/posts/feed`);
      const userPosts = data.posts.filter((p: Post) => p.authorId === userId);
      setPosts(userPosts);
      setPostCount(userPosts.length);
    } catch {
      // silent
    }
  };

  const fetchFollowStatus = async () => {
    try {
      const { data } = await api.get(`/follows/${userId}`);
      setIsFollowing(data.isFollowing);
      setFollowerCount(data.followerCount);
      setFollowingCount(data.followingCount);
    } catch {
      // silent
    }
  };

  const toggleFollow = async () => {
    try {
      const { data } = await api.post(`/follows/${userId}`);
      setIsFollowing(data.isFollowing);
      setFollowerCount((prev) => (data.isFollowing ? prev + 1 : prev - 1));
    } catch {
      // silent
    }
  };

  const handleStartDM = async () => {
    try {
      await api.post("/dms/start", { userId });
      navigate("/dms");
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-950">
        <p className="text-gray-400">User not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-gray-950">
      <div className="mx-auto w-full max-w-lg p-6">
        <div className="mb-8 flex items-center gap-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-600 text-3xl font-bold">
            {profileUser.avatar ? (
              <img src={profileUser.avatar} alt="" className="h-full w-full rounded-full object-cover" />
            ) : (
              profileUser.username[0].toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{profileUser.username}</h1>
            {profileUser.bio && (
              <p className="mt-1 text-sm text-gray-400">{profileUser.bio}</p>
            )}
            <div className="mt-2 flex gap-4 text-sm text-gray-400">
              <span><strong className="text-white">{postCount}</strong> posts</span>
              <span><strong className="text-white">{followerCount}</strong> followers</span>
              <span><strong className="text-white">{followingCount}</strong> following</span>
            </div>
          </div>
        </div>

        {!isOwnProfile && (
          <div className="mb-6 flex gap-2">
            <button
              onClick={toggleFollow}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                isFollowing
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-accent-600 text-white hover:bg-accent-500"
              }`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
            <button
              onClick={handleStartDM}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Message
            </button>
          </div>
        )}

        {isOwnProfile && (
          <div className="mb-6">
            <button
              onClick={() => navigate("/settings")}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Edit Profile
            </button>
          </div>
        )}

        <div className="border-t border-gray-800 pt-4">
          {posts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-gray-500">No posts yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="group relative aspect-square cursor-pointer overflow-hidden bg-gray-800"
                >
                  {post.media?.[0] ? (
                    <img src={post.media[0].url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gray-800 p-2">
                      <p className="text-center text-xs text-gray-400">{post.caption}</p>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-4 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex items-center gap-1 text-sm font-bold text-white">
                      ♥ {post._count?.likes || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
