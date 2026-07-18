import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { Server, Channel } from "@/types";

export default function ChannelSidebar() {
  const { channelId } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState<Server | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelType, setNewChannelType] = useState<"text" | "voice">("text");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (channelId) {
      fetchServerForChannel(channelId);
    }
  }, [channelId]);

  const fetchServerForChannel = async (cId: string) => {
    try {
      const { data } = await api.get(`/channels/${cId}/server`);
      setServer(data.server);
      setChannels(data.server.channels || []);
    } catch {
      // silent
    }
  };

  const createChannel = async () => {
    if (!newChannelName.trim() || !server) return;
    try {
      const { data } = await api.post("/channels", {
        name: newChannelName,
        type: newChannelType,
        serverId: server.id,
      });
      setChannels((prev) => [...prev, data.channel]);
      setNewChannelName("");
      setShowCreateModal(false);
      navigate(`/channels/${data.channel.id}`);
    } catch {
      // silent
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

  return (
    <div className="flex w-60 flex-col bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="truncate text-sm font-bold text-white">{server.name}</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {textChannels.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">
              Text Channels
            </h3>
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
            <h3 className="mb-1 px-2 text-xs font-semibold uppercase text-gray-500">
              Voice Channels
            </h3>
            {voiceChannels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => navigate(`/channels/${channel.id}`)}
                className={`w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  channelId === channel.id
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                }`}
              >
                🔊 {channel.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-800 p-2">
        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full rounded-lg bg-dangro-600 px-3 py-2 text-sm font-medium text-white hover:bg-dangro-500"
        >
          + Create Channel
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Create Channel</h3>
            <input
              type="text"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              placeholder="channel-name"
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-dangro-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && createChannel()}
              autoFocus
            />
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setNewChannelType("text")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  newChannelType === "text"
                    ? "bg-dangro-600 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                Text
              </button>
              <button
                onClick={() => setNewChannelType("voice")}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  newChannelType === "voice"
                    ? "bg-dangro-600 text-white"
                    : "bg-gray-800 text-gray-400"
                }`}
              >
                Voice
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createChannel}
                className="rounded-lg bg-dangro-600 px-4 py-2 text-sm text-white hover:bg-dangro-500"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
