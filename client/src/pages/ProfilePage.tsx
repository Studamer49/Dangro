import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import api, { apiErrorMessage } from "@/lib/api";
import type { User, Post } from "@/types";
import ProfileAvatar from "@/components/profile/ProfileAvatar";
import EditProfileModal from "@/components/profile/EditProfileModal";

export default function ProfilePage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const currentUser = useAuthStore((s) => s.user);

  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);

  const isOwnProfile = !!currentUser && currentUser.id === userId;

  // useToast() builds a fresh wrapper object on every render, so listing it in
  // the fetchers' dependency arrays would make the effect refetch endlessly.
  // Mirror it into a ref instead; every wrapper closes over the same stable push().
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get(`/users/${userId}`);
      setProfileUser(data.user as User);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
      setProfileUser(null);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const fetchPosts = useCallback(async () => {
    try {
      const { data } = await api.get(`/posts/user/${userId}`);
      setPosts(data.posts as Post[]);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
    }
  }, [userId]);

  const fetchFollowStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/follows/${userId}`);
      setIsFollowing(data.isFollowing);
      setFollowerCount(data.followerCount);
      setFollowingCount(data.followingCount);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchProfile();
    fetchPosts();
    fetchFollowStatus();
  }, [userId, fetchProfile, fetchPosts, fetchFollowStatus]);

  const toggleFollow = async () => {
    try {
      const { data } = await api.post(`/follows/${userId}`);
      setIsFollowing(data.isFollowing);
      setFollowerCount(data.followerCount);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const handleStartDM = async () => {
    try {
      await api.post("/dms/start", { userId });
      navigate("/dms");
    } catch (err) {
      toast.error(apiErrorMessage(err));
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
          <ProfileAvatar username={profileUser.username} avatar={profileUser.avatar} />
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">{profileUser.username}</h1>
            {profileUser.bio && (
              <p className="mt-1 text-sm text-gray-400">{profileUser.bio}</p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Joined{" "}
              {new Date(profileUser.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
            <div className="mt-2 flex gap-4 text-sm text-gray-400">
              <span><strong className="text-white">{posts.length}</strong> posts</span>
              <span><strong className="text-white">{followerCount}</strong> followers</span>
              <span><strong className="text-white">{followingCount}</strong> following</span>
            </div>
          </div>
        </div>

        <div className="mb-6 flex gap-2">
          {isOwnProfile ? (
            <button
              onClick={() => setShowEditModal(true)}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
            >
              Edit profile
            </button>
          ) : (
            <>
              <button
                onClick={toggleFollow}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  isFollowing
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    : "bg-accent-600 text-white hover:bg-accent-500"
                }`}
              >
                {isFollowing ? "Unfollow" : "Follow"}
              </button>
              <button
                onClick={handleStartDM}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-gray-300 hover:bg-gray-700"
              >
                Message
              </button>
            </>
          )}
        </div>

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

      {showEditModal && currentUser && (
        <EditProfileModal
          user={currentUser}
          onClose={() => setShowEditModal(false)}
          onSaved={() => {
            fetchProfile();
          }}
        />
      )}
    </div>
  );
}
