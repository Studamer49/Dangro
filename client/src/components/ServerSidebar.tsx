import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import type { Server } from "@/types";

export default function ServerSidebar() {
  const [servers, setServers] = useState<Server[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const { data } = await api.get("/servers");
      setServers(data.servers);
    } catch {
      // silent
    }
  };

  const createServer = async () => {
    if (!newServerName.trim()) return;
    try {
      const { data } = await api.post("/servers", { name: newServerName });
      setServers((prev) => [...prev, data.server]);
      setNewServerName("");
      setShowCreateModal(false);
      navigate(`/channels/${data.server.channels?.[0]?.id}`);
    } catch {
      // silent
    }
  };

  return (
    <div className="flex w-[72px] flex-col items-center gap-2 bg-gray-950 py-3">
      <button
        onClick={() => navigate("/friends")}
        className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-dangro-400 transition-all hover:rounded-xl hover:bg-dangro-600 hover:text-white"
        title="Friends"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </button>

      <div className="mx-2 h-0.5 w-8 rounded-full bg-gray-800" />

      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => navigate(`/channels/${server.channels?.[0]?.id}`)}
          className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-white transition-all hover:rounded-xl hover:bg-dangro-600"
          title={server.name}
        >
          {server.icon ? (
            <img src={server.icon} alt={server.name} className="h-full w-full rounded-inherit object-cover" />
          ) : (
            <span className="text-lg font-bold">{server.name[0].toUpperCase()}</span>
          )}
        </button>
      ))}

      <button
        onClick={() => setShowCreateModal(true)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-green-500 transition-all hover:rounded-xl hover:bg-green-600 hover:text-white"
        title="Create Server"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Create Server</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder="Server name"
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-dangro-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && createServer()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={createServer}
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
