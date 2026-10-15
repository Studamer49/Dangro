import Modal from "@/components/Modal";
import PostCard from "@/components/feed/PostCard";
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
 * the feed, and the comment thread is opened immediately.
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
    <Modal title="Post" onClose={onClose} maxWidth="max-w-xl">
      <PostCard
        post={post}
        viewer={viewer}
        onLike={onLike}
        onDelete={onDelete}
        onCommentCountChange={onCommentCountChange}
        onEdit={onEdit}
        defaultShowComments
      />
    </Modal>
  );
}
