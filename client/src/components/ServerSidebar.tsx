import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import api, { apiErrorMessage } from "@/lib/api";
import type { Server } from "@/types";

export default function ServerSidebar() {
  const [servers, setServers] = useState<Server[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newServerName, setNewServerName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyJoin, setBusyJoin] = useState(false);
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const navigate = useNavigate();

  const fetchServers = useCallback(async () => {
    try {
      const { data } = await api.get("/servers");
      setServers(data.servers);
    } catch {
      // silent - sidebar can stay empty
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const createServer = async () => {
    const name = newServerName.trim();
    if (!name || busyCreate) return;
    setBusyCreate(true);
    try {
      const { data } = await api.post("/servers", { name });
      setServers((prev) => [...prev, data.server]);
      setNewServerName("");
      setShowCreateModal(false);
      toast.success(`Created ${data.server.name}`);
      const firstChannel = data.server.channels?.[0]?.id;
      if (firstChannel) navigate(`/channels/${firstChannel}`);
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Could not create server"));
    } finally {
      setBusyCreate(false);
    }
  };

  const joinServer = async () => {
    const code = inviteCode.trim().toLowerCase();
    if (!code || busyJoin) return;
    setBusyJoin(true);
    try {
      const { data } = await api.get(`/servers/join/${encodeURIComponent(code)}`);
      setInviteCode("");
      setShowJoinModal(false);
      toast.success(`Joined ${data.server.name}`);
      const firstChannel = data.server.channels?.[0]?.id;
      if (firstChannel) navigate(`/channels/${firstChannel}`);
      else await fetchServers();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Invalid invite code"));
    } finally {
      setBusyJoin(false);
    }
  };

  const openChannel = (server: Server) => {
    const firstChannel = server.channels?.[0]?.id;
    if (firstChannel) navigate(`/channels/${firstChannel}`);
  };

  return (
    <div className="flex w-[72px] flex-col items-center gap-2 bg-gray-950 py-3">
      <button
        onClick={() => navigate("/feed")}
        className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-gray-400 transition-all hover:rounded-xl hover:bg-accent-600 hover:text-white"
        title="Feed"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </button>

      <button
        onClick={() => navigate("/dms")}
        className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-gray-400 transition-all hover:rounded-xl hover:bg-green-600 hover:text-white"
        title="Messages"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      </button>

      <button
        onClick={() => navigate("/friends")}
        className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-gray-400 transition-all hover:rounded-xl hover:bg-accent-600 hover:text-white"
        title="Friends"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </button>

      <button
        onClick={() => navigate("/explore")}
        className="group flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-gray-400 transition-all hover:rounded-xl hover:bg-purple-600 hover:text-white"
        title="Explore"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>

      <div className="mx-2 h-0.5 w-8 rounded-full bg-gray-800" />

      {servers.map((server) => (
        <button
          key={server.id}
          onClick={() => openChannel(server)}
          className="group relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-white transition-all hover:rounded-xl hover:bg-accent-600"
          title={server.name}
        >
          {server.icon ? (
            <img src={server.icon} alt={server.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            <span className="text-lg font-bold">{server.name?.[0]?.toUpperCase() ?? "?"}</span>
          )}
        </button>
      ))}

      <button
        onClick={() => setShowJoinModal(true)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-purple-400 transition-all hover:rounded-xl hover:bg-purple-600 hover:text-white"
        title="Join a Server"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      <button
        onClick={() => setShowCreateModal(true)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-green-500 transition-all hover:rounded-xl hover:bg-green-600 hover:text-white"
        title="Create Server"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
        </svg>
      </button>

      <div className="mt-auto" />

      <button
        onClick={() => navigate(`/profile/${user?.id}`)}
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-800 text-white transition-all hover:rounded-xl hover:bg-accent-600"
        title="Profile"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <span className="text-lg font-bold">{user?.username?.[0]?.toUpperCase() ?? "?"}</span>
        )}
      </button>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <h3 className="mb-4 text-lg font-bold text-white">Create Server</h3>
            <input
              type="text"
              value={newServerName}
              onChange={(e) => setNewServerName(e.target.value)}
              placeholder="Server name"
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
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
                disabled={busyCreate}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busyCreate ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-gray-900 p-6">
            <h3 className="mb-1 text-lg font-bold text-white">Join a Server</h3>
            <p className="mb-4 text-sm text-gray-400">Enter an invite code to join.</p>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="Invite code"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && joinServer()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowJoinModal(false)}
                className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={joinServer}
                disabled={busyJoin}
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm text-white hover:bg-purple-500 disabled:opacity-50"
              >
                {busyJoin ? "Joining..." : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}