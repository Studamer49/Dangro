import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import api from "@/lib/api";
import type { Conversation, User } from "@/types";

interface Props {
  activeConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
}

export default function ConversationList({ activeConversation, onSelectConversation }: Props) {
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const { data } = await api.get("/dms");
      setConversations(data.conversations);
    } catch {
      // silent
    }
  };

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      setSearchResults(data.users);
    } catch {
      // silent
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

  return (
    <div className="flex w-80 flex-col border-r border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h2 className="text-lg font-bold text-white">Messages</h2>
        <button
          onClick={() => setShowSearch(!showSearch)}
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {showSearch && (
        <div className="border-b border-gray-800 p-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => searchUsers(e.target.value)}
            placeholder="Search users to message..."
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversation(u.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-gray-800"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-600 text-xs font-bold">
                    {u.username[0].toUpperCase()}
                  </div>
                  <span className="text-sm text-white">{u.username}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No conversations yet
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = activeConversation?.id === conv.id;
            const lastMsg = conv.lastMessage;
            let preview = "No messages yet";
            if (lastMsg) {
              const isSelf = lastMsg.senderId === user?.id;
              const prefix = isSelf ? "You: " : "";
              const text = lastMsg.content || (lastMsg.attachmentType === "image" ? "📷 Image" : lastMsg.attachmentType === "video" ? "🎥 Video" : lastMsg.attachmentType === "audio" ? "🎵 Voice message" : "Attachment");
              preview = prefix + (text.length > 40 ? text.substring(0, 40) + "..." : text);
            }

            return (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-accent-600/20 text-white"
                    : "text-gray-300 hover:bg-gray-800/50"
                }`}
              >
                <div className="relative flex-shrink-0">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-600 text-sm font-bold">
                    {conv.otherUser?.username?.[0]?.toUpperCase()}
                  </div>
                  <div
                    className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-gray-900 ${
                      conv.otherUser?.status === "online"
                        ? "bg-green-500"
                        : conv.otherUser?.status === "idle"
                        ? "bg-yellow-500"
                        : conv.otherUser?.status === "dnd"
                        ? "bg-red-500"
                        : "bg-gray-500"
                    }`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium">
                      {conv.otherUser?.username}
                    </span>
                    <span className="ml-2 flex-shrink-0 text-xs text-gray-500">
                      {formatTime(conv.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="truncate text-xs text-gray-400">{preview}</p>
                    {conv.unreadCount > 0 && (
                      <span className="ml-2 flex-shrink-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent-600 px-1.5 text-[10px] font-bold text-white">
                        {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
