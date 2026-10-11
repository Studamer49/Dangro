import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/Modal";
import RoleEditor from "@/components/server/RoleEditor";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useAuthStore } from "@/stores/authStore";
import type { Member, Role, Server, ServerRole } from "@/types";

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
      className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white/90"
      style={{ backgroundColor: color ?? "#4b5563" }}
    >
      {name}
    </span>
  );
}

export default function ServerSettingsModal({ server, myRole, onClose, onOpenInvites, onSaved }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>("overview");
  const [name, setName] = useState(server.name);
  const [description, setDescription] = useState(server.description ?? "");
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmText, setConfirmText] = useState("");

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

  // The member list is needed on the Roles tab too: it is what establishes the
  // viewer's own position in the hierarchy.
  useEffect(() => {
    if (tab === "members" || tab === "roles") void loadMembers();
  }, [tab, loadMembers]);

  useEffect(() => {
    if (tab === "roles" || tab === "members") void loadRoles();
  }, [tab, loadRoles]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch(`/servers/${server.id}`, { name, description });
      onSaved(data.server);
      toast.success("Server updated");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not save changes"));
    } finally {
      setBusy(false);
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
    if (!confirm(`Transfer ownership to ${member.user?.username}? You will become an admin.`)) return;
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
      <div className="mb-5 flex gap-1 border-b border-gray-800">
        {TABS.filter((t) => t.id !== "danger" || isOwner).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-accent-500 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          {isOwner ? (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                  Server name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-accent-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase text-gray-500">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="What is this server about?"
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
                />
              </div>
              <button
                onClick={saveProfile}
                disabled={busy || !name.trim()}
                className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              Only the server owner can change the name and description.
            </p>
          )}

          {(myRole === "owner" || myRole === "admin") && (
            <div className="rounded-lg border border-gray-800 p-3">
              <h4 className="text-sm font-semibold text-white">Invites</h4>
              <p className="mb-3 mt-1 text-xs text-gray-500">
                Create expiring or use-limited invite links and revoke the ones you have shared.
              </p>
              <button
                onClick={onOpenInvites}
                className="rounded-lg bg-gray-800 px-3 py-2 text-sm text-gray-200 hover:bg-gray-700"
              >
                Manage invites
              </button>
            </div>
          )}

          {!isOwner && (
            <div className="rounded-lg border border-gray-800 p-3">
              <h4 className="text-sm font-semibold text-white">Leave server</h4>
              <p className="mb-3 mt-1 text-xs text-gray-500">
                You will need a new invite to come back.
              </p>
              <button
                onClick={leaveServer}
                disabled={busy}
                className="rounded-lg bg-red-600/20 px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-600/30 disabled:opacity-50"
              >
                {busy ? "Leaving…" : "Leave server"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "members" && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {members.length} member{members.length === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => void loadMembers()}
              className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
            >
              Refresh
            </button>
          </div>

          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {members.map((member) => {
              const isTargetOwner = member.isOwner || member.userId === server.ownerId;
              const targetPosition = isTargetOwner
                ? Number.MAX_SAFE_INTEGER
                : member.position ?? 0;
              // Same rule as the server: only act on someone strictly below you.
              const canAct = canManageRoles && myPosition > targetPosition;
              const held = new Set(member.roleIds ?? []);

              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">
                      {member.nickname || member.user?.username || "Unknown"}
                      {member.userId === currentUser?.id && (
                        <span className="ml-2 text-xs text-gray-500">(you)</span>
                      )}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-1">
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
                              className={`rounded px-2 py-1 text-xs transition-colors ${
                                on
                                  ? "bg-accent-600 text-white"
                                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
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
                      className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                      title="Transfer ownership to this member"
                    >
                      Transfer
                    </button>
                  )}

                  {canAct && (
                    <button
                      onClick={() => kick(member)}
                      className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30"
                    >
                      Kick
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
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
        <div className="space-y-3">
          <div className="rounded-lg border border-red-600/40 bg-red-600/10 p-3">
            <h4 className="text-sm font-semibold text-red-300">Delete this server</h4>
            <p className="mb-3 mt-1 text-xs text-gray-400">
              Removes every channel, message and member. This cannot be undone. Type{" "}
              <span className="font-mono text-white">{server.name}</span> to confirm.
            </p>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={server.name}
              className="mb-3 w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-500 focus:outline-none"
            />
            <button
              onClick={deleteServer}
              disabled={busy || confirmText !== server.name}
              className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? "Deleting…" : "Delete server"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
