import { useEffect, useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";
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
  const [flashId, setFlashId] = useState<string | null>(null);
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
    socket.emit("join_channel", { channelId });

    const rejoin = () => {
      socket.emit("join_channel", { channelId });
      void fetchMessages();
    };
    socket.on("connect", rejoin);

    const handleNewMessage = (message: Message) => {
      if (message.channelId !== channelId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) {
          return prev.map((m) => (m.id === message.id ? message : m));
        }
        const optimisticIndex = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.authorId === message.authorId &&
            m.content.trim() === message.content.trim()
        );
        if (optimisticIndex !== -1) {
          const next = [...prev];
          next[optimisticIndex] = message;
          return next;
        }
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

    const pollId = setInterval(() => void fetchMessages(), 15000);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_edited", handleEdited);
      socket.off("message_deleted", handleDeleted);
      socket.off("message_reactions_updated", handleReactionsUpdated);
      socket.off("typing_start", handleTypingStart);
      socket.off("typing_stop", handleTypingStop);
      socket.off("connect", rejoin);
      clearInterval(pollId);
    };
  }, [channelId, user?.id, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    setEditingId(null);
    setEditContent("");
    setReplyTo(null);
    setFlashId(null);
  }, [channelId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !channelId) return;
    const socket = getSocket();
    socket.emit("typing_stop", { channelId });

    const content = newMessage;
    const tempId = `temp-${Date.now()}`;
    setNewMessage("");
    setReplyTo(null);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content,
        authorId: user?.id ?? "",
        channelId,
        replyToId: replyTo?.id ?? null,
        edited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: user ?? undefined,
        reactions: [],
      },
    ]);

    try {
      await api.post("/messages", {
        content,
        channelId,
        replyToId: replyTo?.id || null,
      });
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setNewMessage(content);
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim() || messageId.startsWith("temp-")) return;
    try {
      const { data } = await api.patch(`/messages/${messageId}`, { content: editContent });
      setMessages((prev) => prev.map((m) => (m.id === messageId ? data.message : m)));
      setEditingId(null);
      setEditContent("");
    } catch {
      // silent
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (messageId.startsWith("temp-")) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setReplyTo((cur) => (cur?.id === messageId ? null : cur));
    } catch {
      // silent
    }
  };

  const scrollToMessage = (id: string) => {
    document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500);
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
                id={message.id.startsWith("temp-") ? undefined : `message-${message.id}`}
                className={`group relative flex gap-3 rounded-lg px-2 py-1 hover:bg-gray-900/50 ${
                  flashId === message.id ? "ring-1 ring-accent-400" : ""
                }`}
              >
                <Avatar user={message.author} className="h-10 w-10 text-sm" />
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
                    <button
                      onClick={() => scrollToMessage(message.replyTo!.id)}
                      className="mb-1 block rounded border-l-2 border-accent-600 bg-gray-900/50 px-2 py-1 text-left text-xs text-gray-400 hover:text-gray-300"
                      title={`Reply to ${message.replyTo.author?.username ?? ""}`}
                    >
                      Replying to {message.replyTo.author?.username}:{" "}
                      {message.replyTo.content}
                    </button>
                  )}
                  {editingId === message.id ? (
                    <div>
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="w-full rounded border border-accent-500 bg-gray-800 px-2 py-1 text-white focus:outline-none"
                        autoFocus
                      />
                      <p className="mt-1 text-[10px] text-gray-400">
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditContent("");
                          }}
                          className="underline hover:text-white"
                        >
                          escape
                        </button>{" "}
                        to cancel ·{" "}
                        <button
                          onClick={() => void editMessage(message.id)}
                          className="underline hover:text-white"
                        >
                          enter
                        </button>{" "}
                        to save
                      </p>
                    </div>
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

                {editingId !== message.id && (
                  <div className="absolute -top-3 right-2 z-10 transition-opacity">
                    <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900 px-1 py-0.5 opacity-0 shadow-lg group-hover:opacity-100 focus-within:opacity-100">
                      {quickReactions.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(message.id, emoji)}
                          className="rounded p-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
                          title={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}
                      <button
                        onClick={() => setReplyTo(message)}
                        className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                        title="Reply"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                      {message.authorId === user?.id && (
                        <>
                          <button
                            onClick={() => {
                              setEditingId(message.id);
                              setEditContent(message.content);
                            }}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => void deleteMessage(message.id)}
                            className="rounded p-1.5 text-gray-400 hover:bg-red-600/20 hover:text-red-400"
                            title="Delete"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
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
