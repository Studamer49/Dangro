import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import api, { apiErrorMessage } from "@/lib/api";
import { useToast } from "@/stores/toastStore";
import { useConfirm } from "@/hooks/useConfirm";
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
  const confirm = useConfirm();
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
    const ok = await confirm({
      title: `Delete the role "${role.name}"?`,
      message: "Everyone holding it loses those permissions.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
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
        <button onClick={onClose} className="btn-ghost">
          Done
        </button>
      }
    >
      <div className="flex gap-4">
        {/* Role list */}
        <div className="w-48 shrink-0">
          <ul className="mb-2 max-h-80 space-y-1 overflow-y-auto pr-1">
            {ordered.map((role) => {
              const locked = !canEdit(role);
              return (
                <li key={role.id}>
                  <button
                    onClick={() => setSelectedId(role.id)}
                    aria-pressed={selected?.id === role.id}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-all duration-200 ${
                      selected?.id === role.id
                        ? "row-active"
                        : "hover:bg-gray-800/50 hover:text-white"
                    }`}
                  >
                    {role.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full shadow-[0_0_8px_-2px_currentColor]"
                        style={{ backgroundColor: role.color }}
                      />
                    )}
                    <span className="truncate font-medium">{role.name}</span>
                    {locked && <span className="ml-auto shrink-0 text-[10px] uppercase text-gray-600">locked</span>}
                  </button>
                </li>
              );
            })}
          </ul>

          {!creating ? (
            <button
              onClick={() => setCreating(true)}
              className="w-full rounded-lg border border-dashed border-gray-700/70 px-2 py-2 text-xs font-semibold text-gray-400 transition-all duration-200 hover:border-accent-400/60 hover:bg-gray-800/40 hover:text-white"
            >
              + Create role
            </button>
          ) : (
            <div className="glass-card animate-pop-in rounded-xl p-3">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                placeholder="Role name"
                maxLength={32}
                autoFocus
                className="field mb-2.5 px-3 py-2 text-xs"
              />
              <div className="mb-2.5 flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    aria-label={color}
                    aria-pressed={newColor === color}
                    className={`h-5 w-5 rounded-full transition-all duration-200 ${
                      newColor === color
                        ? "scale-110 ring-2 ring-white ring-offset-2 ring-offset-transparent"
                        : "hover:scale-110"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={create}
                  disabled={busy || !newName.trim()}
                  className="btn-primary flex-1 px-2 py-1.5 text-xs"
                >
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="btn-ghost px-2 py-1.5 text-xs"
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
            <div className="glass-card rounded-xl px-4 py-6 text-center">
              <p className="text-sm text-gray-500">Select a role to see its permissions.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {selected.color && (
                    <span
                      className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_10px_-2px_currentColor]"
                      style={{ backgroundColor: selected.color }}
                    />
                  )}
                  <h4 className="truncate text-sm font-bold tracking-tight text-white">
                    {selected.name}
                  </h4>
                  <span className="tabular shrink-0 text-xs text-gray-500">
                    {selected.memberCount ?? 0} member{(selected.memberCount ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  {canEdit(selected) && !selected.isEveryone && (
                    <>
                      <button
                        onClick={rename}
                        className="rounded-lg border border-gray-700/60 bg-gray-800/40 px-2.5 py-1 text-xs font-semibold text-gray-300 transition-all duration-200 hover:bg-gray-800 hover:text-white"
                      >
                        Rename
                      </button>
                      <button
                        onClick={() => remove(selected)}
                        className="rounded-lg border border-red-500/30 bg-red-600/10 px-2.5 py-1 text-xs font-semibold text-red-400 transition-all duration-200 hover:bg-red-600/30 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {selected.isEveryone && (
                <p className="glass mb-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed text-gray-400">
                  @everyone is the baseline every member has. It cannot be renamed, moved, or deleted.
                </p>
              )}
              {!canEdit(selected) && (
                <p className="glass mb-3 rounded-lg px-3 py-2.5 text-xs leading-relaxed text-gray-400">
                  This role sits above your highest role, so you cannot change it.
                </p>
              )}

              <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
                {catalogue.map((group) => (
                  <div key={group.name}>
                    <h5 className="eyebrow mb-2 px-2.5">{group.name}</h5>
                    <ul className="space-y-1">
                      {Object.entries(group.permissions).map(([key, meta]) => {
                        const on = selected.permissions.includes(key);
                        const editable = canEdit(selected) && !selected.isEveryone;
                        return (
                          <li key={key}>
                            <button
                              onClick={() => togglePermission(key)}
                              disabled={!editable || busy}
                              title={meta.description}
                              aria-pressed={on}
                              className={`glass-card flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60 ${
                                on
                                  ? "row-active"
                                  : "hover:border-accent-400/30 hover:bg-gray-800/40"
                              }`}
                            >
                              <span
                                aria-hidden
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                                  on
                                    ? "border-accent-400 bg-accent-500 shadow-[0_0_10px_-2px_rgb(var(--accent-400-rgb)/0.8)]"
                                    : "border-gray-600 bg-gray-900/50"
                                }`}
                              >
                                {on && (
                                  <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                  </svg>
                                )}
                              </span>
                              <span className={`truncate ${on ? "font-medium text-white" : "text-gray-300"}`}>
                                {meta.label}
                              </span>
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
