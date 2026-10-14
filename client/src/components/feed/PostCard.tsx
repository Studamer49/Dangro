import { useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useBounce } from "@/hooks/useBounce";
import type { Post, User } from "@/types";
import CommentsSection from "./CommentsSection";
import Avatar from "@/components/Avatar";

interface PostCardProps {
  post: Post;
  viewer: User | null;
  onLike: (post: Post) => void;
  onDelete: (postId: string) => void;
  onCommentCountChange: (postId: string, delta: number) => void;
  /** Lets the feed replace the post with the server's version after an edit. */
  onEdit?: (post: Post) => void;
}

export default function PostCard({
  post,
  viewer,
  onLike,
  onDelete,
  onCommentCountChange,
  onEdit,
}: PostCardProps) {
  const toast = useToast();
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.caption ?? "");
  const [saving, setSaving] = useState(false);

  // Heart pop + count nudge, played on every like/unlike tap.
  const { ref: heartRef, bounce: bounceHeart } = useBounce<HTMLSpanElement>();
  const { ref: likeCountRef, bounce: bounceLikeCount } = useBounce<HTMLSpanElement>();

  const liked = (post.likes?.length ?? 0) > 0;
  const likeCount = post._count?.likes ?? 0;
  const commentCount = post._count?.comments ?? 0;
  const isOwnPost = viewer !== null && post.authorId === viewer.id;

  const handleDelete = () => {
    if (window.confirm("Delete this post?")) onDelete(post.id);
  };

  const startEditing = () => {
    setDraft(post.caption ?? "");
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/posts/${post.id}`, {
        // An emptied caption clears it rather than storing an empty string.
        caption: draft.trim() === "" ? null : draft,
      });
      onEdit?.(data.post as Post);
      setEditing(false);
      toast.success("Post updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update the post"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex items-center gap-3 p-4">
        <Avatar user={post.author} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{post.author?.username ?? "Unknown"}</p>
          <p className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</p>
        </div>
        {isOwnPost && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit post"
              title="Edit post"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 20h4l10.5-10.5a2.12 2.12 0 00-3-3L5 17v3zm14.7-11.7a1 1 0 000-1.4l-2.6-2.6a1 1 0 00-1.4 0l-1.8 1.8 3 3 1.8-1.8z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label="Delete post"
              title="Delete post"
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        )}
      </div>

      {post.media && post.media.length > 0 && (
        <div className="flex snap-x snap-mandatory overflow-x-auto">
          {post.media.map((media) => (
            <div key={media.id} className="aspect-square w-full shrink-0 snap-center bg-gray-800">
              {media.type === "video" ? (
                <video src={media.url} controls className="h-full w-full object-cover" />
              ) : (
                <img src={media.url} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 p-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              bounceHeart("like");
              bounceLikeCount("pop");
              onLike(post);
            }}
            aria-pressed={liked}
            aria-label={liked ? "Unlike post" : "Like post"}
            className={`flex items-center gap-1.5 transition-colors ${
              liked ? "text-red-500 hover:text-red-400" : "text-gray-400 hover:text-red-400"
            }`}
          >
            <span ref={heartRef} className="inline-flex">
              <svg className="h-6 w-6" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                />
              </svg>
            </span>
            <span ref={likeCountRef} className="inline-block text-sm font-medium">
              {likeCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setShowComments((value) => !value)}
            aria-expanded={showComments}
            aria-label="Toggle comments"
            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span className="text-sm font-medium">{commentCount}</span>
          </button>
        </div>

        <p className="text-sm text-white">
          {likeCount} {likeCount === 1 ? "like" : "likes"}
        </p>
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 2200))}
              rows={3}
              maxLength={2200}
              autoFocus
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
              placeholder="Add a caption..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || draft === (post.caption ?? "")}
                className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          post.caption && (
            <p className="whitespace-pre-wrap text-sm text-gray-300">
              <span className="font-medium text-white">{post.author?.username ?? "Unknown"}</span>{" "}
              {post.caption}
            </p>
          )
        )}
        {commentCount > 0 && !showComments && (
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="block text-sm text-gray-400 transition-colors hover:text-white"
          >
            View all {commentCount} {commentCount === 1 ? "comment" : "comments"}
          </button>
        )}
      </div>

      {showComments && (
        <CommentsSection postId={post.id} viewer={viewer} onCountChange={onCommentCountChange} />
      )}
    </article>
  );
}
