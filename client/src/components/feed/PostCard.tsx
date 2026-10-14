import { useState } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useConfirm } from "@/hooks/useConfirm";
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
  const confirm = useConfirm();
  const [showComments, setShowComments] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(post.caption ?? "");
  const [saving, setSaving] = useState(false);

  // Heart pop + count nudge, played on every like/unlike tap.
  const { ref: heartRef, bounce: bounceHeart } = useBounce<HTMLSpanElement>();
  const { ref: likeCountRef, bounce: bounceLikeCount } = useBounce<HTMLSpanElement>();
  // Comment bubble pop + count nudge, played when the comment thread toggles.
  const { ref: commentBtnRef, bounce: bounceComment } = useBounce<HTMLButtonElement>();
  const { ref: commentCountRef, bounce: bounceCommentCount } = useBounce<HTMLSpanElement>();

  const liked = (post.likes?.length ?? 0) > 0;
  const likeCount = post._count?.likes ?? 0;
  const commentCount = post._count?.comments ?? 0;
  const isOwnPost = viewer !== null && post.authorId === viewer.id;

  const handleDelete = async () => {
    const ok = await confirm({
      title: "Delete this post?",
      message: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) onDelete(post.id);
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
    <article className="glass-card glass-card-hover overflow-hidden rounded-2xl">
      <div className="flex items-center gap-3 p-4">
        <Avatar user={post.author} className="h-9 w-9 text-sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight text-white">{post.author?.username ?? "Unknown"}</p>
          <p className="tabular text-xs text-gray-600">{new Date(post.createdAt).toLocaleDateString()}</p>
        </div>
        {isOwnPost && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEditing}
              aria-label="Edit post"
              title="Edit post"
              className="icon-btn !h-8 !w-8"
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
              className="icon-btn !h-8 !w-8 hover:!text-red-400"
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
        <div className="px-4 pb-1 pt-0.5">
          {/* The media carousel sits in a recessed glass well rather than
              flush against the card edge, so the images read as sitting on the
              card instead of replacing it. */}
          <div className="glass overflow-hidden rounded-2xl border p-2">
            <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto">
              {post.media.map((media) => (
                <div
                  key={media.id}
                  className="aspect-square w-full shrink-0 snap-center overflow-hidden rounded-xl bg-gray-950/40"
                >
                  {media.type === "video" ? (
                    <video src={media.url} controls className="h-full w-full object-cover" />
                  ) : (
                    <img src={media.url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
              ))}
            </div>
          </div>
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
            data-bounce="self"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200 ease-out ${
              liked
                ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "border-gray-700/70 bg-gray-800/30 text-gray-400 hover:border-gray-600 hover:bg-gray-800/60 hover:text-gray-200"
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
            <span ref={likeCountRef} className="tabular inline-block text-sm font-semibold">
              {likeCount}
            </span>
          </button>
          <button
            ref={commentBtnRef}
            type="button"
            onClick={() => {
              bounceComment("pop");
              bounceCommentCount("pop");
              setShowComments((value) => !value);
            }}
            aria-expanded={showComments}
            aria-label="Toggle comments"
            data-bounce="self"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-all duration-200 ease-out ${
              showComments
                ? "border-accent-400/40 bg-accent-500/15 text-accent-200"
                : "border-gray-700/70 bg-gray-800/30 text-gray-400 hover:border-gray-600 hover:bg-gray-800/60 hover:text-gray-200"
            }`}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span ref={commentCountRef} className="tabular inline-block text-sm font-semibold">
              {commentCount}
            </span>
          </button>
        </div>

        <p className="tabular text-xs text-gray-500">
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
              className="field resize-none text-sm"
              placeholder="Add a caption..."
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || draft === (post.caption ?? "")}
                className="btn-primary px-3 py-1.5 text-xs"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          post.caption && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
              <span className="font-semibold tracking-tight text-white">{post.author?.username ?? "Unknown"}</span>{" "}
              {post.caption}
            </p>
          )
        )}
        {commentCount > 0 && !showComments && (
          <button
            type="button"
            onClick={() => setShowComments(true)}
            className="tabular block text-sm font-medium text-gray-400 transition-colors duration-200 ease-out hover:text-white"
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
