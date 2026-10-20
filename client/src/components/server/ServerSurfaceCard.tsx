import { useState } from "react";
import Media from "@/components/Media";
import { useToast } from "@/stores/toastStore";
import type { Server } from "@/types";

/** The absolute link a copied invite resolves to. */
const inviteUrl = (code: string) => `${window.location.origin}/invite/${code}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access is denied in some contexts (insecure origin, older
    // browsers); the code can still be selected by hand.
    return false;
  }
}

/**
 * The banner/logo/name/invite/Open header of the server rail's right-click
 * surface, mirroring the invite card that appears when an invite link is pasted
 * into a chat.
 *
 * The rail only lists servers the viewer has already joined, so the primary
 * action is "Open" rather than "Join"; the invite link is offered so anyone can
 * be invited from the same panel.
 */
export default function ServerSurfaceCard({
  server,
  onOpen,
}: {
  server: Server;
  onOpen: () => void;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const members = server._count?.members ?? server.members?.length ?? 0;

  const copyInvite = async () => {
    const ok = await copy(inviteUrl(server.inviteCode));
    if (ok) {
      setCopied(true);
      toast.success("Invite link copied");
      window.setTimeout(() => setCopied(false), 1500);
    } else {
      toast.info(`Copy failed — the code is ${server.inviteCode}`);
    }
  };

  return (
    <div className="w-full">
      <div className="relative">
        <div className="h-16 w-full overflow-hidden bg-gradient-to-br from-accent-600/60 via-accent-500/30 to-accent-400/10">
          {server.banner && (
            <Media src={server.banner} alt="" width={480} className="h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-900/90 via-gray-900/20 to-transparent" />
        </div>
        <div className="absolute -bottom-4 left-3">
          {server.icon ? (
            <Media
              src={server.icon}
              alt={server.name}
              width={96}
              className="h-11 w-11 rounded-full border-2 border-gray-900 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-gray-900 bg-gradient-to-br from-accent-500 to-accent-700 text-base font-bold text-white">
              {server.name?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
        </div>
      </div>

      <div className="px-3 pt-6">
        <p className="truncate font-semibold text-white">{server.name}</p>
        <p className="text-xs text-gray-500">
          {members} member{members === 1 ? "" : "s"}
        </p>
        {server.description && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-gray-400">{server.description}</p>
        )}
      </div>

      <div className="mx-3 mt-3 flex items-center gap-1.5 rounded-lg border border-gray-700/60 bg-gray-950/40 px-2 py-1.5">
        <code className="tabular min-w-0 flex-1 truncate font-mono text-xs text-emerald-300">
          /invite/{server.inviteCode}
        </code>
        <button
          type="button"
          onClick={() => void copyInvite()}
          aria-label="Copy invite link"
          title="Copy invite link"
          className="icon-btn h-6 w-6 shrink-0"
        >
          {copied ? (
            <svg className="h-4 w-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V5a2 2 0 012-2h9a2 2 0 012 2v9a2 2 0 01-2 2h-2M5 8h9a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"
              />
            </svg>
          )}
        </button>
      </div>

      <div className="p-3">
        <button type="button" onClick={onOpen} className="btn-primary w-full py-1.5 text-sm">
          Open
        </button>
      </div>
    </div>
  );
}
