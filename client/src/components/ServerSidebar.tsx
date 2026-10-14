import { useCallback, useEffect, useState, type ButtonHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useBounce, type BounceVariant } from "@/hooks/useBounce";
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
          className="glass-card glass-card-hover group relative flex h-12 w-12 items-center justify-center rounded-2xl text-white transition-all duration-200 ease-out hover:rounded-xl hover:bg-accent-500/20"
          tooltip={server.name}
        >
          {server.icon ? (
            <img src={server.icon} alt={server.name} className="h-full w-full rounded-xl object-cover" />
          ) : (
            <span className="text-lg font-bold">{server.name?.[0]?.toUpperCase() ?? "?"}</span>
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
    </div>
  );
}