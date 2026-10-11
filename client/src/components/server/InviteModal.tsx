import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import type { Invite } from "@/types";

interface Props {
  serverId: string;
  /** The server's permanent code, shown as the always-valid invite. */
  permanentCode: string;
  channels: Array<{ id: string; name: string; type: string }>;
  onClose: () => void;
}

type MaxAge = "1h" | "24h" | "7d" | "never";

const MAX_AGE_LABEL: Record<MaxAge, string> = {
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
  never: "Never",
};

/** Renders the absolute link that gets copied. */
const inviteUrl = (code: string) => `${window.location.origin}/invite/${code}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard access is denied in some contexts (insecure origin, older
    // browsers). Selecting the code manually is the fallback.
    return false;
  }
}

/** Human-readable expiry, e.g. "expires in 6 days". */
function describeExpiry(invite: Invite): string {
  if (invite.expired) return "expired";
  if (!invite.expiresAt) return "never expires";
  const remaining = new Date(invite.expiresAt).getTime() - Date.now();
  if (remaining <= 0) return "expired";
  const hours = Math.round(remaining / 3_600_000);
  if (hours < 1) return "expires in under an hour";
  if (hours < 48) return `expires in ${hours} hours`;
  return `expires in ${Math.round(hours / 24)} days`;
}

export default function InviteModal({ serverId, permanentCode, channels, onClose }: Props) {
  const toast = useToast();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [maxAge, setMaxAge] = useState<MaxAge>("24h");
  const [maxUses, setMaxUses] = useState("");
  const [channelId, setChannelId] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${serverId}/invites`);
      setInvites(data.invites ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load invites"));
    } finally {
      setLoading(false);
    }
    // `toast` is memoised on the store's push, so it is stable across renders.
  }, [serverId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const copyLink = async (code: string) => {
    const ok = await copy(inviteUrl(code));
    if (ok) toast.success("Invite link copied");
    else toast.info(`Copy failed — the code is ${code}`);
  };

  const createInvite = async () => {
    setBusy(true);
    try {
      const parsedUses = maxUses.trim() === "" ? null : Number(maxUses);
      const { data } = await api.post(`/servers/${serverId}/invites`, {
        maxAge,
        maxUses: Number.isFinite(parsedUses) && parsedUses !== null ? parsedUses : null,
        channelId: channelId || null,
      });
      setInvites((prev) => [data.invite, ...prev]);
      await copyLink(data.invite.code);
      setMaxUses("");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not create invite"));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (code: string) => {
    setBusy(true);
    try {
      await api.delete(`/servers/${serverId}/invites/${code}`);
      setInvites((prev) => prev.filter((i) => i.code !== code));
      toast.success("Invite revoked");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not revoke invite"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Invite People"
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <button
          onClick={onClose}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          Done
        </button>
      }
    >
      <div className="mb-5">
        <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
          Permanent invite link
        </label>
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-lg bg-gray-800 px-3 py-2 text-sm text-green-300">
            {inviteUrl(permanentCode)}
          </code>
          <button
            onClick={() => copyLink(permanentCode)}
            className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
          >
            Copy
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Always valid. Use a managed invite below when you want it to expire.
        </p>
      </div>

      <div className="mb-5 rounded-lg border border-gray-800 p-3">
        <h4 className="mb-3 text-sm font-semibold text-white">Create a managed invite</h4>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Expires after</label>
            <select
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value as MaxAge)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
            >
              {(Object.keys(MAX_AGE_LABEL) as MaxAge[]).map((value) => (
                <option key={value} value={value}>
                  {MAX_AGE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Max uses (optional)</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            />
          </div>
        </div>

        <label className="mb-1 block text-xs text-gray-500">Send people to</label>
        <select
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white focus:border-accent-500 focus:outline-none"
        >
          <option value="">First channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>

        <button
          onClick={createInvite}
          disabled={busy}
          className="w-full rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
        >
          {busy ? "Creating..." : "Create invite & copy link"}
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-white">
          Active invites {invites.length > 0 && <span className="text-gray-500">({invites.length})</span>}
        </h4>

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : invites.length === 0 ? (
          <p className="text-sm text-gray-500">
            No managed invites. The permanent link above always works.
          </p>
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => {
              const dead = invite.expired || invite.exhausted;
              return (
                <li
                  key={invite.id}
                  className="flex items-center gap-2 rounded-lg border border-gray-800 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <code
                      className={`block truncate text-sm ${dead ? "text-gray-600 line-through" : "text-green-300"}`}
                    >
                      {invite.code}
                    </code>
                    <p className="truncate text-xs text-gray-500">
                      {dead
                        ? invite.expired
                          ? "expired"
                          : "used up"
                        : `${describeExpiry(invite)} · ${
                            invite.maxUses
                              ? `${invite.uses}/${invite.maxUses} uses`
                              : `${invite.uses} use${invite.uses === 1 ? "" : "s"}`
                          }`}
                      {invite.channel ? ` · #${invite.channel.name}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => copyLink(invite.code)}
                    disabled={dead}
                    className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                  >
                    Copy
                  </button>
                  <button
                    onClick={() => revoke(invite.code)}
                    disabled={busy}
                    className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30 disabled:opacity-40"
                  >
                    Revoke
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
