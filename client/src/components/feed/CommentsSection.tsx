import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useConfirm } from "@/hooks/useConfirm";
import Avatar from "@/components/Avatar";
import type { PostComment, User } from "@/types";

interface CommentsSectionProps {
  postId: string;
  viewer: User | null;
  onCountChange: (postId: string, delta: number) => void;
}

export default function CommentsSection({ postId, viewer, onCountChange }: CommentsSectionProps) {
  const toast = useToast();
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: "Delete this comment?",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
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
    <div className="border-t border-gray-700/50 p-4 pt-3">
      {loading ? (
        <div className="space-y-3 py-1">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex gap-2.5">
              <div className="skeleton h-7 w-7 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5 pt-1">
                <div className="skeleton h-2.5 w-24 rounded-full" />
                <div className="skeleton h-2.5 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Could not load comments</p>
            <p className="mt-1 text-xs text-red-400">{error}</p>
          </div>
          <button type="button" onClick={() => void loadComments()} className="btn-ghost px-3 py-1.5 text-xs">
            Retry
          </button>
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-5 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-500/10 text-gray-500">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-300">No comments yet.</p>
          <p className="text-xs text-gray-500">Be the first.</p>
        </div>
      ) : (
        <ul className="space-y-1">
          {comments.map((comment) => {
            const isOwn = viewer !== null && comment.authorId === viewer.id;
            const isEditing = editingId === comment.id;

            return (
              <li
                key={comment.id}
                className="group -ml-2 flex gap-2.5 rounded-r-lg border-l-2 border-transparent py-2 pl-2 pr-1 transition-all duration-200 ease-out hover:border-accent-400/50 hover:bg-gray-500/5"
              >
                <Avatar user={comment.author} className="h-7 w-7 text-xs" />
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value.slice(0, 500))}
                        rows={2}
                        maxLength={500}
                        autoFocus
                        className="field resize-none"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="btn-ghost px-2.5 py-1 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void saveEdit(comment)}
                          disabled={!editDraft.trim()}
                          className="btn-primary px-2.5 py-1 text-xs"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed text-gray-200">
                        <span className="font-semibold tracking-tight text-white">
                          {comment.author?.username ?? "Unknown"}
                        </span>{" "}
                        <span className="whitespace-pre-wrap break-words">{comment.content}</span>
                      </p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p className="tabular text-[11px] text-gray-500">
                          {new Date(comment.createdAt).toLocaleDateString()}
                        </p>
                        {isOwn && !comment.id.startsWith("temp-") && (
                          <span className="hidden gap-2 group-hover:inline-flex">
                            <button
                              type="button"
                              onClick={() => startEdit(comment)}
                              className="rounded px-1 text-[11px] font-medium text-gray-400 transition-colors duration-150 ease-out hover:text-white"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void remove(comment)}
                              className="rounded px-1 text-[11px] font-medium text-gray-400 transition-colors duration-150 ease-out hover:text-red-400"
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

      <form onSubmit={(event) => void submitComment(event)} className="mt-3 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          placeholder="Add a comment..."
          aria-label="Add a comment"
          className="field flex-1"
        />
        <button
          type="submit"
          disabled={!draft.trim() || sending}
          className="btn-primary shrink-0 px-3.5 py-2"
        >
          {sending ? "Posting..." : "Post"}
        </button>
      </form>
    </div>
  );
}
