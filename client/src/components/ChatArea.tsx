import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import type { Message } from "@/types";

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

  useEffect(() => {
    if (channelId) {
      fetchMessages();
      const socket = getSocket();
      socket.emit("join_channel", channelId);

      socket.on("new_message", (message: Message) => {
        setMessages((prev) => [...prev, message]);
      });

      socket.on("typing_start", (data: { userId: string; channelId: string }) => {
        if (data.channelId === channelId && data.userId !== user?.id) {
          setTypingUsers((prev) => {
            if (!prev.includes(data.userId)) return [...prev, data.userId];
            return prev;
          });
        }
      });

      socket.on("typing_stop", (data: { userId: string; channelId: string }) => {
        if (data.channelId === channelId) {
          setTypingUsers((prev) => prev.filter((u) => u !== data.userId));
        }
      });

      return () => {
        socket.off("new_message");
        socket.off("typing_start");
        socket.off("typing_stop");
      };
    }
  }, [channelId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async () => {
    if (!channelId) return;
    try {
      const { data } = await api.get(`/messages/${channelId}`);
      setMessages(data.messages);
    } catch {
      // silent
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !channelId) return;
    const socket = getSocket();
    socket.emit("typing_stop", { channelId });

    try {
      await api.post("/messages", {
        content: newMessage,
        channelId,
        replyToId: replyTo?.id || null,
      });
      setNewMessage("");
      setReplyTo(null);
    } catch {
      // silent
    }
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim()) return;
    try {
      await api.patch(`/messages/${messageId}`, { content: editContent });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, content: editContent, edited: true } : m
        )
      );
      setEditingId(null);
      setEditContent("");
    } catch {
      // silent
    }
  };

  const deleteMessage = async (messageId: string) => {
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">No messages yet. Start the conversation!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className="group flex gap-3 rounded-lg p-2 hover:bg-gray-900/50"
              >
                <div className="h-10 w-10 flex-shrink-0 rounded-full bg-dangro-600 flex items-center justify-center text-sm font-bold">
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
                    <div className="mb-1 rounded border-l-2 border-dangro-600 bg-gray-900/50 px-2 py-1 text-xs text-gray-400">
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
                      className="w-full rounded border border-dangro-500 bg-gray-800 px-2 py-1 text-white focus:outline-none"
                      autoFocus
                    />
                  ) : (
                    <p className="text-gray-300 break-words">{message.content}</p>
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
                  <button
                    onClick={() => setReplyTo(message)}
                    className="opacity-0 group-hover:opacity-100 rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                  >
                    Reply
                  </button>
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
            Replying to {replyTo.author?.username}
          </span>
          <button
            onClick={() => setReplyTo(null)}
            className="text-xs text-gray-500 hover:text-white"
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
            placeholder={channelId ? "Type a message..." : "Select a channel"}
            disabled={!channelId}
            className="flex-1 resize-none rounded-lg border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder-gray-500 focus:border-dangro-500 focus:outline-none disabled:opacity-50"
            rows={1}
          />
          <button
            onClick={editingId ? () => editMessage(editingId) : sendMessage}
            disabled={!newMessage.trim() || !channelId}
            className="rounded-lg bg-dangro-600 px-4 py-3 text-white transition-colors hover:bg-dangro-500 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
