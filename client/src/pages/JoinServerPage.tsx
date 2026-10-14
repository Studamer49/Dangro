import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import type { User } from "@/types";

interface InvitePreview {
  code: string;
  server: {
    id: string;
    name: string;
    icon: string | null;
    description?: string | null;
    _count?: { members: number };
  };
  channel: { id: string; name: string } | null;
  inviter: Partial<User> | null;
  expiresAt: string | null;
  uses: number;
  maxUses: number | null;
}

type State =
  | { status: "loading" }
  | { status: "ready"; invite: InvitePreview }
  | { status: "error"; message: string };

/**
 * Invite landing page.
 *
 * Used to join silently on mount, which meant a preview link in chat could
 * quietly drop you into a server. Discord shows what you are joining and who
 * invited you, and waits for a click.
 */
export default function JoinServerPage() {
  const { inviteCode } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [state, setState] = useState<State>({ status: "loading" });
  const [joining, setJoining] = useState(false);
  /**
   * Which code has already been previewed. This has to remember the code, not
   * just "have we run": a plain boolean stays true after the first mount, so
   * navigating from one invite link to another left the previous server's
   * preview on screen and the Join button joined the wrong server.
   */
  const previewedCode = useRef<string | null>(null);

  // useToast() is memoised on the store's push, but reading it through a ref
  // keeps the effect below immune to that identity changing.
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const preview = useCallback(async () => {
    if (!inviteCode) return;
    setState({ status: "loading" });
    try {
      // Preview is public: you need to see what you are joining before you
      // have any membership at all.
      const { data } = await api.get(`/invites/${inviteCode}`);
      setState({ status: "ready", invite: data.invite });
    } catch (err: unknown) {
      setState({ status: "error", message: apiErrorMessage(err, "Invite not found") });
    }
  }, [inviteCode]);

  useEffect(() => {
    if (!inviteCode || previewedCode.current === inviteCode) return;
    previewedCode.current = inviteCode;
    void preview();
  }, [inviteCode, preview]);

  const join = async () => {
    if (!inviteCode) return;
    setJoining(true);
    try {
      const { data } = await api.post(`/servers/join/${encodeURIComponent(inviteCode)}`);
      const server = data.server;
      // An invite bound to a channel lands there; otherwise the first one.
      const target =
        (data.channelId ? server.channels?.find((c: { id: string }) => c.id === data.channelId) : undefined) ??
        server.channels?.find((c: { type: string }) => c.type === "text") ??
        server.channels?.[0];

      toastRef.current.success(`Joined ${server.name}`);
      navigate(target ? `/channels/${target.id}` : "/explore", { replace: true });
    } catch (err: unknown) {
      setState({ status: "error", message: apiErrorMessage(err, "Could not join") });
    } finally {
      setJoining(false);
    }
  };

  const invite = state.status === "ready" ? state.invite : null;
  const initial = invite?.server.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="glass-panel w-full max-w-md rounded-2xl p-8 animate-pop-in">
        {state.status === "loading" && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent-400 border-t-transparent shadow-glow" />
            <p className="text-sm text-gray-400">Checking the invite…</p>
          </div>
        )}

        {state.status === "error" && (
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight text-white">Invite unavailable</h1>
            <p className="mt-2 text-sm text-gray-400">{state.message}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button onClick={() => void preview()} className="btn-ghost">
                Try again
              </button>
              <button onClick={() => navigate("/explore")} className="btn-primary">
                Browse servers
              </button>
            </div>
          </div>
        )}

        {invite && (
          <div>
            <p className="eyebrow text-center">You have been invited to join</p>

            <div className="mt-6 flex flex-col items-center text-center">
              {invite.server.icon ? (
                <img
                  src={invite.server.icon}
                  alt={invite.server.name}
                  className="ring-lit mb-4 h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-accent-700 text-3xl font-bold text-white shadow-glow">
                  {initial}
                </div>
              )}

              <h1 className="text-2xl font-bold tracking-tight text-white">{invite.server.name}</h1>

              {invite.server.description && (
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-400">
                  {invite.server.description}
                </p>
              )}

              <p className="mt-3 text-xs tabular text-gray-500">
                {invite.server._count?.members ?? 0} member
                {(invite.server._count?.members ?? 0) === 1 ? "" : "s"}
                {invite.channel ? ` · you will join #${invite.channel.name}` : ""}
              </p>

              {invite.inviter?.username && (
                <p className="mt-1.5 text-xs text-gray-500">
                  Invited by{" "}
                  <span className="font-semibold text-gray-300">@{invite.inviter.username}</span>
                </p>
              )}

              {invite.maxUses !== null && (
                <p className="mt-1.5 text-xs tabular text-gray-600">
                  {invite.uses} of {invite.maxUses} uses
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => navigate("/explore")} className="btn-ghost flex-1">
                Cancel
              </button>
              <button onClick={join} disabled={joining} className="btn-primary flex-1">
                {joining ? "Joining…" : "Join"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
