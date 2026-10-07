import { useState } from "react";
import type { Post, User } from "@/types";
import CommentsSection from "./CommentsSection";

interface PostCardProps {
  post: Post;
  viewer: User | null;
  onLike: (post: Post) => void;
  onDelete: (postId: string) => void;
  onCommentCountChange: (postId: string, delta: number) => void;
}

export default function PostCard({ post, viewer, onLike, onDelete, onCommentCountChange }: PostCardProps) {
  const [showComments, setShowComments] = useState(false);

  const liked = (post.likes?.length ?? 0) > 0;
  const likeCount = post._count?.likes ?? 0;
  const commentCount = post._count?.comments ?? 0;
  const isOwnPost = viewer !== null && post.authorId === viewer.id;

  const handleDelete = () => {
    if (window.confirm("Delete this post?")) onDelete(post.id);
  };

  return (
    <article className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
      <div className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-600 text-sm font-bold">
          {post.author?.username?.[0]?.toUpperCase() ?? "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{post.author?.username ?? "Unknown"}</p>
          <p className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleDateString()}</p>
        </div>
        {isOwnPost && (
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
            onClick={() => onLike(post)}
            aria-pressed={liked}
            aria-label={liked ? "Unlike post" : "Like post"}
            className={`flex items-center gap-1.5 transition-colors ${
              liked ? "text-red-500 hover:text-red-400" : "text-gray-400 hover:text-red-400"
            }`}
          >
            <svg className="h-6 w-6" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span className="text-sm font-medium">{likeCount}</span>
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
        {post.caption && (
          <p className="text-sm text-gray-300">
            <span className="font-medium text-white">{post.author?.username ?? "Unknown"}</span>{" "}
            {post.caption}
          </p>
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
