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

  /**
   * Guards against a slow response for one profile landing after the user has
   * already navigated to another. Without it, visiting A then B quickly can
   * leave A's name, posts and follower counts on screen under B's route.
   */
  const seqRef = useRef(0);

  const fetchProfile = useCallback(async (seq: number) => {
    try {
      const { data } = await api.get(`/users/${userId}`);
      if (seq !== seqRef.current) return;
      setProfileUser(data.user as User);
    } catch (err) {
      if (seq !== seqRef.current) return;
      toastRef.current.error(apiErrorMessage(err));
      setProfileUser(null);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [userId]);

  const fetchPosts = useCallback(async (seq: number) => {
    try {
      const { data } = await api.get(`/posts/user/${userId}`);
      if (seq !== seqRef.current) return;
      setPosts(data.posts as Post[]);
    } catch (err) {
      if (seq !== seqRef.current) return;
      toastRef.current.error(apiErrorMessage(err));
    }
  }, [userId]);

  const fetchFollowStatus = useCallback(async (seq: number) => {
    try {
      const { data } = await api.get(`/follows/${userId}`);
      if (seq !== seqRef.current) return;
      setIsFollowing(data.isFollowing);
      setFollowerCount(data.followerCount);
      setFollowingCount(data.followingCount);
    } catch (err) {
      if (seq !== seqRef.current) return;
      toastRef.current.error(apiErrorMessage(err));
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const seq = (seqRef.current += 1);
    setLoading(true);
    fetchProfile(seq);
    fetchPosts(seq);
    fetchFollowStatus(seq);
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
      // Navigating to the bare /dms left the thread unselected, so the user
      // landed on "Select a conversation" having just created one. Deep-linking
      // the new id opens it directly.
      const { data } = await api.post("/dms/start", { userId });
      navigate(`/dms/${data.conversation.id}`);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-accent-500/25 border-t-accent-400" />
      </div>
    );
  }

  if (!profileUser) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="glass-panel animate-fade-in flex flex-col items-center gap-3 rounded-2xl px-8 py-10 text-center">
          <div className="glass-card flex h-14 w-14 items-center justify-center rounded-2xl text-gray-500">
            <svg
              className="h-7 w-7"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-300">User not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 pb-12 pt-6">
        {/*
          Identity block. A wide frosted panel whose top third is the "cover":
          an accent gradient that re-tints itself to whatever accent the user
          picked, with the avatar dropped into it on a negative margin so the
          two read as one object instead of a card with a picture stuck on it.
          The cover is a gradient rather than an image precisely because it has
          no hard edge for the avatar to hide behind.
        */}
        <div className="glass-panel animate-fade-up overflow-hidden rounded-3xl">
          <div className="relative h-28 sm:h-36">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-600/45 via-accent-500/20 to-accent-400/5" />
            <div className="absolute inset-0 bg-gradient-to-t from-accent-950/35 to-transparent" />
          </div>

          <div className="px-5 pb-5">
            <div className="-mt-12 flex items-end justify-between gap-4">
              <ProfileAvatar
                username={profileUser.username}
                avatar={profileUser.avatar}
                className="h-24 w-24 text-3xl ring-lit"
              />

              <div className="flex shrink-0 flex-wrap justify-end gap-2 pb-1">
                {isOwnProfile ? (
                  <button onClick={() => setShowEditModal(true)} className="btn-ghost">
                    Edit profile
                  </button>
                ) : (
                  <>
                    <button
                      onClick={toggleFollow}
                      className={isFollowing ? "btn-ghost" : "btn-primary"}
                    >
                      {isFollowing ? "Unfollow" : "Follow"}
                    </button>
                    <button onClick={handleStartDM} className="btn-ghost">
                      Message
                    </button>
                  </>
                )}
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-white">
              {profileUser.username}
            </h1>
            {profileUser.bio && (
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-400">
                {profileUser.bio}
              </p>
            )}
            <p className="mt-2 text-xs text-gray-500">
              Joined{" "}
              {new Date(profileUser.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>

            <div className="mt-4 flex flex-wrap gap-5 text-sm text-gray-400">
              <span>
                <strong className="tabular text-white">{posts.length}</strong> posts
              </span>
              <span>
                <strong className="tabular text-white">{followerCount}</strong> followers
              </span>
              <span>
                <strong className="tabular text-white">{followingCount}</strong> following
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {posts.length === 0 ? (
            <div className="glass-card animate-fade-up flex flex-col items-center gap-3 rounded-2xl px-6 py-14 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gray-700/60 bg-gray-800/40 text-gray-500">
                <svg
                  className="h-7 w-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm4 4.5h8M8 13h5"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-300">No posts yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="glass-card group relative aspect-square cursor-pointer overflow-hidden rounded-xl"
                >
                  {post.media?.[0] ? (
                    <img
                      src={post.media[0].url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gray-800/50 p-3">
                      <p className="line-clamp-3 text-center text-xs leading-relaxed text-gray-400">
                        {post.caption}
                      </p>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-4 bg-gray-950/70 opacity-0 backdrop-blur-[2px] transition-opacity duration-200 group-hover:opacity-100">
                    <span className="tabular flex items-center gap-1.5 text-sm font-bold text-white">
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 21s-7.5-4.6-9.6-8.6C.8 9.6 2.4 6 5.7 6c2 0 3.3 1.1 4.1 2.3h4.4C14.9 7.1 16.3 6 18.3 6c3.3 0 4.9 3.6 3.3 6.4C19.5 16.4 12 21 12 21z" />
                      </svg>
                      {post._count?.likes || 0}
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
            void fetchProfile(seqRef.current);
          }}
        />
      )}
    </div>
  );
}
