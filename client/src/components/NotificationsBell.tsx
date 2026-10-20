import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { apiErrorMessage } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useToast } from "@/stores/toastStore";
import Media from "@/components/Media";
import type { Notification } from "@/types";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotifications(data.notifications ?? []);
      setUnreadCount(data.unreadCount ?? 0);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onNotification = (payload: { notification: Notification; unreadCount: number }) => {
      setNotifications((prev) => [payload.notification, ...prev]);
      setUnreadCount(payload.unreadCount);
    };
    socket.on("notification", onNotification);
    return () => {
      socket.off("notification", onNotification);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markRead = async (id: string) => {
    try {
      const { data } = await api.post(`/notifications/${id}/read`);
      setUnreadCount(data.unreadCount ?? 0);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const markAllRead = async () => {
    try {
      await api.post("/notifications/read-all");
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        className="icon-btn relative"
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 px-1 text-[10px] font-bold tabular-nums text-white shadow-[0_0_10px_-1px_rgb(239_68_68/0.7)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="glass-panel layer-popup absolute right-0 mt-2 w-80 animate-pop-in overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-gray-700/60 px-4 py-3">
            <span className="text-sm font-bold tracking-tight text-white">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => void markAllRead()}
                className="text-xs font-semibold text-accent-400 transition-colors hover:text-accent-300"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-gray-500">Nothing yet.</p>
                <p className="mt-1 text-xs text-gray-600">
                  Replies, requests and likes will show up here.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) void markRead(n.id);
                    setOpen(false);
                    if (n.type === "friend_request") navigate("/friends");
                    else if (n.type === "follow" && n.fromUserId) navigate(`/profile/${n.fromUserId}`);
                  }}
                  className={`flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors duration-150 hover:bg-gray-800/40 ${
                    n.read
                      ? "border-transparent opacity-60"
                      : "border-accent-400 bg-accent-500/[0.07]"
                  }`}
                >
                  <div className="mt-0.5 h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-accent-500 to-accent-700">
                    {n.fromUser?.avatar ? (
                      <Media src={n.fromUser.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-bold text-white">
                        {n.fromUser?.username?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-200">
                      <span className="font-semibold">{n.fromUser?.username ?? "Someone"}</span>{" "}
                      {n.message}
                    </p>
                    <span className="text-xs tabular-nums text-gray-500">{timeAgo(n.createdAt)}</span>
                  </div>
                  {!n.read && (
                    <span
                      className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent-400 shadow-glow"
                      aria-label="Unread"
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
