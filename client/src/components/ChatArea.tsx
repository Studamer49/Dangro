import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import type { Message, Reaction } from "@/types";

export default function ChatArea() {
  const { channelId } = useParams();
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchMessages = useCallback(async () => {
    if (!channelId) return;
    try {
      const { data } = await api.get(`/messages/${channelId}`);
      setMessages(data.messages);
    } catch {
      // silent
    }
  }, [channelId]);

  useEffect(() => {
    if (!channelId) {
      setMessages([]);
      return;
    }

    fetchMessages();
    const socket = getSocket();
    socket.emit("join_channel", channelId);

    const handleNewMessage = (message: Message) => {
      if (message.channelId !== channelId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
    };

    const handleEdited = (message: Message) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === message.id ? message : m))
      );
    };

    const handleDeleted = (data: { messageId: string }) => {
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
    };

    const handleReactionsUpdated = (data: {
      messageId: string;
      reactions: Reaction[];
    }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === data.messageId ? { ...m, reactions: data.reactions } : m
        )
      );
    };

    const handleTypingStart = (data: {
      userId: string;
      channelId: string;
    }) => {
      if (data.channelId === channelId && data.userId !== user?.id) {
        setTypingUsers((prev) => {
          if (!prev.includes(data.userId)) return [...prev, data.userId];
          return prev;
        });
      }
    };

    const handleTypingStop = (data: {
      userId: string;
      channelId: string;
    }) => {
      if (data.channelId === channelId) {
        setTypingUsers((prev) => prev.filter((u) => u !== data.userId));
      }
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_edited", handleEdited);
    socket.on("message_deleted", handleDeleted);
    socket.on("message_reactions_updated", handleReactionsUpdated);
    socket.on("typing_start", handleTypingStart);
    socket.on("typing_stop", handleTypingStop);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_edited", handleEdited);
      socket.off("message_deleted", handleDeleted);
      socket.off("message_reactions_updated", handleReactionsUpdated);
      socket.off("typing_start", handleTypingStart);
      socket.off("typing_stop", handleTypingStop);
    };
  }, [channelId, user?.id, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !channelId) return;
    const socket = getSocket();
    socket.emit("typing_stop", { channelId });

    const content = newMessage;
    setNewMessage("");
    setReplyTo(null);

    try {
      await api.post("/messages", {
        content,
        channelId,
        replyToId: replyTo?.id || null,
      });
    } catch {
      setNewMessage(content);
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim()) return;
    try {
      await api.patch(`/messages/${messageId}`, { content: editContent });
      setEditingId(null);
      setEditContent("");
    } catch {
      // silent
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/messages/${messageId}`);
    } catch {
      // silent
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      await api.post(`/messages/${messageId}/reactions`, { emoji });
    } catch {
      // silent
    }
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (channelId) {
      socket.emit("typing_start", { channelId });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        socket.emit("typing_stop", { channelId });
      }, 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editingId) {
        editMessage(editingId);
      } else {
        sendMessage();
      }
    }
    if (e.key === "Escape") {
      setEditingId(null);
      setReplyTo(null);
    }
  };

  const quickReactions = ["👍", "❤️", "😂", "🔥", "👀"];

  if (!channelId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg text-gray-400">Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message) => (
              <div
                key={message.id}
                className="group flex gap-3 rounded-lg px-2 py-1 hover:bg-gray-900/50"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-accent-600 flex items-center justify-center text-sm font-bold">
                  {message.author?.username?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">
                      {message.author?.username}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(message.createdAt).toLocaleTimeString()}
                    </span>
                    {message.edited && (
                      <span className="text-xs text-gray-600">(edited)</span>
                    )}
                  </div>
                  {message.replyTo && (
                    <div className="mb-1 rounded border-l-2 border-accent-600 bg-gray-900/50 px-2 py-1 text-xs text-gray-400">
                      Replying to {message.replyTo.author?.username}:{" "}
                      {message.replyTo.content}
                    </div>
                  )}
                  {editingId === message.id ? (
                    <input
                      type="text"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full rounded border border-accent-500 bg-gray-800 px-2 py-1 text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-gray-300 break-words">{message.content}</p>
                  )}

                  {message.reactions && message.reactions.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {message.reactions.map((reaction) => (
                        <button
                          key={reaction.id}
                          onClick={() => toggleReaction(message.id, reaction.emoji)}
                          className={`rounded-full border px-2 py-0.5 text-xs transition-colors ${
                            reaction.userId === user?.id
                              ? "border-accent-500 bg-accent-600/20 text-accent-300"
                              : "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600"
                          }`}
                        >
                          {reaction.emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {message.authorId === user?.id && editingId !== message.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => {
                        setEditingId(message.id);
                        setEditContent(message.content);
                      }}
                      className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteMessage(message.id)}
                      className="rounded p-1 text-gray-500 hover:bg-red-600/20 hover:text-red-400"
                    >
                      Delete
                    </button>
                  </div>
                )}
                {message.authorId !== user?.id && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    {quickReactions.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(message.id, emoji)}
                        className="rounded p-1 text-xs text-gray-500 hover:bg-gray-800 hover:text-white"
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      onClick={() => setReplyTo(message)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                    >
                      Reply
                    </button>
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          Someone is typing...
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-gray-800 bg-gray-900 px-4 py-2">
          <span className="text-xs text-gray-400">
            Replying to <span className="font-medium text-gray-300">{replyTo.author?.username}</span>: {replyTo.content}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="ml-auto text-xs text-gray-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <div className="border-t border-gray-800 p-4">
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="rounded-lg bg-accent-600 px-4 py-3 text-white transition-colors hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
