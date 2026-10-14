import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import Avatar from "@/components/Avatar";
import type { PostComment, User } from "@/types";

interface CommentsSectionProps {
  postId: string;
  viewer: User | null;
  onCountChange: (postId: string, delta: number) => void;
}

export default function CommentsSection({ postId, viewer, onCountChange }: CommentsSectionProps) {
  const toast = useToast();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  /** Id of the comment currently open in the inline editor. */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/posts/${postId}/comments`);
      setComments(data.comments ?? []);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const submitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: PostComment = {
      id: tempId,
      postId,
      authorId: viewer?.id ?? "",
      content,
      createdAt: new Date().toISOString(),
      author: viewer ?? undefined,
    };

    setSending(true);
    setDraft("");
    setComments((prev) => [...prev, optimistic]);
    onCountChange(postId, 1);

    try {
      const { data } = await api.post(`/posts/${postId}/comments`, { content });
      const created = data.comment as PostComment | undefined;
      if (created) {
        setComments((prev) => prev.map((comment) => (comment.id === tempId ? created : comment)));
      }
    } catch (err) {
      setComments((prev) => prev.filter((comment) => comment.id !== tempId));
      onCountChange(postId, -1);
      setDraft(content);
      toast.error(apiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const startEdit = (comment: PostComment) => {
    setEditingId(comment.id);
    setEditDraft(comment.content);
  };

  const saveEdit = async (comment: PostComment) => {
    const content = editDraft.trim();
    if (!content) return;
    try {
      const { data } = await api.patch(`/posts/comments/${comment.id}`, { content });
      setComments((prev) =>
        prev.map((entry) => (entry.id === comment.id ? (data.comment as PostComment) : entry))
      );
      setEditingId(null);
      toast.success("Comment updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update the comment"));
    }
  };

  const remove = async (comment: PostComment) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api.delete(`/posts/comments/${comment.id}`);
      setComments((prev) => prev.filter((entry) => entry.id !== comment.id));
      onCountChange(postId, -1);
      if (editingId === comment.id) setEditingId(null);
      toast.success("Comment deleted");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete the comment"));
    }
  };

  return (
    <div className="anim-reply-in border-t border-gray-800 p-4 pt-3">
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      ) : error ? (
        <div className="py-4 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void loadComments()}
            className="mt-2 rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-700"
          >
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">No comments yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((comment) => {
            const isOwn = viewer !== null && comment.authorId === viewer.id;
            const isEditing = editingId === comment.id;

            return (
              <li key={comment.id} className="group flex gap-2">
                <Avatar user={comment.author} className="h-7 w-7 text-xs" />
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-1">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value.slice(0, 500))}
                        rows={2}
                        maxLength={500}
                        autoFocus
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-sm text-white focus:border-accent-500 focus:outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(comment)}
                          disabled={!editDraft.trim()}
                          className="rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-white">
                        <span className="font-medium">{comment.author?.username ?? "Unknown"}</span>{" "}
                        <span className="whitespace-pre-wrap break-words text-gray-300">{comment.content}</span>
                      </p>
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] text-gray-500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </p>
                        {isOwn && !comment.id.startsWith("temp-") && (
                          <span className="hidden gap-2 group-hover:inline-flex">
                            <button
                              type="button"
                              onClick={() => startEdit(comment)}
                              className="text-[11px] text-gray-400 hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(comment)}
                              className="text-[11px] text-gray-400 hover:text-red-400"
                            >
                              Delete
                            </button>
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={(event) => void submitComment(event)} className="mt-3 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="Add a comment..."
          aria-label="Add a comment"
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="shrink-0 rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Posting..." : "Post"}
        </button>
      </form>
    </div>
  );
}
