import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuthStore } from "@/stores/authStore";
import { getSocket } from "@/lib/socket";
import { useBounce } from "@/hooks/useBounce";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";
import { useConfirm } from "@/hooks/useConfirm";
import type { Conversation, DirectMessage, User } from "@/types";

interface Props {
  activeConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
}

/**
 * Conversation row wrapper that plays a short bounce on tap before selecting
 * the conversation. Bounce and selection stay in the same handler so the
 * animation always fires, even on the row that is already active.
 */
function ConversationRow({
  onClick,
  className,
  children,
}: {
  onClick: () => void;
  className: string;
  children: ReactNode;
}) {
  const { ref, bounce } = useBounce<HTMLButtonElement>();
  return (
    <button
      ref={ref}
      data-bounce="self"
      onClick={() => {
        bounce("tap");
        onClick();
      }}
      className={className}
    >
      {children}
    </button>
  );
}

export default function ConversationList({ activeConversation, onSelectConversation }: Props) {
  const user = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Mirrors the loaded conversation ids so a socket handler can tell an
  // unknown conversation from a known one *before* calling setState.
  // React replays updaters (StrictMode does it on every render), so a
  // setState callback has to stay pure — issuing a fetch from inside one ran
  // the request twice per event.
  const knownIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    knownIdsRef.current = new Set(conversations.map((c) => c.id));
  }, [conversations]);

  /**
   * Moves one conversation to the top of the list.
   *
   * `updated[index]` is `undefined` whenever the id is not in the array, and
   * the next render reads `.status` off every entry — so an unknown id used to
   * be able to put `undefined` into state and crash the page through the error
   * boundary. The ref check above runs in the same tick the id can change, so
   * the lookup is re-verified here rather than trusted.
   */
  const moveToTop = useCallback(
    (list: Conversation[], conversationId: string): Conversation[] => {
      const match = list.find((c) => c.id === conversationId);
      if (!match) return list;
      return [match, ...list.filter((c) => c.id !== conversationId)];
    },
    []
  );

  const fetchConversations = useCallback(async () => {
    try {
      const { data } = await api.get("/dms");
      setConversations(data.conversations);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void fetchConversations();
    const socket = getSocket();

    const handleNewDM = (message: DirectMessage) => {
      const isActive = activeConversation?.id === message.conversationId;
      const isSelf = message.senderId === user?.id;

      // A conversation this client has never loaded: refresh rather than
      // patching a list that does not contain it.
      if (!knownIdsRef.current.has(message.conversationId)) {
        void fetchConversations();
        return;
      }

      setConversations((prev) => {
        const unreadDelta = !isSelf && !isActive ? 1 : 0;
        const updated = prev.map((c) =>
          c.id === message.conversationId
            ? {
                ...c,
                lastMessage: message,
                lastMessageAt: message.createdAt,
                unreadCount: c.unreadCount + unreadDelta,
              }
            : c
        );
        return moveToTop(updated, message.conversationId);
      });
    };

    const handleDMUpdated = (data: {
      conversationId: string;
      message: DirectMessage;
      lastMessageAt: string;
      unreadCount: number;
    }) => {
      const isActive = activeConversation?.id === data.conversationId;

      if (!knownIdsRef.current.has(data.conversationId)) {
        void fetchConversations();
        return;
      }

      setConversations((prev) => {
        const updated = prev.map((c) =>
          c.id === data.conversationId
            ? {
                ...c,
                lastMessage: data.message,
                lastMessageAt: data.lastMessageAt,
                unreadCount: isActive ? 0 : data.unreadCount,
              }
            : c
        );
        return moveToTop(updated, data.conversationId);
      });
    };

    const handleConnect = () => void fetchConversations();

    const handleMessageEdited = (data: { conversationId: string; message: DirectMessage }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId && c.lastMessage?.id === data.message.id
            ? { ...c, lastMessage: data.message }
            : c
        )
      );
    };

    const handleMessageDeleted = (data: { conversationId: string; messageId: string }) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.conversationId && c.lastMessage?.id === data.messageId
            ? { ...c, lastMessage: null, lastMessageAt: null, unreadCount: 0 }
            : c
        )
      );
      void fetchConversations();
    };

    const handleRequestEvent = () => void fetchConversations();

    const handleRead = (data: { conversationId: string }) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === data.conversationId ? { ...c, unreadCount: 0 } : c))
      );
    };

    socket.on("new_dm", handleNewDM);
    socket.on("dm_updated", handleDMUpdated);
    socket.on("dm_message_edited", handleMessageEdited);
    socket.on("dm_message_deleted", handleMessageDeleted);
    socket.on("dm_read", handleRead);
    socket.on("dm_request", handleRequestEvent);
    socket.on("dm_request_accepted", handleRequestEvent);
    socket.on("dm_request_declined", handleRequestEvent);
    socket.on("connect", handleConnect);

    const pollId = setInterval(() => void fetchConversations(), 20000);

    return () => {
      socket.off("new_dm", handleNewDM);
      socket.off("dm_updated", handleDMUpdated);
      socket.off("dm_message_edited", handleMessageEdited);
      socket.off("dm_message_deleted", handleMessageDeleted);
      socket.off("dm_read", handleRead);
      socket.off("dm_request", handleRequestEvent);
      socket.off("dm_request_accepted", handleRequestEvent);
      socket.off("dm_request_declined", handleRequestEvent);
      socket.off("connect", handleConnect);
      clearInterval(pollId);
    };
  }, [activeConversation?.id, user?.id, fetchConversations, moveToTop]);

  useEffect(() => {
    if (!activeConversation?.id) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id ? { ...c, unreadCount: 0 } : c
      )
    );
  }, [activeConversation?.id]);

  // One request per keystroke with no ordering guard meant a slow response for
  // "al" could land after "alice" and overwrite its results with the wrong
  // people. Each call claims a sequence number and only the newest may write.
  const searchSeqRef = useRef(0);

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      searchSeqRef.current += 1;
      setSearchResults([]);
      return;
    }
    const seq = ++searchSeqRef.current;
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(trimmed)}`);
      if (seq !== searchSeqRef.current) return;
      setSearchResults(data.users);
    } catch {
      if (seq === searchSeqRef.current) setSearchResults([]);
    }
  };

  const startConversation = async (userId: string) => {
    try {
      const { data } = await api.post("/dms/start", { userId });
      const existing = conversations.find((c) => c.id === data.conversation.id);
      if (existing) {
        onSelectConversation(existing);
      } else {
        setConversations((prev) => [data.conversation, ...prev]);
        onSelectConversation(data.conversation);
      }
      setShowSearch(false);
      setSearchQuery("");
      setSearchResults([]);
    } catch {
      // silent
    }
  };

  const acceptRequest = async (conversation: Conversation) => {
    try {
      await api.post(`/dms/${conversation.id}/accept`);
      if (activeConversation?.id === conversation.id) {
        onSelectConversation({ ...conversation, status: "active", requestSenderId: null });
      }
    } catch {
      // silent
    } finally {
      void fetchConversations();
    }
  };

  const declineRequest = async (conversation: Conversation) => {
    const ok = await confirm({
      title: `Delete the message request from ${conversation.otherUser?.username ?? "this user"}?`,
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) {
      return;
    }
    try {
      await api.post(`/dms/${conversation.id}/decline`);
    } catch {
      // silent
    } finally {
      void fetchConversations();
    }
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: "short" });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const messagePreview = (conv: Conversation, selfId?: string) => {
    const lastMsg = conv.lastMessage;
    if (!lastMsg) return "No messages yet";
    const prefix = lastMsg.senderId === selfId ? "You: " : "";
    const text =
      lastMsg.content ||
      (lastMsg.attachmentType === "image"
        ? "📷 Image"
        : lastMsg.attachmentType === "video"
          ? "🎥 Video"
          : lastMsg.attachmentType === "audio"
            ? "🎵 Voice message"
            : "Attachment");
    return prefix + (text.length > 40 ? text.substring(0, 40) + "..." : text);
  };

  const myRequests = conversations.filter(
    (c) => c.status === "pending" && c.requestSenderId !== user?.id
  );
  const regular = conversations.filter(
    (c) => c.status !== "pending" || c.requestSenderId === user?.id
  );

  return (
    <div className="glass flex w-80 shrink-0 flex-col border-r">
      <div className="glass sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold tracking-tight text-white">Messages</h2>
        <button
          onClick={() => setShowSearch(!showSearch)}
          aria-label="Start a new conversation"
          title="Start a new conversation"
          className="icon-btn"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {showSearch && (
        <div className="border-b px-3 py-3 animate-fade-up">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => searchUsers(e.target.value)}
            placeholder="Search users to message..."
            aria-label="Search users to message"
            className="field py-2"
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversation(u.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-200 ease-out hover:bg-accent-500/10"
                >
                  <Avatar user={u} className="h-8 w-8 text-xs" linkToProfile={false} />
                  <span className="truncate text-sm font-medium text-gray-200">{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {conversations.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">
            No conversations yet
          </div>
        ) : (
          <>
            {myRequests.length > 0 && (
              <div className="mb-1 border-b border-gray-800/50 pb-2">
                <div className="flex items-center gap-2 px-2 pt-2 pb-1">
                  <h3 className="eyebrow text-amber-400/90">Message Requests</h3>
                  <span className="tabular flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500/20 px-1 text-[10px] font-bold text-amber-300 ring-1 ring-inset ring-amber-500/40">
                    {myRequests.length}
                  </span>
                </div>
                {myRequests.map((conv) => {
                  const preview = messagePreview(conv, user?.id);
                  return (
                    <div
                      key={conv.id}
                      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 ease-out hover:bg-accent-500/10"
                    >
                      <Avatar user={conv.otherUser} className="h-10 w-10 text-sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-sm font-semibold tracking-tight text-white">
                            {conv.otherUser?.username}
                          </span>
                          <span className="tabular ml-2 flex-shrink-0 text-xs text-gray-500">
                            {formatTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <p className="truncate text-xs text-gray-400">{preview}</p>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            onClick={() => void acceptRequest(conv)}
                            className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30 transition-all duration-200 ease-out hover:bg-emerald-500/25"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => void declineRequest(conv)}
                            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-400 transition-all duration-200 ease-out hover:bg-red-500/15 hover:text-red-300"
                          >
                            Decline
                          </button>
                          <button
                            onClick={() => onSelectConversation(conv)}
                            className="ml-auto rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-400 transition-all duration-200 ease-out hover:bg-white/5 hover:text-white"
                          >
                            View
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {regular.map((conv) => {
              const isActive = activeConversation?.id === conv.id;
              const preview = messagePreview(conv, user?.id);
              const awaitingAccept =
                conv.status === "pending" && conv.requestSenderId === user?.id;

              return (
                <ConversationRow
                  key={conv.id}
                  onClick={() => onSelectConversation(conv)}
                  className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-all duration-200 ease-out ${
                    isActive ? "row-active" : "text-gray-300 hover:bg-white/5"
                  }`}
                >
                  <Avatar
                    user={conv.otherUser}
                    status={conv.otherUser?.status}
                    className="h-10 w-10 text-sm"
                    linkToProfile={false}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span
                        className={`truncate text-sm font-semibold tracking-tight ${
                          conv.unreadCount > 0 ? "text-white" : "text-gray-200"
                        }`}
                      >
                        {conv.otherUser?.username}
                      </span>
                      <span
                        className={`tabular ml-2 flex-shrink-0 text-xs ${
                          conv.unreadCount > 0 ? "text-accent-300" : "text-gray-500"
                        }`}
                      >
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs text-gray-400">{preview}</p>
                      {conv.unreadCount > 0 && (
                        <span className="tabular flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent-500 px-1.5 text-[10px] font-bold text-white shadow-glow">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                    {awaitingAccept && (
                      <p className="mt-1 text-[10px] font-medium text-amber-400/90">
                        Waiting for them to accept your message request
                      </p>
                    )}
                  </div>
                </ConversationRow>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
