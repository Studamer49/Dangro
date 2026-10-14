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
        <button onClick={onClose} className="btn-ghost">
          Done
        </button>
      }
    >
      <div className="mb-5">
        <label className="field-label">Permanent invite link</label>
        <div className="flex items-center gap-2">
          <code className="tabular min-w-0 flex-1 select-all truncate rounded-xl border border-gray-700/70 bg-gray-950/50 px-3.5 py-2.5 font-mono text-sm tracking-tight text-emerald-300 shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]">
            {inviteUrl(permanentCode)}
          </code>
          <button
            onClick={() => copyLink(permanentCode)}
            title="Copy permanent invite link"
            aria-label="Copy permanent invite link"
            className="icon-btn border border-gray-700/60 bg-gray-800/40"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
              />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-gray-500">
          Always valid. Use a managed invite below when you want it to expire.
        </p>
      </div>

      <div className="glass-card mb-5 rounded-xl p-4">
        <h4 className="mb-3 text-sm font-bold tracking-tight text-white">Create a managed invite</h4>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="invite-max-age">
              Expires after
            </label>
            <select
              id="invite-max-age"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value as MaxAge)}
              className="field"
            >
              {(Object.keys(MAX_AGE_LABEL) as MaxAge[]).map((value) => (
                <option key={value} value={value}>
                  {MAX_AGE_LABEL[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="invite-max-uses">
              Max uses (optional)
            </label>
            <input
              id="invite-max-uses"
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              placeholder="Unlimited"
              className="field tabular"
            />
          </div>
        </div>

        <label className="field-label" htmlFor="invite-channel">
          Send people to
        </label>
        <select
          id="invite-channel"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          className="field mb-3"
        >
          <option value="">First channel</option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              #{channel.name}
            </option>
          ))}
        </select>

        <button onClick={createInvite} disabled={busy} className="btn-primary w-full">
          {busy ? "Creating..." : "Create invite & copy link"}
        </button>
      </div>

      <div>
        <h4 className="eyebrow mb-2">
          Active invites
          {invites.length > 0 && (
            <span className="tabular ml-1.5 text-gray-500">({invites.length})</span>
          )}
        </h4>

        {loading ? (
          <div className="space-y-2" aria-hidden>
            <div className="skeleton h-14 rounded-xl" />
            <div className="skeleton h-14 rounded-xl" />
          </div>
        ) : invites.length === 0 ? (
          <p className="glass-card rounded-xl px-4 py-3 text-sm text-gray-500">
            No managed invites. The permanent link above always works.
          </p>
        ) : (
          <ul className="space-y-2">
            {invites.map((invite) => {
              const dead = invite.expired || invite.exhausted;
              return (
                <li
                  key={invite.id}
                  className={`glass-card glass-card-hover flex items-center gap-2 rounded-xl px-3 py-2.5 ${
                    dead ? "opacity-55" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <code
                      className={`tabular block select-all truncate font-mono text-sm tracking-tight ${
                        dead ? "text-gray-600 line-through" : "text-emerald-300"
                      }`}
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
                    title="Copy invite link"
                    aria-label={`Copy invite link for code ${invite.code}`}
                    className="icon-btn disabled:opacity-40"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => revoke(invite.code)}
                    disabled={busy}
                    title="Revoke invite"
                    aria-label={`Revoke invite with code ${invite.code}`}
                    className="shrink-0 rounded-lg border border-red-500/30 bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-600/30 hover:text-red-300 disabled:opacity-40"
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
