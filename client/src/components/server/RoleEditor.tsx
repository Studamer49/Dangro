import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import type { PermissionGroup, ServerRole } from "@/types";

interface Props {
  serverId: string;
  roles: ServerRole[];
  /** The viewer's own highest role position; nothing above it is editable. */
  myPosition: number;
  isOwner: boolean;
  onClose: () => void;
  onRolesChanged: (roles: ServerRole[]) => void;
}

const PRESET_COLORS = ["#5865f2", "#3ba55d", "#faa61a", "#ed4245", "#eb459e", "#9b59b6", "#1abc9c"];

/**
 * The Discord "Server Settings → Roles" screen.
 *
 * Each role carries a checklist of permissions. The rules that make this safe
 * are enforced on the server; here they are mirrored so the UI never offers an
 * action that would 403:
 *
 *   - @everyone cannot be renamed, moved, or deleted
 *   - nothing above your own highest role is editable
 *   - an admin cannot mint a role above themselves
 */
export default function RoleEditor({
  serverId,
  roles,
  myPosition,
  isOwner,
  onClose,
  onRolesChanged,
}: Props) {
  const toast = useToast();
  const [catalogue, setCatalogue] = useState<PermissionGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [busy, setBusy] = useState(false);

  // Descending, exactly as the server returns: highest role at the top.
  const ordered = useMemo(() => [...roles].sort((a, b) => b.position - a.position), [roles]);
  const selected = ordered.find((role) => role.id === selectedId) ?? ordered[0] ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get("/permissions");
        setCatalogue(data.groups ?? []);
      } catch (err) {
        toast.error(apiErrorMessage(err, "Could not load permissions"));
      }
    })();
  }, [toast]);

  const canEdit = useCallback(
    (role: ServerRole) => isOwner || role.position <= myPosition,
    [isOwner, myPosition]
  );

  const refresh = useCallback(async () => {
    const { data } = await api.get(`/servers/${serverId}/roles`);
    onRolesChanged(data.roles ?? []);
  }, [serverId, onRolesChanged]);

  const togglePermission = async (permission: string) => {
    if (!selected || !canEdit(selected)) return;

    const next = selected.permissions.includes(permission)
      ? selected.permissions.filter((p) => p !== permission)
      : [...selected.permissions, permission];

    setBusy(true);
    try {
      await api.patch(`/servers/${serverId}/roles/${selected.id}`, { permissions: next });
      onRolesChanged(
        roles.map((role) => (role.id === selected.id ? { ...role, permissions: next } : role))
      );
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update permissions"));
    } finally {
      setBusy(false);
    }
  };

  const rename = async () => {
    if (!selected || !canEdit(selected)) return;
    const name = window.prompt("Role name", selected.name)?.trim();
    if (!name || name === selected.name) return;
    try {
      await api.patch(`/servers/${serverId}/roles/${selected.id}`, { name });
      onRolesChanged(roles.map((role) => (role.id === selected.id ? { ...role, name } : role)));
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not rename role"));
    }
  };

  const remove = async (role: ServerRole) => {
    if (role.isEveryone) return;
    if (!window.confirm(`Delete the role "${role.name}"? Everyone holding it loses those permissions.`)) return;
    try {
      await api.delete(`/servers/${serverId}/roles/${role.id}`);
      await refresh();
      toast.success("Role deleted");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not delete role"));
    }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/servers/${serverId}/roles`, {
        name,
        color: newColor,
        permissions: [],
      });
      await refresh();
      setSelectedId(data.role.id);
      setNewName("");
      setCreating(false);
      toast.success(`Created ${name}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not create role"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Server Roles"
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        <button
          onClick={onClose}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-300 hover:bg-gray-700"
        >
          Done
        </button>
      }
    >
      <div className="flex gap-4">
        {/* Role list */}
        <div className="w-48 shrink-0">
          <ul className="mb-2 max-h-80 space-y-0.5 overflow-y-auto">
            {ordered.map((role) => {
              const locked = !canEdit(role);
              return (
                <li key={role.id}>
                  <button
                    onClick={() => setSelectedId(role.id)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      selected?.id === role.id
                        ? "bg-gray-700 text-white"
                        : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    {role.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: role.color }}
                      />
                    )}
                    <span className="truncate">{role.name}</span>
                    {locked && <span className="ml-auto text-xs text-gray-600">locked</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded border border-dashed border-gray-700 px-2 py-1.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
            >
              + Create role
            </button>
          ) : (
            <div className="rounded-lg border border-gray-700 p-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Role name"
                maxLength={32}
                autoFocus
                className="mb-2 w-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white focus:border-accent-500 focus:outline-none"
              />
              <div className="mb-2 flex flex-wrap gap-1">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    aria-label={color}
                    className={`h-5 w-5 rounded-full ${
                      newColor === color ? "ring-2 ring-white" : ""
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="flex-1 rounded bg-accent-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Permission grid */}
        <div className="min-w-0 flex-1">
          {!selected ? (
            <p className="text-sm text-gray-500">Select a role to see its permissions.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {selected.color && (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: selected.color }}
                    />
                  )}
                  <h4 className="text-sm font-semibold text-white">{selected.name}</h4>
                  <span className="text-xs text-gray-500">
                    {selected.memberCount ?? 0} member{(selected.memberCount ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex gap-2">
                  {canEdit(selected) && !selected.isEveryone && (
                    <>
                      <button
                        onClick={rename}
                        className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => remove(selected)}
                        className="rounded bg-red-600/20 px-2 py-1 text-xs text-red-400 hover:bg-red-600/30"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selected.isEveryone && (
                <p className="mb-3 rounded bg-gray-800/60 px-3 py-2 text-xs text-gray-400">
                  @everyone is the baseline every member has. It cannot be renamed, moved, or deleted.
                </p>
              )}
              {!canEdit(selected) && (
                <p className="mb-3 rounded bg-gray-800/60 px-3 py-2 text-xs text-gray-400">
                  This role sits above your highest role, so you cannot change it.
                </p>
              )}

              <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                {catalogue.map((group) => (
                  <div key={group.name}>
                    <h5 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group.name}
                    </h5>
                    <ul className="space-y-0.5">
                      {Object.entries(group.permissions).map(([key, meta]) => {
                        const on = selected.permissions.includes(key);
                        const editable = canEdit(selected) && !selected.isEveryone;
                        return (
                          <li key={key}>
                            <button
                              onClick={() => togglePermission(key)}
                              disabled={!editable || busy}
                              title={meta.description}
                              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-gray-300 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <span
                                aria-hidden
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                                  on ? "border-accent-500 bg-accent-500" : "border-gray-600"
                                }`}
                              >
                                {on && (
                                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                )}
                              </span>
                              <span className="truncate">{meta.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
