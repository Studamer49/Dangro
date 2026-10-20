import Modal from "@/components/Modal";
import PostCard from "@/components/feed/PostCard";
import CommentsSection from "@/components/feed/CommentsSection";
import type { Post, User } from "@/types";

interface PostDetailModalProps {
  post: Post;
  viewer: User | null;
  onClose: () => void;
  onLike: (post: Post) => void;
  onDelete: (postId: string) => void;
  onCommentCountChange: (postId: string, delta: number) => void;
  onEdit?: (post: Post) => void;
}

/**
 * The expanded view of a post. The card is re-used rather than re-implemented
 * so every action — like, comment, edit, delete — behaves exactly as it does in
 * the feed. The comment thread sits in its own scrollable side panel so a long
 * thread does not push the post itself far down the page.
 */
export default function PostDetailModal({
  post,
  viewer,
  onClose,
  onLike,
  onDelete,
  onCommentCountChange,
  onEdit,
}: PostDetailModalProps) {
  return (
    <Modal title="Post" onClose={onClose} maxWidth="max-w-3xl">
      <div className="grid gap-0 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:divide-x md:divide-gray-800/60">
        {/* Post: keeps its own scroll so media/caption stay reachable. */}
        <div className="max-h-[70vh] overflow-y-auto pr-0 md:pr-3">
          <PostCard
            post={post}
            viewer={viewer}
            onLike={onLike}
            onDelete={onDelete}
            onCommentCountChange={onCommentCountChange}
            onEdit={onEdit}
            hideComments
          />
        </div>

        {/* Comments: independent scroll, always open, easier to read. */}
        <div className="mt-3 flex max-h-[70vh] flex-col overflow-hidden md:mt-0 md:pl-3">
          <CommentsSection
            postId={post.id}
            viewer={viewer}
            onCountChange={onCommentCountChange}
            embedded
          />
        </div>
      </div>
    </Modal>
  );
}
