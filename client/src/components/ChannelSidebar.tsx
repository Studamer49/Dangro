import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import type { Server, Channel } from "@/types";

export default function ChannelSidebar() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const toast = useToast();
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [showCreateChannelModal, setShowCreateChannelModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [joinedVoiceId, setJoinedVoiceId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // useToast() builds a fresh wrapper object on every render. Listing it in
  // the fetcher's dependency array would give that fetcher a new identity on
  // every render, the effect below would re-run, and the resulting setState
  // would render again — refetching the server forever. Mirror it into a ref;
  // every wrapper closes over the same stable push().
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const fetchServerForChannel = useCallback(async (cId: string) => {
    try {
      const { data } = await api.get(`/channels/${cId}/server`);
      setServer(data.server);
      setChannels(data.server.channels || []);
    } catch (err: unknown) {
      toastRef.current.error(apiErrorMessage(err, "Could not load this server"));
      setServer(null);
      setChannels([]);
      navigate("/explore", { replace: true });
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

  const myRole = useMemo(() => {
    if (!server || !currentUser) return null;
    return server.members?.find((m) => m.userId === currentUser.id)?.role ?? null;
  }, [server, currentUser]);

  const isModerator = myRole === "owner" || myRole === "admin";

  const createChannel = async () => {
    const name = newChannelName.trim();
    if (!name || !server || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post("/channels", {
        name,
        type: newChannelType,
        serverId: server.id,
      });
      setChannels((prev) => [...prev, data.channel]);
      setNewChannelName("");
      setShowCreateChannelModal(false);
      toast.success(`Created #${data.channel.name}`);
      if (newChannelType === "text") {
        navigate(`/channels/${data.channel.id}`);
      }
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not create channel"));
    } finally {
      setBusy(false);
    }
  };

  const saveRename = async () => {
    const name = renameValue.trim();
    if (!name || !server || busy) return;
    setBusy(true);
    try {
      const { data } = await api.patch(`/servers/${server.id}`, { name });
      setServer((prev) => (prev ? { ...prev, name: data.server.name } : prev));
      setShowSettingsModal(false);
      toast.success("Server renamed");
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not rename server"));
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (!server || busy) return;
    let code = server.inviteCode;
    if (isModerator) {
      try {
        const { data } = await api.post(`/servers/${server.id}/invite`);
        code = data.inviteCode;
        setServer((prev) => (prev ? { ...prev, inviteCode: code } : prev));
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, "Could not create invite"));
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/invite/${code}`);
      toast.success("Invite link copied");
    } catch {
      toast.info(`Invite code: ${code}`);
    }
  };

  const leaveServer = async () => {
    if (!server || busy) return;
    if (!window.confirm(`Leave ${server.name}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/servers/${server.id}/leave`);
      toast.success(data.message || "Left server");
      setShowSettingsModal(false);
      navigate("/explore");
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not leave server"));
    } finally {
      setBusy(false);
    }
  };

  const deleteServer = async () => {
    if (!server || busy) return;
    if (!window.confirm(`Delete ${server.name} forever? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const { data } = await api.delete(`/servers/${server.id}`);
      toast.success(data.message || "Server deleted");
      setShowSettingsModal(false);
      navigate("/explore");
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not delete server"));
    } finally {
      setBusy(false);
    }
  };

  const joinVoice = (voiceChannelId: string) => {
    const socket = getSocket();
    socket.emit("voice_leave", { channelId: joinedVoiceId });
    socket.emit("voice_join", { channelId: voiceChannelId });
    setJoinedVoiceId(voiceChannelId);
  };

  const leaveVoice = () => {
    if (joinedVoiceId) {
      const socket = getSocket();
      socket.emit("voice_leave", { channelId: joinedVoiceId });
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

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");
  const serverInitial = server.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex w-60 flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <button
          onClick={() => setShowSettingsModal(true)}
          className="flex max-w-[70%] items-center gap-2"
          title="Server settings"
        >
          {server.icon && (
            <img src={server.icon} alt={server.name} className="h-6 w-6 rounded-md object-cover" />
          )}
          <h2 className="truncate text-sm font-bold text-white group-hover:text-gray-200">{server.name}</h2>
        </button>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
          title="Server settings"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.484.484 0 00-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 00-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1115.6 12 3.61 3.61 0 0112 15.6z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {textChannels.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">Text Channels</h3>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => navigate(`/channels/${channel.id}`)}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  channelId === channel.id
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                # {channel.name}
              </button>
            ))}
          </div>
        )}

        {voiceChannels.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">Voice Channels</h3>
            {voiceChannels.map((channel) => (
              <div key={channel.id}>
                <button
                  onClick={() => joinVoice(channel.id)}
                  className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                    joinedVoiceId === channel.id
                      ? "bg-green-600/20 text-green-400"
                      : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                  }`}
                >
                  {joinedVoiceId === channel.id ? "●" : "🔊"} {channel.name}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {joinedVoiceId && (
        <div className="border-t border-gray-800 p-3">
          <div className="mb-2 flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-400">Voice Connected</span>
          </div>
          <button
            onClick={leaveVoice}
            className="w-full rounded-lg bg-red-600/20 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-600/30"
          >
            Disconnect
          </button>
        </div>
      )}

      {isModerator && (
        <div className="border-t border-gray-800 p-2">
          <button
            onClick={() => setShowCreateChannelModal(true)}
            className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500"
          >
            + Create Channel
          </button>
        </div>
      )}

      {showCreateChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Create Channel</h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="channel-name"
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
              autoFocus
            />
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setNewChannelType("text")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  newChannelType === "text" ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setNewChannelType("voice")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  newChannelType === "voice" ? "bg-accent-600 text-white" : "bg-gray-800 text-gray-400"
                }`}
              >
                Voice
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateChannelModal(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                disabled={busy}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busy ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <div className="mb-4 flex items-center gap-3">
              {server.icon && (
                <img src={server.icon} alt={server.name} className="h-9 w-9 rounded-lg object-cover" />
              )}
              {!server.icon && (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-800 text-sm font-bold text-white">
                  {serverInitial}
                </div>
              )}
              <div>
                <h3 className="text-lg font-bold text-white">{server.name}</h3>
                <p className="text-xs text-gray-500">
                  {server._count?.members ?? server.members?.length ?? 0} members
                </p>
              </div>
            </div>

            {isModerator && (
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Server name</label>
                <input
                  type="text"
                  value={renameValue || server.name}
                  onChange={(e) => setRenameValue(e.target.value)}
                  className="mb-2 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
                  onKeyDown={(e) => e.key === "Enter" && saveRename()}
                />
                <button
                  onClick={saveRename}
                  disabled={busy}
                  className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Rename server"}
                </button>
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">Invite code</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-gray-800 px-3 py-2 text-sm text-green-300">
                  {server.inviteCode}
                </code>
                <button
                  onClick={copyInvite}
                  disabled={busy}
                  className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                  title="Copy invite link (rotates the code)"
                >
                  Copy
                </button>
              </div>
              <p className="mt-1 truncate text-xs text-gray-500">
                {window.location.origin}/invite/{server.inviteCode}
              </p>
            </div>

            <div className="space-y-2 border-t border-gray-800 pt-4">
              <button
                onClick={leaveServer}
                disabled={busy}
                className="w-full rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50"
              >
                Leave server
              </button>
              {myRole === "owner" && (
                <button
                  onClick={deleteServer}
                  disabled={busy}
                  className="w-full rounded-lg bg-red-600/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50"
                >
                  Delete server
                </button>
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setRenameValue("");
                }}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}