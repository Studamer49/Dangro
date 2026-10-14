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
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={save} disabled={busy || !name.trim()} className="btn-primary">
            {busy ? "Saving…" : "Save changes"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="channel-name">
            Channel name
          </label>
          <div className="flex items-center gap-1.5">
            <span className="select-none font-semibold text-gray-500">#</span>
            <input
              id="channel-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              onKeyDown={(e) => e.key === "Enter" && save()}
              className="field"
            />
          </div>
        </div>

        <div>
          <label className="field-label" htmlFor="channel-category">
            Category
          </label>
          <select
            id="channel-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="field"
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
            <label className="field-label" htmlFor="channel-topic">
              Channel topic
            </label>
            <textarea
              id="channel-topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              maxLength={1024}
              rows={2}
              placeholder="What is this channel about?"
              className="field resize-none"
            />
          </div>
        )}

        <div className="border-t border-gray-700/60 pt-4">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="btn-danger"
            >
              Delete channel
            </button>
          ) : (
            <div className="animate-pop-in rounded-xl border border-red-500/30 bg-red-600/[0.07] p-4 shadow-[0_0_40px_-18px_rgb(239_68_68/0.6)]">
              <p className="mb-3 text-xs leading-relaxed text-gray-400">
                Deleting <span className="font-semibold text-white">#{channel.name}</span>{" "}
                removes every message in it. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={remove}
                  disabled={busy}
                  className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-all duration-200 shadow-[0_8px_20px_-8px_rgb(239_68_68/0.7)] hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
                >
                  {busy ? "Deleting…" : "Yes, delete it"}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn-ghost px-3 py-1.5 text-xs"
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
