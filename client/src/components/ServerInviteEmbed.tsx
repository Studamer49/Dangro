import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import Media from "@/components/Media";
import { useToast } from "@/stores/toastStore";
import type { User } from "@/types";

interface InvitePreview {
  code: string;
  server: {
    id: string;
    name: string;
    icon: string | null;
    banner?: string | null;
    description?: string | null;
    _count?: { members: number };
  };
  channel: { id: string; name: string } | null;
  inviter: Partial<User> | null;
}

/**
 * A server invite link pasted into a message, rendered as a joinable card.
 *
 * The raw URL stays in the text above it; this is a convenience on top, so a
 * preview that fails to load (deleted server, dead code) simply renders
 * nothing rather than an error box in the middle of a conversation.
 */
export default function ServerInviteEmbed({ code }: { code: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [failed, setFailed] = useState(false);
  const [joining, setJoining] = useState(false);
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/invites/${encodeURIComponent(code)}`)
      .then(({ data }) => {
        if (!cancelled) setPreview(data.invite as InvitePreview);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const join = useCallback(async () => {
    setJoining(true);
    try {
      const { data } = await api.post(`/servers/join/${encodeURIComponent(code)}`);
      const server = data.server as { name: string; channels?: Array<{ id: string; type: string }> };
      const target =
        (data.channelId ? server.channels?.find((c) => c.id === data.channelId) : undefined) ??
        server.channels?.find((c) => c.type === "text") ??
        server.channels?.[0];
      toastRef.current.success(data.joined === false ? `Welcome back to ${server.name}` : `Joined ${server.name}`);
      if (target) navigate(`/channels/${target.id}`);
    } catch (err) {
      toastRef.current.error(apiErrorMessage(err, "Could not join the server"));
    } finally {
      setJoining(false);
    }
  }, [code, navigate]);

  if (failed || !preview) return null;

  const { server } = preview;
  const members = server._count?.members ?? 0;

  return (
    <div className="mt-2 max-w-sm overflow-hidden rounded-xl border border-gray-700/70 bg-gray-900/70">
      <div className="relative">
        <div className="h-20 w-full bg-gradient-to-br from-accent-600/60 via-accent-500/30 to-accent-400/10">
          {server.banner && (
            <Media src={server.banner} alt="" width={480} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent" />
        </div>
        <div className="absolute -bottom-5 left-3">
          {server.icon ? (
            <Media
              src={server.icon}
              alt={server.name}
              width={96}
              className="h-12 w-12 rounded-full border-2 border-gray-900 object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-gray-900 bg-gradient-to-br from-accent-500 to-accent-700 text-lg font-bold text-white">
              {server.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pb-3 pt-7">
        <p className="truncate font-semibold text-white">{server.name}</p>
        <p className="text-xs text-gray-400">
          {members} member{members === 1 ? "" : "s"}
          {preview.channel ? ` · join #${preview.channel.name}` : ""}
        </p>
        {server.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-400">{server.description}</p>
        )}
        <button onClick={() => void join()} disabled={joining} className="btn-primary mt-3 w-full py-1.5 text-sm">
          {joining ? "Joining…" : "Join server"}
        </button>
      </div>
    </div>
  );
}
