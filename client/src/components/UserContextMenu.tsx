import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { useCallStore } from "@/stores/callStore";
import { useBlocksStore } from "@/stores/blocksStore";
import { useToast } from "@/stores/toastStore";
import { useConfirm } from "@/hooks/useConfirm";
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from "@/components/ContextMenu";
import type { User } from "@/types";

interface UserContextMenuProps {
  user: User;
  x: number;
  y: number;
  onClose: () => void;
  /** When present, the menu also offers the DM actions for this conversation. */
  conversationId?: string;
  muted?: boolean;
  onMarkRead?: () => void;
  onToggleMute?: () => void;
}

/**
 * The right-click menu for a person, matching the server-icon menu: a portal
 * popup with profile, follow, call, and block actions, plus the conversation
 * actions (mark read / mute) when opened from a DM.
 *
 * Blocking is the destructive action, so it is confirmed before it runs;
 * follow state is re-read every time the menu opens because the server is the
 * only source of truth for it.
 */
export default function UserContextMenu({
  user,
  x,
  y,
  onClose,
  conversationId,
  muted = false,
  onMarkRead,
  onToggleMute,
}: UserContextMenuProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const initiateCall = useCallStore((s) => s.initiateCall);
  const blocked = useBlocksStore((s) => s.isBlocked(user.id));
  const toggleBlock = useBlocksStore((s) => s.toggle);
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api
      .get(`/follows/${user.id}`)
      .then(({ data }) => {
        if (!cancelled) setIsFollowing(Boolean(data.isFollowing));
      })
      .catch(() => {
        // Keep the last known state; the toggle re-checks server-side anyway.
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const handleToggleFollow = async () => {
    onClose();
    try {
      const { data } = await api.post(`/follows/${user.id}`);
      setIsFollowing(Boolean(data.isFollowing));
      toast.success(data.isFollowing ? `Following ${user.username}` : `Unfollowed ${user.username}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update follow"));
    }
  };

  const handleToggleBlock = async () => {
    onClose();
    if (!blocked) {
      const confirmed = await confirm({
        title: `Block ${user.username}?`,
        message:
          "They will not be able to message, follow, or call you, and this conversation will be hidden.",
        confirmLabel: "Block",
        tone: "danger",
      });
      if (!confirmed) return;
    }
    try {
      const nowBlocked = await toggleBlock(user.id);
      toast.success(nowBlocked ? `Blocked ${user.username}` : `Unblocked ${user.username}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Could not update block"));
    }
  };

  return (
    <ContextMenu x={x} y={y} onClose={onClose} width={224}>
      <p className="truncate px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {user.username}
      </p>
      {conversationId && (
        <>
          <ContextMenuItem
            label="Mark as read"
            icon={
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            }
            onClick={() => {
              onMarkRead?.();
              onClose();
            }}
          />
          <ContextMenuItem
            label={muted ? "Unmute chat" : "Mute chat"}
            icon={
              <svg className="h-4 w-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            }
            onClick={() => {
              onToggleMute?.();
              onClose();
            }}
          />
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem
        label="Visit profile"
        icon={
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        }
        onClick={() => {
          onClose();
          navigate(`/profile/${user.id}`);
        }}
      />
      <ContextMenuItem
        label={isFollowing ? "Unfollow user" : "Follow user"}
        icon={
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        }
        onClick={() => void handleToggleFollow()}
      />
      <ContextMenuItem
        label="Voice call"
        icon={
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a1 1 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        }
        onClick={() => {
          onClose();
          initiateCall(user.id, user, "voice");
        }}
      />
      <ContextMenuItem
        label="Video call"
        icon={
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        }
        onClick={() => {
          onClose();
          initiateCall(user.id, user, "video");
        }}
      />
      <ContextMenuSeparator />
      <ContextMenuItem
        label={blocked ? "Unblock user" : "Block user"}
        danger
        icon={
          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 105.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        }
        onClick={() => void handleToggleBlock()}
      />
    </ContextMenu>
  );
}
