import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErrorCode, apiErrorMessage } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import Modal from "@/components/Modal";
import InviteModal from "@/components/server/InviteModal";
import ServerSettingsModal from "@/components/server/ServerSettingsModal";
import ChannelEditModal from "@/components/server/ChannelEditModal";
import type { Server, Channel, Category, Role } from "@/types";

/** Discord's sidebar: collapsible category folders, each holding channels. */
interface ChannelGroup {
  category: Category | null;
  text: Channel[];
  voice: Channel[];
}

export default function ChannelSidebar() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const toast = useToast();

  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [showInvites, setShowInvites] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);

  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [newChannelCategory, setNewChannelCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");

  const [joinedVoiceId, setJoinedVoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // useToast() is memoised on the store's push, but it is still safer to read
  // it through a ref inside callbacks that a dependency array would otherwise
  // have to list — a changing identity here would refetch the server forever.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchServerForChannel = useCallback(async (cId: string) => {
    try {
      const { data } = await api.get(`/channels/${cId}/server`);
      setServer(data.server);
      setChannels(data.server.channels || []);
      setCategories(data.server.categories || []);
    } catch (err: unknown) {
      toastRef.current.error(apiErrorMessage(err, "Could not load this server"));
      setServer(null);
      setChannels([]);
      // Only an access problem means "you cannot be here". Treating a 500 or a
      // dropped connection the same way silently navigated the reader out of
      // the channel they were in, with no way back except the browser.
      const code = apiErrorCode(err);
      if (code === "FORBIDDEN" || code === "NOT_FOUND") {
        navigate("/explore", { replace: true });
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (channelId) {
      fetchServerForChannel(channelId);
    } else {
      setServer(null);
      setChannels([]);
      setJoinedVoiceId(null);
    }
  }, [channelId, fetchServerForChannel]);

  const myRole = useMemo<Role | null>(() => {
    if (!server || !currentUser) return null;
    if (server.ownerId === currentUser.id) return "owner";
    return server.members?.find((m) => m.userId === currentUser.id)?.role ?? null;
  }, [server, currentUser]);

  const isModerator = myRole === "owner" || myRole === "admin";
  const canManageChannels = myRole === "owner" || myRole === "admin" || myRole === "moderator";

  /**
   * Buckets the channels by category, preserving the order the server returned.
   * Uncategorized channels come first, which is where Discord puts them.
   */
  const groups = useMemo<ChannelGroup[]>(() => {
    const used = new Set<string>();
    const built = categories.map((category) => {
      const inCategory = channels.filter((c) => c.categoryId === category.id);
      for (const channel of inCategory) used.add(channel.id);
      return {
        category,
        text: inCategory.filter((c) => c.type === "text"),
        voice: inCategory.filter((c) => c.type === "voice"),
      };
    });

    const loose = channels.filter((c) => !used.has(c.id));
    const looseGroup: ChannelGroup = {
      category: null,
      text: loose.filter((c) => c.type === "text"),
      voice: loose.filter((c) => c.type === "voice"),
    };

    // Only show the uncategorised header when there is something under it.
    return looseGroup.text.length || looseGroup.voice.length ? [looseGroup, ...built] : built;
  }, [channels, categories]);

  const toggleGroup = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createChannel = async () => {
    const name = newChannelName.trim();
    if (!name || !server || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/channels", {
        name,
        type: newChannelType,
        serverId: server.id,
        categoryId: newChannelCategory || null,
      });
      setChannels((prev) => [...prev, data.channel]);
      setNewChannelName("");
      setShowCreateChannel(false);
      toast.success(`Created #${data.channel.name}`);
      if (newChannelType === "text") navigate(`/channels/${data.channel.id}`);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not create channel"));
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || !server || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/servers/${server.id}/categories`, { name });
      setCategories((prev) => [...prev, data.category]);
      setNewCategoryName("");
      setShowCreateCategory(false);
      toast.success(`Created ${name}`);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not create category"));
    } finally {
      setBusy(false);
    }
  };

  const deleteCategory = async (category: Category) => {
    if (!server) return;
    if (!window.confirm(`Delete "${category.name}"? Its channels move out, they are not deleted.`)) return;
    try {
      await api.delete(`/categories/${category.id}`);
      setCategories((prev) => prev.filter((c) => c.id !== category.id));
      setChannels((prev) => prev.map((c) => (c.categoryId === category.id ? { ...c, categoryId: null } : c)));
      toast.success("Category deleted");
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not delete category"));
    }
  };

  const renameCategory = async (category: Category) => {
    const name = window.prompt("Category name", category.name)?.trim();
    if (!name || name === category.name || !server) return;
    try {
      await api.patch(`/categories/${category.id}`, { name });
      setCategories((prev) => prev.map((c) => (c.id === category.id ? { ...c, name } : c)));
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not rename category"));
    }
  };

  const onChannelSaved = (updated: Channel) => {
    setChannels((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
  };

  const onChannelDeleted = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    if (id === channelId) navigate("/explore");
  };

  const joinVoice = (voiceChannelId: string) => {
    const socket = getSocket();
    socket.emit("voice_leave", { channelId: joinedVoiceId });
    socket.emit("voice_join", { channelId: voiceChannelId });
    setJoinedVoiceId(voiceChannelId);
  };

  const leaveVoice = () => {
    if (joinedVoiceId) {
      getSocket().emit("voice_leave", { channelId: joinedVoiceId });
      setJoinedVoiceId(null);
    }
  };

  if (!server) {
    return (
      <div className="w-60 bg-gray-900 p-4">
        <p className="text-sm text-gray-500">Select a server</p>
      </div>
    );
  }

  const renderChannelButton = (channel: Channel) => {
    const isVoice = channel.type === "voice";
    const active = isVoice ? joinedVoiceId === channel.id : channelId === channel.id;

    return (
      <div key={channel.id} className="group/channel relative flex items-center">
        <button
          onClick={() => (isVoice ? joinVoice(channel.id) : navigate(`/channels/${channel.id}`))}
          className={`flex-1 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
            active
              ? isVoice
                ? "bg-green-600/20 text-green-400"
                : "bg-gray-700 text-white"
              : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
          }`}
        >
          {isVoice ? (active ? "● " : "🔊 ") : "# "}
          {channel.name}
        </button>

        {canManageChannels && (
          <button
            onClick={() => setEditingChannel(channel)}
            aria-label={`Edit #${channel.name}`}
            title="Channel settings"
            className="absolute right-1 hidden rounded p-0.5 text-gray-500 hover:bg-gray-700 hover:text-white group-hover/channel:block"
          >
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z" />
              <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 00.12-.64l-2-3.46a.5.5 0 00-.61-.22l-2.49 1a7.3 7.3 0 00-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.49.49 0 00-.61.22l-2 3.46a.49.49 0 00.12.64l2.11 1.65c-.04.32-.08.66-.08.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65z" />
            </svg>
          </button>
        )}
      </div>
    );
  };

  const renderGroup = (group: ChannelGroup, index: number) => {
    const id = group.category?.id ?? "uncategorised";
    const isCollapsed = collapsed.has(id);
    const label = group.category?.name ?? "Text Channels";
    const hasContent = group.text.length > 0 || group.voice.length > 0;

    return (
      <div key={id} className="mb-2">
        <div className="group/cat flex items-center px-1">
          <button
            onClick={() => toggleGroup(id)}
            aria-expanded={!isCollapsed}
            className="flex flex-1 items-center gap-1 py-1 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-300"
          >
            <svg
              className={`h-3 w-3 transition-transform ${isCollapsed ? "" : "rotate-90"}`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M9 6l6 6-6 6z" />
            </svg>
            {label}
          </button>

          {canManageChannels && (
            <button
              onClick={() => {
                setNewChannelCategory(group.category?.id ?? "");
                setNewChannelType(group.category?.name.toLowerCase().includes("voice") ? "voice" : "text");
                setShowCreateChannel(true);
              }}
              aria-label={`Create channel in ${label}`}
              title="Create channel"
              className="hidden rounded p-0.5 text-gray-500 hover:text-gray-300 group-hover/cat:block"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11 5a1 1 0 112 0v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H6a1 1 0 110-2h5V5z" />
              </svg>
            </button>
          )}

          {isModerator && group.category && (
            <>
              <button
                onClick={() => renameCategory(group.category as Category)}
                aria-label={`Rename ${label}`}
                className="hidden rounded p-0.5 text-gray-500 hover:text-gray-300 group-hover/cat:block"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4 20h4l10.5-10.5a2.12 2.12 0 00-3-3L5 17v3zm14.7-11.7a1 1 0 000-1.4l-2.6-2.6a1 1 0 00-1.4 0l-1.8 1.8 3 3 1.8-1.8z" />
                </svg>
              </button>
              <button
                onClick={() => deleteCategory(group.category as Category)}
                aria-label={`Delete ${label}`}
                className="hidden rounded p-0.5 text-gray-500 hover:text-red-400 group-hover/cat:block"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {!isCollapsed && hasContent && (
          <div className="space-y-0.5">
            {group.text.map(renderChannelButton)}
            {group.voice.length > 0 && group.text.length > 0 && (
              <div className="px-2 pt-2" />
            )}
            {group.voice.map(renderChannelButton)}
          </div>
        )}

        {!hasContent && index === 0 && (
          <p className="px-2 py-1 text-xs text-gray-600">No channels yet</p>
        )}
      </div>
    );
  };

  const serverInitial = server.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex w-60 flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <button onClick={() => setShowSettings(true)} className="flex max-w-[70%] items-center gap-2">
          {server.icon ? (
            <img src={server.icon} alt={server.name} className="h-6 w-6 rounded-md object-cover" />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-700 text-xs font-bold text-white">
              {serverInitial}
            </span>
          )}
          <h2 className="truncate text-sm font-bold text-white">{server.name}</h2>
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          title="Server settings"
          aria-label="Server settings"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {groups.map(renderGroup)}
      </div>

      {joinedVoiceId && (
        <div className="border-t border-gray-800 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-400">Voice Connected</span>
          </div>
          <button
            onClick={leaveVoice}
            className="w-full rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-600/30"
          >
            Disconnect
          </button>
        </div>
      )}

      {canManageChannels && (
        <div className="flex gap-1 border-t border-gray-800 p-2">
          <button
            onClick={() => {
              setNewChannelCategory("");
              setNewChannelType("text");
              setShowCreateChannel(true);
            }}
            className="flex-1 rounded-lg bg-accent-600 px-2 py-2 text-xs font-medium text-white hover:bg-accent-500"
          >
            + Channel
          </button>
          {isModerator && (
            <button
              onClick={() => setShowCreateCategory(true)}
              className="rounded-lg bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700"
              title="Create category"
            >
              + Category
            </button>
          )}
        </div>
      )}

      {showCreateChannel && (
        <Modal
          title="Create Channel"
          onClose={() => setShowCreateChannel(false)}
          footer={
            <>
              <button
                onClick={() => setShowCreateChannel(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={busy || !newChannelName.trim()}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </>
          }
        >
          <div className="mb-4 flex items-center gap-1">
            <span className="text-gray-500">#</span>
            <input
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
              placeholder="channel-name"
              maxLength={100}
              autoFocus
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
              Channel type
            </label>
            <div className="flex gap-2">
              {(["text", "voice"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setNewChannelType(type)}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm capitalize ${
                    newChannelType === type ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {categories.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                Category
              </label>
              <select
                value={newChannelCategory}
                onChange={(e) => setNewChannelCategory(e.target.value)}
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
          )}
        </Modal>
      )}

      {showCreateCategory && (
        <Modal
          title="Create Category"
          onClose={() => setShowCreateCategory(false)}
          footer={
            <>
              <button
                onClick={() => setShowCreateCategory(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createCategory}
                disabled={busy || !newCategoryName.trim()}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busy ? "Creating…" : "Create"}
              </button>
            </>
          }
        >
          <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
            Category name
          </label>
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createCategory()}
            placeholder="New Category"
            maxLength={100}
            autoFocus
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
          />
        </Modal>
      )}

      {editingChannel && (
        <ChannelEditModal
          channel={editingChannel}
          categories={categories}
          onClose={() => setEditingChannel(null)}
          onSaved={onChannelSaved}
          onDeleted={onChannelDeleted}
        />
      )}

      {showInvites && (
        <InviteModal
          serverId={server.id}
          permanentCode={server.inviteCode}
          channels={channels}
          onClose={() => setShowInvites(false)}
        />
      )}

      {showSettings && (
        <ServerSettingsModal
          server={server}
          myRole={myRole}
          onClose={() => setShowSettings(false)}
          onOpenInvites={() => {
            setShowSettings(false);
            setShowInvites(true);
          }}
          onSaved={(updated) => setServer((prev) => (prev ? { ...prev, ...updated } : prev))}
        />
      )}
    </div>
  );
}
