import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCallStore } from "@/stores/callStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import VoiceRecorder from "@/components/VoiceRecorder";
import type { Conversation, DirectMessage } from "@/types";

interface Props {
  conversation: Conversation;
}

export default function DMChatArea({ conversation }: Props) {
  const user = useAuthStore((s) => s.user);
  const initiateCall = useCallStore((s) => s.initiateCall);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await api.get(`/dms/${conversation.id}`);
      setMessages(data.messages);
      markAsRead();
    } catch {
      // silent
    }
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
    const socket = getSocket();
    socket.emit("dm_join", conversation.id);

    const handleNewDM = (message: DirectMessage) => {
      if (message.conversationId !== conversation.id) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === message.id)) return prev;
        return [...prev, message];
      });
      if (message.senderId !== user?.id) {
        markAsRead();
      }
    };

    const handleTypingStart = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === conversation.id && data.userId !== user?.id) {
        setTypingUsers((prev) => {
          if (!prev.includes(data.userId)) return [...prev, data.userId];
          return prev;
        });
      }
    };

    const handleTypingStop = (data: { userId: string; conversationId: string }) => {
      if (data.conversationId === conversation.id) {
        setTypingUsers((prev) => prev.filter((u) => u !== data.userId));
      }
    };

    const handleRead = (data: { conversationId: string; readBy: string }) => {
      if (data.conversationId === conversation.id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.senderId === user?.id && !m.readAt
              ? { ...m, readAt: new Date().toISOString() }
              : m
          )
        );
      }
    };

    socket.on("new_dm", handleNewDM);
    socket.on("dm_typing_start", handleTypingStart);
    socket.on("dm_typing_stop", handleTypingStop);
    socket.on("dm_read", handleRead);

    return () => {
      socket.off("new_dm", handleNewDM);
      socket.off("dm_typing_start", handleTypingStart);
      socket.off("dm_typing_stop", handleTypingStop);
      socket.off("dm_read", handleRead);
      socket.emit("dm_leave", conversation.id);
    };
  }, [conversation.id, user?.id, fetchMessages]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, shouldAutoScroll]);

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
  };

  const markAsRead = async () => {
    try {
      await api.patch(`/dms/${conversation.id}/read`);
    } catch {
      // silent
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    const socket = getSocket();
    socket.emit("dm_typing_stop", { conversationId: conversation.id });

    const content = newMessage;
    setNewMessage("");
    setReplyTo(null);

    try {
      await api.post(`/dms/${conversation.id}`, {
        content,
        replyToId: replyTo?.id || null,
      });
    } catch {
      setNewMessage(content);
    }
  };

  const sendAttachment = async (file: File) => {
    setIsUploading(true);
    setShowAttachMenu(false);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data: uploadData } = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await api.post(`/dms/${conversation.id}`, {
        content: file.name,
        attachmentUrl: uploadData.url,
        attachmentType: uploadData.type,
      });
    } catch {
      // silent
    } finally {
      setIsUploading(false);
    }
  };

  const sendVoiceMessage = async (blob: Blob) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", new Blob([blob], { type: "audio/webm" }), "voice-message.webm");
      const { data: uploadData } = await api.post("/uploads", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await api.post(`/dms/${conversation.id}`, {
        content: "Voice message",
        attachmentUrl: uploadData.url,
        attachmentType: "audio",
      });
    } catch {
      // silent
    } finally {
      setIsUploading(false);
    }
  };

  const handleTyping = () => {
    const socket = getSocket();
    socket.emit("dm_typing_start", { conversationId: conversation.id });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("dm_typing_stop", { conversationId: conversation.id });
    }, 3000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "Escape") {
      setReplyTo(null);
    }
  };

  const formatMessageTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const renderReadReceipt = (msg: DirectMessage) => {
    if (msg.senderId !== user?.id) return null;
    if (!msg.deliveredAt) return <span className="text-gray-500">✓</span>;
    if (!msg.readAt) return <span className="text-gray-400">✓✓</span>;
    return <span className="text-blue-400">✓✓</span>;
  };

  const renderAttachment = (msg: DirectMessage) => {
    if (!msg.attachmentUrl) return null;

    if (msg.attachmentType === "image") {
      return (
        <div className="mt-2">
          <img
            src={msg.attachmentUrl}
            alt="Shared image"
            className="max-h-64 rounded-lg object-cover"
          />
        </div>
      );
    }

    if (msg.attachmentType === "video") {
      return (
        <div className="mt-2">
          <video
            src={msg.attachmentUrl}
            controls
            className="max-h-64 rounded-lg"
          />
        </div>
      );
    }

    if (msg.attachmentType === "audio") {
      return (
        <div className="mt-2">
          <audio src={msg.attachmentUrl} controls className="w-full" />
        </div>
      );
    }

    return (
      <a
        href={msg.attachmentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center gap-2 rounded-lg bg-gray-700/50 px-3 py-2 text-sm text-accent-400 hover:bg-gray-700"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {msg.content}
      </a>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-800 bg-gray-900 px-4 py-3">
        <div className="relative">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-600 text-sm font-bold">
            {conversation.otherUser?.username?.[0]?.toUpperCase()}
          </div>
          <div
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-gray-900 ${
              conversation.otherUser?.status === "online"
                ? "bg-green-500"
                : conversation.otherUser?.status === "idle"
                ? "bg-yellow-500"
                : "bg-gray-500"
            }`}
          />
        </div>
        <div>
          <p className="text-sm font-medium text-white">{conversation.otherUser?.username}</p>
          <p className="text-xs text-gray-400">{conversation.otherUser?.status || "offline"}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => initiateCall(conversation.otherUser!.id, conversation.otherUser!, "voice")}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            title="Voice call"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={() => initiateCall(conversation.otherUser!.id, conversation.otherUser!, "video")}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            title="Video call"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-gray-500">Send a message to start the conversation</p>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => {
              const isSelf = msg.senderId === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`group flex ${isSelf ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[70%] ${
                      isSelf
                        ? "bg-accent-600 text-white"
                        : "bg-gray-800 text-gray-200"
                    } rounded-2xl px-4 py-2`}
                  >
                    {msg.replyTo && (
                      <div className={`mb-1 rounded border-l-2 ${
                        isSelf ? "border-accent-300 bg-accent-700/30" : "border-gray-600 bg-gray-700/50"
                      } px-2 py-1 text-xs opacity-75`}>
                        {msg.replyTo.sender?.username}: {msg.replyTo.content}
                      </div>
                    )}
                    {msg.content && (
                      <p className="text-sm break-words">{msg.content}</p>
                    )}
                    {renderAttachment(msg)}
                    <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                      isSelf ? "text-accent-200" : "text-gray-500"
                    }`}>
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {renderReadReceipt(msg)}
                    </div>
                  </div>

                  <div className="ml-1 flex items-start opacity-0 group-hover:opacity-100">
                    <button
                      onClick={() => setReplyTo(msg)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-white"
                      title="Reply"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-gray-400">
          {conversation.otherUser?.username} is typing...
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-gray-800 bg-gray-900 px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400">
              Replying to <span className="font-medium text-gray-300">{replyTo.sender?.username}</span>
            </p>
            <p className="truncate text-xs text-gray-500">{replyTo.content}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-xs text-gray-500 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      <div className="border-t border-gray-800 p-3">
        <div className="flex items-end gap-2">
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-xl">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Photo / Video
                </button>
                <button
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".pdf,.doc,.docx,.txt";
                    input.onchange = (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (file) sendAttachment(file);
                    };
                    input.click();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Document
                </button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) sendAttachment(file);
              e.target.value = "";
            }}
          />

          <textarea
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="max-h-32 flex-1 resize-none rounded-xl border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-accent-500 focus:outline-none"
            rows={1}
          />

          <VoiceRecorder onRecordingComplete={sendVoiceMessage} disabled={isUploading} />

          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || isUploading}
            className="rounded-xl bg-accent-600 p-2.5 text-white transition-colors hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed"
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
