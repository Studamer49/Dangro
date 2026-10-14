import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/Modal";
import RoleEditor from "@/components/server/RoleEditor";
import api, { apiErrorMessage } from "@/lib/api";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { useToast } from "@/stores/toastStore";
import { useAuthStore } from "@/stores/authStore";
import { useConfirm } from "@/hooks/useConfirm";
import type { Ban, Member, Role, Server, ServerRole } from "@/types";

interface Props {
  server: Server;
  myRole: Role | null;
  onClose: () => void;
  onOpenInvites: () => void;
  onSaved: (server: Server) => void;
}

type Tab = "overview" | "members" | "roles" | "danger";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "members", label: "Members" },
  { id: "roles", label: "Roles" },
  { id: "danger", label: "Danger Zone" },
];

/** A small coloured role tag, Discord's member-list chip. */
function RoleChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span
      className="rounded-md bg-gray-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/90 shadow-sm"
      style={{ backgroundColor: color ?? undefined }}
    >
      {name}
    </span>
  );
}

export default function ServerSettingsModal({ server, myRole, onClose, onOpenInvites, onSaved }: Props) {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("overview");
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon);
  const [description, setDescription] = useState(server.description ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [bans, setBans] = useState<Ban[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const iconInputRef = useRef<HTMLInputElement>(null);

  const isOwner = myRole === "owner";

  const [roles, setRoles] = useState<ServerRole[]>(server.roles ?? []);

  /** The viewer's own highest role position, for the hierarchy checks. */
  const myPosition = useMemo(() => {
    if (isOwner) return Number.MAX_SAFE_INTEGER;
    const mine = members.find((m) => m.userId === currentUser?.id);
    return mine?.position ?? 0;
  }, [isOwner, members, currentUser?.id]);

  const canManageRoles = isOwner || roles.some(
    (role) => role.position <= myPosition && role.permissions.includes("MANAGE_ROLES")
  );

  const canBanMembers = isOwner || roles.some(
    (role) => role.position <= myPosition && role.permissions.includes("BAN_MEMBERS")
  );

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${server.id}/members`);
      setMembers(data.members ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load members"));
    }
  }, [server.id, toast]);

  const loadRoles = useCallback(async () => {
    try {
      const { data } = await api.get(`/servers/${server.id}/roles`);
      setRoles(data.roles ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load roles"));
    }
  }, [server.id, toast]);

  const loadBans = useCallback(async () => {
    if (!canBanMembers) return;
    try {
      const { data } = await api.get(`/servers/${server.id}/bans`);
      setBans(data.bans ?? []);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not load bans"));
    }
  }, [server.id, canBanMembers, toast]);

  // The member list is needed on the Roles tab too: it is what establishes the
  // viewer's own position in the hierarchy.
  useEffect(() => {
    if (tab === "members" || tab === "roles") void loadMembers();
  }, [tab, loadMembers]);

  useEffect(() => {
    if (tab === "roles" || tab === "members") void loadRoles();
  }, [tab, loadRoles]);

  useEffect(() => {
    if (tab === "members") void loadBans();
  }, [tab, loadBans]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/servers/${server.id}`, { name, description, icon });
      onSaved(data.server);
      toast.success("Server updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save changes"));
    } finally {
      setBusy(false);
    }
  };

  /** Upload immediately, then persist with the next "Save changes". */
  const onIconPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingIcon(true);
    try {
      const uploaded = await uploadMedia(file);
      setIcon(uploaded.url);
    } catch (err) {
      toast.error(uploadErrorMessage(err, "Could not upload the server icon"));
    } finally {
      setUploadingIcon(false);
    }
  };

  const banMember = async (member: Member) => {
    const ok = await confirm({
      title: `Ban ${member.user?.username ?? "this member"}?`,
      message: "They will be removed and blocked from rejoining until you unban them.",
      confirmLabel: "Ban member",
      tone: "danger",
    });
    if (!ok) return;
    try {
      const { data } = await api.post(`/servers/${server.id}/bans`, { userId: member.userId });
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      if (data.ban) {
        setBans((prev) => [data.ban as Ban, ...prev.filter((b) => b.userId !== member.userId)]);
      }
      toast.success(`Banned ${member.user?.username ?? "member"}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not ban member"));
    }
  };

  const unban = async (ban: Ban) => {
    try {
      await api.delete(`/servers/${server.id}/bans/${ban.userId}`);
      setBans((prev) => prev.filter((b) => b.userId !== ban.userId));
      toast.success(`Unbanned ${ban.user?.username ?? "user"}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not lift the ban"));
    }
  };

  /** Adds or removes one role; a member can hold several at once. */
  const toggleMemberRole = async (member: Member, roleId: string, grant: boolean) => {
    const current = new Set(member.roleIds ?? []);
    if (grant) current.add(roleId);
    else current.delete(roleId);

    const next = [...current];
    setMembers((prev) =>
      prev.map((m) => (m.id === member.id ? { ...m, roleIds: next } : m))
    );
    try {
      await api.put(`/servers/${server.id}/members/${member.id}/roles`, { roleIds: next });
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not change roles"));
      // Re-read so the buttons snap back to what the server actually has.
      void loadMembers();
    }
  };

  const kick = async (member: Member) => {
    try {
      await api.delete(`/servers/${server.id}/members/${member.id}`);
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      toast.success(`Removed ${member.user?.username ?? "member"}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not remove member"));
    }
  };

  const transfer = async (member: Member) => {
    const ok = await confirm({
      title: `Transfer ownership to ${member.user?.username}?`,
      message: "You will become an admin.",
      confirmLabel: "Transfer",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await api.post(`/servers/${server.id}/transfer`, { memberId: member.id });
      toast.success("Ownership transferred");
      onClose();
      navigate("/explore");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not transfer ownership"));
    }
  };

  const leaveServer = async () => {
    setBusy(true);
    try {
      await api.post(`/servers/${server.id}/leave`);
      onClose();
      navigate("/explore");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not leave server"));
    } finally {
      setBusy(false);
    }
  };

  const deleteServer = async () => {
    // Discord asks you to type the server name. It is the last stop before an
    // irreversible delete of every channel and message.
    if (confirmText !== server.name) return;
    setBusy(true);
    try {
      await api.delete(`/servers/${server.id}`);
      onClose();
      navigate("/explore");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete server"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`${server.name} — Settings`} onClose={onClose} maxWidth="max-w-2xl">
      <div className="segment mb-5 w-full">
        {TABS.filter((t) => t.id !== "danger" || isOwner).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            data-active={tab === t.id}
            className={`segment-item flex-1${t.id === "danger" ? " !text-red-400" : ""}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="animate-fade-up space-y-4">
          {isOwner ? (
            <>
              <div className="flex items-center gap-4">
                {icon ? (
                  <img src={icon} alt={server.name} className="h-16 w-16 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-800 text-2xl font-bold text-white">
                    {server.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  <span className="field-label mb-0">Server icon</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => iconInputRef.current?.click()}
                      disabled={uploadingIcon}
                      className="btn-ghost px-3 py-1.5 text-xs"
                    >
                      {uploadingIcon ? "Uploading…" : "Upload image"}
                    </button>
                    {icon && (
                      <button
                        type="button"
                        onClick={() => setIcon(null)}
                        className="btn-ghost px-3 py-1.5 text-xs"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onIconPicked}
                  />
                </div>
              </div>
              <div>
                <label className="field-label" htmlFor="server-name">
                  Server name
                </label>
                <input
                  id="server-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="field"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="server-description">
                  Description
                </label>
                <textarea
                  id="server-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What is this server about?"
                  className="field resize-none"
                />
              </div>
              <button
                onClick={saveProfile}
                disabled={busy || !name.trim()}
                className="btn-primary"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <div className="glass-card rounded-xl px-4 py-3.5">
              <p className="text-sm text-gray-400">
                Only the server owner can change the name and description.
              </p>
            </div>
          )}

          {(myRole === "owner" || myRole === "admin") && (
            <div className="glass-card rounded-xl p-4">
              <h4 className="text-sm font-bold tracking-tight text-white">Invites</h4>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-gray-400">
                Create expiring or use-limited invite links and revoke the ones you have shared.
              </p>
              <button onClick={onOpenInvites} className="btn-ghost">
                Manage invites
              </button>
            </div>
          )}

          {!isOwner && (
            <div className="glass-card rounded-xl border-red-500/25 p-4">
              <h4 className="text-sm font-bold tracking-tight text-white">Leave server</h4>
              <p className="mb-3 mt-1 text-xs leading-relaxed text-gray-400">
                You will need a new invite to come back.
              </p>
              <button onClick={leaveServer} disabled={busy} className="btn-danger">
                {busy ? "Leaving…" : "Leave server"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div className="animate-fade-up">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="eyebrow tabular">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => void loadMembers()}
              className="rounded-lg border border-gray-700/60 bg-gray-800/40 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-all duration-200 hover:bg-gray-800 hover:text-white"
            >
              Refresh
            </button>
          </div>

          <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {members.map((member) => {
              const isTargetOwner = member.isOwner || member.userId === server.ownerId;
              const targetPosition = isTargetOwner
                ? Number.MAX_SAFE_INTEGER
                : member.position ?? 0;
              // Same rule as the server: only act on someone strictly below you.
              const canAct = canManageRoles && myPosition > targetPosition;
              const canBan = canBanMembers && myPosition > targetPosition;
              const held = new Set(member.roleIds ?? []);

              return (
                <li
                  key={member.id}
                  className="glass-card glass-card-hover flex items-center gap-3 rounded-xl px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">
                      {member.nickname || member.user?.username || "Unknown"}
                      {member.userId === currentUser?.id && (
                        <span className="ml-2 text-xs font-normal text-gray-500">(you)</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isTargetOwner ? (
                        <RoleChip name="Owner" color="#f23f43" />
                      ) : (
                        roles
                          .filter((role) => held.has(role.id))
                          .map((role) => (
                            <RoleChip key={role.id} name={role.name} color={role.color} />
                          ))
                      )}
                    </div>
                  </div>

                  {canAct ? (
                    <div className="flex flex-wrap justify-end gap-1">
                      {roles
                        .filter((role) => !role.isEveryone && role.position <= myPosition)
                        .map((role) => {
                          const on = held.has(role.id);
                          return (
                            <button
                              key={role.id}
                              onClick={() => toggleMemberRole(member, role.id, !on)}
                              aria-pressed={on}
                              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all duration-200 ${
                                on
                                  ? "row-active"
                                  : "border border-gray-700/60 bg-gray-800/40 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                              }`}
                            >
                              {role.name}
                            </button>
                          );
                        })}
                    </div>
                  ) : (
                    <span className="shrink-0 text-xs text-gray-600">
                      {isTargetOwner ? "owner" : "—"}
                    </span>
                  )}

                  {isOwner && !isTargetOwner && (
                    <button
                      onClick={() => transfer(member)}
                      className="shrink-0 rounded-lg border border-gray-700/60 bg-gray-800/40 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-all duration-200 hover:bg-gray-800 hover:text-white"
                      title="Transfer ownership to this member"
                    >
                      Transfer
                    </button>
                  )}

                  {canAct && (
                    <button
                      onClick={() => kick(member)}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-600/30 hover:text-red-300"
                    >
                      Kick
                    </button>
                  )}

                  {canBan && (
                    <button
                      onClick={() => banMember(member)}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-600/30 hover:text-red-300"
                    >
                      Ban
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {canBanMembers && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="eyebrow tabular">Banned · {bans.length}</p>
              </div>
              {bans.length === 0 ? (
                <p className="text-xs text-gray-500">No one is banned from this server.</p>
              ) : (
                <ul className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                  {bans.map((ban) => (
                    <li
                      key={ban.id}
                      className="glass-card flex items-center gap-3 rounded-xl px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-white">
                          {ban.user?.username ?? ban.userId}
                        </p>
                        {ban.reason && (
                          <p className="truncate text-xs text-gray-500">{ban.reason}</p>
                        )}
                      </div>
                      <button
                        onClick={() => unban(ban)}
                        className="shrink-0 rounded-lg border border-gray-700/60 bg-gray-800/40 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-all duration-200 hover:bg-gray-800 hover:text-white"
                      >
                        Unban
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "roles" && (
        <RoleEditor
          serverId={server.id}
          roles={roles}
          myPosition={myPosition}
          isOwner={isOwner}
          onClose={onClose}
          onRolesChanged={setRoles}
        />
      )}

      {tab === "danger" && isOwner && (
        <div className="animate-fade-up space-y-3">
          <div className="rounded-xl border border-red-500/30 bg-red-600/[0.07] p-4 shadow-[0_0_40px_-18px_rgb(239_68_68/0.6)]">
            <h4 className="flex items-center gap-2 text-sm font-bold tracking-tight text-red-300">
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                />
              </svg>
              Delete this server
            </h4>
            <p className="mb-3 mt-1.5 text-xs leading-relaxed text-gray-400">
              Removes every channel, message and member. This cannot be undone. Type{" "}
              <span className="font-semibold text-white">{server.name}</span> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={server.name}
              className="field mb-3 focus:border-red-400 focus:shadow-[inset_0_1px_2px_rgb(0_0_0/0.25),0_0_0_4px_rgb(239_68_68/0.18)]"
            />
            <button
              onClick={deleteServer}
              disabled={busy || confirmText !== server.name}
              className="w-full rounded-xl bg-red-600 px-3 py-2.5 text-sm font-semibold text-white transition-all duration-200 shadow-[0_8px_22px_-8px_rgb(239_68_68/0.7)] hover:bg-red-500 hover:shadow-[0_12px_30px_-8px_rgb(239_68_68/0.85)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {busy ? "Deleting…" : "Delete server"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
