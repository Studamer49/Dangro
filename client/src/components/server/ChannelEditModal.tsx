import { useState } from "react";
import Modal from "@/components/Modal";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import type { Category, Channel } from "@/types";

interface Props {
  channel: Channel;
  categories: Category[];
  /** False removes the channel from its category. */
  onClose: () => void;
  onSaved: (channel: Channel) => void;
  onDeleted: (channelId: string) => void;
}

/** Rename a channel, set its topic, or move it between categories. */
export default function ChannelEditModal({ channel, categories, onClose, onSaved, onDeleted }: Props) {
  const toast = useToast();
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic ?? "");
  const [categoryId, setCategoryId] = useState(channel.categoryId ?? "");
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/channels/${channel.id}`, {
        name,
        topic: topic.trim() === "" ? null : topic,
        // Sent explicitly so clearing the category actually moves it.
        categoryId: categoryId === "" ? null : categoryId,
      });
      onSaved(data.channel);
      onClose();
      toast.success("Channel updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update channel"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api.delete(`/channels/${channel.id}`);
      onDeleted(channel.id);
      onClose();
      toast.success("Channel deleted");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete channel"));
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Edit #${channel.name}`}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={busy || !name.trim()}
            className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Channel name</label>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">#</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-accent-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
            Category
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {channel.type === "text" && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Channel topic
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={1024}
              rows={2}
              placeholder="What is this channel about?"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
        )}

        <div className="border-t border-gray-800 pt-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg bg-red-600/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30"
            >
              Delete channel
            </button>
          ) : (
            <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-3">
              <p className="mb-2 text-xs text-gray-400">
                Deleting <span className="font-mono text-white">#{channel.name}</span> removes every
                message in it. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={remove}
                  disabled={busy}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {busy ? "Deleting…" : "Yes, delete it"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
