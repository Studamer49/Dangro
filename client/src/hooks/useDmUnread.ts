import { useCallback, useEffect, useRef, useState } from "react";
import api from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { useAuthStore } from "@/stores/authStore";
import { useDmPrefsStore } from "@/stores/dmPrefsStore";
import type { Conversation } from "@/types";

/**
 * The viewer's total unread DM count, for the badge on the Messages icon in the
 * server rail.
 *
 * The conversation list itself lives in `ConversationList`, which only mounts on
 * the /dms route — but the rail is on screen everywhere, so it needs its own
 * lightweight read of the same data. It loads `/dms`, keeps the number current
 * from the DM socket events (plus a slow poll as a backstop), and exposes the
 * "mark all read" action the rail menu offers.
 *
 * Muted conversations are left out of the total, and muting *all* messages
 * (`dmPrefsStore.mutedAll`) hides the badge entirely.
 */
export function useDmUnread() {
  const userId = useAuthStore((s) => s.user?.id);
  const prefs = useDmPrefsStore((s) => s.prefs);
  const mutedAll = useDmPrefsStore((s) => s.mutedAll);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/dms");
      setConversations((data.conversations ?? []) as Conversation[]);
    } catch {
      // Silent: the rail keeps the last count it had rather than blanking.
    }
  }, []);

  // A single message can arrive as several socket events; coalesce them so the
  // rail issues at most one `/dms` call per burst.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void refresh(), 300);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    void refresh();

    const socket = getSocket();
    const events = [
      "new_dm",
      "dm_updated",
      "dm_read",
      "dm_message_deleted",
      "dm_request",
      "dm_request_accepted",
      "dm_request_declined",
      "connect",
    ] as const;
    const onChange = () => scheduleRefresh();
    for (const event of events) socket.on(event, onChange);

    const pollId = setInterval(() => void refresh(), 30000);

    return () => {
      for (const event of events) socket.off(event, onChange);
      clearInterval(pollId);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, refresh, scheduleRefresh]);

  // Read `prefs` (not the `isMuted` getter) so muting a conversation elsewhere
  // re-renders the badge.
  const total = mutedAll
    ? 0
    : conversations.reduce(
        (sum, conversation) =>
          prefs[conversation.id]?.muted ? sum : sum + (conversation.unreadCount ?? 0),
        0
      );

  const markAllRead = useCallback(async () => {
    const unread = conversations.filter((conversation) => conversation.unreadCount > 0);
    // Clear the badge first so the menu action feels immediate; each request
    // also makes the server tell the other side their message was read.
    setConversations((prev) => prev.map((conversation) => ({ ...conversation, unreadCount: 0 })));
    await Promise.all(
      unread.map((conversation) => api.patch(`/dms/${conversation.id}/read`).catch(() => undefined))
    );
  }, [conversations]);

  return { total, markAllRead };
}
