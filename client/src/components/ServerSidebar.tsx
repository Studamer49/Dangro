import {
  useCallback,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useServerPrefsStore } from "@/stores/serverPrefsStore";
import { useBounce, type BounceVariant } from "@/hooks/useBounce";
import { useConfirm } from "@/hooks/useConfirm";
import ServerSettingsModal from "@/components/server/ServerSettingsModal";
import InviteModal from "@/components/server/InviteModal";
import api, { apiErrorMessage } from "@/lib/api";
import type { Server } from "@/types";

/**
 * Sidebar button that plays a short bounce on click, forwards a click handler
 * for navigation, and reveals a label that slides in beside it on hover. The
 * bounce is decorative, so it runs before the handler and never blocks it.
 *
 * The label hides again as soon as the pointer leaves — and also on click, so
 * it never lingers over the page you just navigated to.
 */
function BouncyButton({
  variant = "pop",
  onClick,
  children,
  tooltip,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BounceVariant; tooltip?: string }) {
  const { ref, bounce } = useBounce<HTMLButtonElement>();
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <button
      ref={ref}
      {...rest}
      data-bounce="self"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={(event) => {
        setShowTooltip(false);
        bounce(variant);
        onClick?.(event);
      }}
      className={`relative ${className ?? ""}`}
    >
      {children}
      {tooltip && (
        <span
          role="tooltip"
          className={`glass-panel layer-popup pointer-events-none absolute left-full top-1/2 ml-3 -translate-y-1/2 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-sm font-semibold text-white transition-all duration-150 ease-out ${
            showTooltip ? "translate-x-0 opacity-100" : "-translate-x-1.5 opacity-0"
          }`}
        >
          {tooltip}
          <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-gray-800" />
        </span>
      )}
    </button>
  );
}

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
  const location = useLocation();
  const confirm = useConfirm();
  const isMuted = useServerPrefsStore((s) => s.isMuted);
  const toggleMute = useServerPrefsStore((s) => s.toggleMute);
  const markRead = useServerPrefsStore((s) => s.markRead);

  // Which server the right-click menu belongs to, and where it was opened.
  const [menu, setMenu] = useState<{ server: Server; x: number; y: number } | null>(null);
  const [settingsServer, setSettingsServer] = useState<Server | null>(null);
  const [inviteServer, setInviteServer] = useState<Server | null>(null);

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
      // POST: joining mutates. Accepts a managed invite code or the server's
      // permanent code, and reports which channel to land in.
      const { data } = await api.post(`/servers/join/${encodeURIComponent(code)}`);
      setInviteCode("");
      setShowJoinModal(false);
      toast.success(`Joined ${data.server.name}`);
      const target =
        data.channelId ?? data.server.channels?.find((c: { type: string }) => c.type === "text")?.id;
      if (target) navigate(`/channels/${target}`);
      else await fetchServers();
    } catch (err: unknown) {
      toast.error(apiErrorMessage(err, "Invalid invite code"));
    } finally {
      setBusyJoin(false);
    }
  };

  const openChannel = (server: Server) => {
    // The server only returns text channels, but this list is also fed by the
    // explore/join paths. Landing on a voice channel would render the text
    // chat view for it.
    const firstChannel = server.channels?.find((c) => c.type !== "voice") ?? server.channels?.[0];
    if (firstChannel) navigate(`/channels/${firstChannel.id}`);
  };

  /** Close the context menu on Escape, scroll or resize so it never floats. */
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const openMenu = (event: MouseEvent, server: Server) => {
    event.preventDefault();
    // Keep the panel fully on screen instead of letting it clip off an edge.
    const width = 208;
    const height = 248;
    setMenu({
      server,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - height - 8)),
    });
  };

  const removeServer = (serverId: string) =>
    setServers((prev) => prev.filter((s) => s.id !== serverId));

  /** Whether acting on this server should also navigate the viewer out of it. */
  const isViewingServer = (server: Server) =>
    (server.channels ?? []).some((channel) => location.pathname === `/channels/${channel.id}`);

  const leaveServer = async (server: Server) => {
    setMenu(null);
    const ok = await confirm({
      title: `Leave ${server.name}?`,
      message: "You will need a new invite to rejoin this server.",
      confirmLabel: "Leave server",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.post(`/servers/${server.id}/leave`);
      removeServer(server.id);
      toast.success(`Left ${server.name}`);
      if (isViewingServer(server)) navigate("/explore");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not leave server"));
    }
  };

  const deleteServer = async (server: Server) => {
    setMenu(null);
    const ok = await confirm({
      title: `Delete ${server.name}?`,
      message: "This permanently deletes the server, its channels and its messages.",
      confirmLabel: "Delete server",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/servers/${server.id}`);
      removeServer(server.id);
      toast.success(`Deleted ${server.name}`);
      if (isViewingServer(server)) navigate("/explore");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete server"));
    }
  };

  const openServerSettings = (server: Server) => {
    setMenu(null);
    setSettingsServer(server);
  };

  const onServerSaved = (updated: Server) => {
    setServers((prev) => prev.map((s) => (s.id === updated.id ? { ...s, ...updated } : s)));
    setSettingsServer((prev) => (prev ? { ...prev, ...updated } : prev));
  };

  const handleMarkRead = (server: Server) => {
    markRead(server.id);
    setMenu(null);
    toast.success(`Marked ${server.name} as read`);
  };

  const handleToggleMute = (server: Server) => {
    const wasMuted = isMuted(server.id);
    toggleMute(server.id);
    setMenu(null);
    toast.success(wasMuted ? `Unmuted ${server.name}` : `Muted ${server.name}`);
  };

  return (
    <div className="glass relative layer-popup flex w-[72px] flex-col items-center gap-2 border-r py-3">
      <BouncyButton
        onClick={() => {
          // Clicking Home while already on Home reloads the feed instead of
          // doing nothing.
          if (location.pathname === "/" || location.pathname === "/feed") {
            window.location.reload();
          } else {
            navigate("/feed");
          }
        }}
        className="glass-card glass-card-hover group flex h-12 w-12 items-center justify-center rounded-2xl text-gray-400 transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/15 hover:text-accent-200"
        tooltip="Home"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      </BouncyButton>

      <BouncyButton
        onClick={() => navigate("/dms")}
        className="glass-card glass-card-hover group flex h-12 w-12 items-center justify-center rounded-2xl text-gray-400 transition-all duration-200 ease-out hover:rounded-xl hover:bg-green-500/15 hover:text-green-300"
        tooltip="Messages"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
        </svg>
      </BouncyButton>

      <BouncyButton
        onClick={() => navigate("/friends")}
        className="glass-card glass-card-hover group flex h-12 w-12 items-center justify-center rounded-2xl text-gray-400 transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/15 hover:text-accent-200"
        tooltip="Friends"
      >
        <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      </BouncyButton>

      <BouncyButton
        onClick={() => navigate("/explore")}
        className="glass-card glass-card-hover group flex h-12 w-12 items-center justify-center rounded-2xl text-gray-400 transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/15 hover:text-accent-200"
        tooltip="Explore"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </BouncyButton>

      <div className="mx-2 h-0.5 w-8 rounded-full bg-white/10" />

      {servers.map((server) => (
        <BouncyButton
          key={server.id}
          onClick={() => openChannel(server)}
          onContextMenu={(event) => openMenu(event, server)}
          className="glass-card glass-card-hover group relative flex h-12 w-12 items-center justify-center rounded-2xl text-white transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/20"
          tooltip={server.name}
        >
          {server.icon ? (
            <img src={server.icon} alt={server.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            <span className="text-lg font-bold">{server.name?.[0]?.toUpperCase() ?? "?"}</span>
          )}
          {isMuted(server.id) && (
            <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-900 text-gray-400 ring-1 ring-gray-700">
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
            </span>
          )}
        </BouncyButton>
      ))}

      <BouncyButton
        onClick={() => setShowJoinModal(true)}
        className="glass-card glass-card-hover flex h-12 w-12 items-center justify-center rounded-2xl text-accent-300 transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/15 hover:text-white"
        tooltip="Join a Server"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </BouncyButton>

      <BouncyButton
        onClick={() => setShowCreateModal(true)}
        className="glass-card glass-card-hover flex h-12 w-12 items-center justify-center rounded-2xl text-green-400 transition-all duration-200 ease-out hover:rounded-xl hover:bg-green-500/15 hover:text-green-300"
        tooltip="Create Server"
      >
        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14m-7-7h14" />
        </svg>
      </BouncyButton>

      <div className="mt-auto" />

      <BouncyButton
        onClick={() => navigate(`/profile/${user?.id}`)}
        className="glass-card glass-card-hover flex h-12 w-12 items-center justify-center rounded-2xl text-white transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/20"
        tooltip="Profile"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt="Profile" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <span className="text-lg font-bold">{user?.username?.[0]?.toUpperCase() ?? "?"}</span>
        )}
      </BouncyButton>

      {showCreateModal &&
        createPortal(
          <div className="anim-fade-in fixed inset-0 layer-overlay flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm">
            <div className="anim-pop-in glass-panel w-full max-w-md rounded-2xl bg-gray-900/95 p-6">
              <h3 className="mb-4 text-lg font-bold tracking-tight text-white">Create Server</h3>
              <input
                type="text"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                placeholder="Server name"
                className="field mb-4"
                onKeyDown={(e) => e.key === "Enter" && createServer()}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button onClick={createServer} disabled={busyCreate} className="btn-primary px-4 py-2 text-sm">
                  {busyCreate ? "Creating..." : "Create"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showJoinModal &&
        createPortal(
          <div className="anim-fade-in fixed inset-0 layer-overlay flex items-center justify-center bg-gray-950/70 p-4 backdrop-blur-sm">
            <div className="anim-pop-in glass-panel w-full max-w-md rounded-2xl bg-gray-900/95 p-6">
              <h3 className="mb-1 text-lg font-bold tracking-tight text-white">Join a Server</h3>
              <p className="mb-4 text-sm text-gray-400">Enter an invite code to join.</p>
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="Invite code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="field mb-4"
                onKeyDown={(e) => e.key === "Enter" && joinServer()}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowJoinModal(false)}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button onClick={joinServer} disabled={busyJoin} className="btn-primary px-4 py-2 text-sm">
                  {busyJoin ? "Joining..." : "Join"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {menu &&
        createPortal(
          <div
            className="layer-popup fixed inset-0"
            onMouseDown={() => setMenu(null)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu(null);
            }}
          >
            <div
              className="glass-panel anim-pop-in fixed w-52 rounded-xl border border-gray-700/60 p-1.5 shadow-elev2"
              style={{ left: menu.x, top: menu.y }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <p className="truncate px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {menu.server.name}
              </p>

              <button
                type="button"
                onClick={() => handleMarkRead(menu.server)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Mark as read
              </button>

              <button
                type="button"
                onClick={() => handleToggleMute(menu.server)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
                {isMuted(menu.server.id) ? "Unmute server" : "Mute server"}
              </button>

              <div className="my-1 h-px bg-gray-700/50" />

              {menu.server.ownerId === user?.id ? (
                <>
                  <button
                    type="button"
                    onClick={() => openServerSettings(menu.server)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.49 1a7.3 7.3 0 00-1.69-.98l-.38-2.65A.49.49 0 0014 2h-4a.49.49 0 00-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1a.49.49 0 00-.61.22l-2 3.46a.49.49 0 00.12.64l2.11 1.65c-.04.32-.08.66-.08.98s.03.66.07.98l-2.11 1.65a.5.5 0 00-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.49.42h4c.24 0 .45-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46a.5.5 0 00-.12-.64l-2.11-1.65zM12 15.5A3.5 3.5 0 1115.5 12 3.5 3.5 0 0112 15.5z" />
                    </svg>
                    Server settings
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteServer(menu.server)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 7h12l-1 13a1 1 0 01-1 1H8a1 1 0 01-1-1L6 7zm3-3h6l1 2h4v2H4V6h4l1-2z" />
                    </svg>
                    Delete server
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void leaveServer(menu.server)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4M21 12H9M13 4H6a2 2 0 00-2 2v12a2 2 0 002 2h7" />
                  </svg>
                  Leave server
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}

      {settingsServer && (
        <ServerSettingsModal
          server={settingsServer}
          myRole={settingsServer.ownerId === user?.id ? "owner" : "member"}
          onClose={() => setSettingsServer(null)}
          onOpenInvites={() => {
            setInviteServer(settingsServer);
            setSettingsServer(null);
          }}
          onSaved={onServerSaved}
        />
      )}

      {inviteServer && (
        <InviteModal
          serverId={inviteServer.id}
          permanentCode={inviteServer.inviteCode}
          channels={inviteServer.channels ?? []}
          onClose={() => setInviteServer(null)}
        />
      )}
    </div>
  );
}