import { useEffect, useState, useRef, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useCallStore } from "@/stores/callStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { scrollBehavior } from "@/lib/motion";
import VoiceRecorder from "@/components/VoiceRecorder";
import Avatar from "@/components/Avatar";
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from "@/components/ContextMenu";
import UserContextMenu from "@/components/UserContextMenu";
import EmojiPicker from "@/components/EmojiPicker";
import Emoji from "@/components/Emoji";
import { useToast } from "@/stores/toastStore";
import { useDmPrefsStore } from "@/stores/dmPrefsStore";
import { useBlocksStore } from "@/stores/blocksStore";
import type { Conversation, DirectMessage, DirectReaction } from "@/types";

interface Props {
  conversation: Conversation;
  onConversationUpdated?: (conversation: Conversation) => void;
}

export default function DMChatArea({ conversation, onConversationUpdated }: Props) {
  const user = useAuthStore((s) => s.user);
  const initiateCall = useCallStore((s) => s.initiateCall);
  const toggleDmMute = useDmPrefsStore((s) => s.toggleMute);
  const dmMarkRead = useDmPrefsStore((s) => s.markRead);
  const dmMuted = useDmPrefsStore((s) => s.isMuted(conversation.id));
  const otherUserId = conversation.otherUser?.id ?? "";
  const blocked = useBlocksStore((s) => s.isBlocked(otherUserId));
  const loadBlocks = useBlocksStore((s) => s.load);
  const isPendingRequest = conversation.status === "pending";
  const amRequester = conversation.requestSenderId === user?.id;
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ message: DirectMessage; x: number; y: number } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number } | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // 0-100 while an upload is in flight; reset to 0 when idle.
  const [uploadPercent, setUploadPercent] = useState(0);
  const toast = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  // The conversation currently on screen, so a response for one already left
  // behind cannot overwrite the thread that replaced it.
  const activeConversationRef = useRef(conversation.id);

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  const markAsRead = useCallback(async () => {
    try {
      await api.patch(`/dms/${conversation.id}/read`);
    } catch {
      // silent
    }
  }, [conversation.id]);

  const fetchMessages = useCallback(async () => {
    const requestConversationId = conversation.id;
    try {
      const { data } = await api.get(`/dms/${requestConversationId}`);
      // The component is reused across conversations, so a slow response for
      // the thread you just left would otherwise land in the one now open.
      if (activeConversationRef.current !== requestConversationId) return;
      const next = data.messages as DirectMessage[];
      setMessages(next);

      // Only write when something is actually unread. This runs on a 15s
      // poll, so an unconditional PATCH meant a database write plus two
      // socket broadcasts every tick, forever, even for a quiet thread.
      if (next.some((m) => m.senderId !== user?.id && !m.readAt)) {
        void markAsRead();
      }
    } catch {
      // Silent: the next poll retries, and the messages already on screen stay.
    }
  }, [conversation.id, markAsRead, user?.id]);

  useEffect(() => {
    activeConversationRef.current = conversation.id;
    fetchMessages();
    const socket = getSocket();
    socket.emit("dm_join", { conversationId: conversation.id });

    const rejoin = () => {
      socket.emit("dm_join", { conversationId: conversation.id });
      void fetchMessages();
    };
    socket.on("connect", rejoin);

    // Single upsert used by every realtime event so a message can never
    // appear twice (optimistic temp + server echo racing each other).
    const upsertMessage = (incoming: DirectMessage) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === incoming.id)) {
          return prev.map((m) => (m.id === incoming.id ? incoming : m));
        }
        const optimisticIndex = prev.findIndex(
          (m) =>
            m.id.startsWith("temp-") &&
            m.senderId === incoming.senderId &&
            m.content.trim() === incoming.content.trim()
        );
        if (optimisticIndex !== -1) {
          const next = [...prev];
          next[optimisticIndex] = incoming;
          return next;
        }
        return [...prev, incoming];
      });
    };

    const handleNewDM = (message: DirectMessage) => {
      if (message.conversationId !== conversation.id) return;
      upsertMessage(message);
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
      // Only the OTHER participant reading your messages turns YOUR ticks
      // blue. The dm_read broadcast includes your own reads (readBy === me),
      // which must not mark your outgoing messages as read.
      if (data.conversationId !== conversation.id || data.readBy === user?.id) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.senderId === user?.id && !m.readAt
            ? { ...m, readAt: new Date().toISOString() }
            : m
        )
      );
    };

    const handleReadReceipt = handleRead;

    const handleEdited = (data: { conversationId: string; message: DirectMessage }) => {
      if (data.conversationId !== conversation.id) return;
      setMessages((prev) => prev.map((m) => (m.id === data.message.id ? data.message : m)));
    };

    const handleDeleted = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId !== conversation.id) return;
      setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
      setReplyTo((cur) => (cur?.id === data.messageId ? null : cur));
    };

    const handleDMUpdated = (data: {
      conversationId: string;
      message: DirectMessage;
    }) => {
      if (data.conversationId !== conversation.id) return;
      upsertMessage(data.message);
      if (data.message.senderId !== user?.id) {
        markAsRead();
      }
    };

    const handleReactionsUpdated = (data: {
      conversationId: string;
      messageId: string;
      reactions: DirectReaction[];
    }) => {
      if (data.conversationId !== conversation.id) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === data.messageId ? { ...m, reactions: data.reactions } : m))
      );
    };

    socket.on("new_dm", handleNewDM);
    socket.on("dm_updated", handleDMUpdated);
    socket.on("dm_message_edited", handleEdited);
    socket.on("dm_message_deleted", handleDeleted);
    socket.on("dm_reactions_updated", handleReactionsUpdated);
    socket.on("dm_typing_start", handleTypingStart);
    socket.on("dm_typing_stop", handleTypingStop);
    socket.on("dm_read", handleRead);
    socket.on("dm_read_receipt", handleReadReceipt);

    const pollId = setInterval(() => void fetchMessages(), 15000);

    return () => {
      socket.off("new_dm", handleNewDM);
      socket.off("dm_updated", handleDMUpdated);
      socket.off("dm_message_edited", handleEdited);
      socket.off("dm_message_deleted", handleDeleted);
      socket.off("dm_reactions_updated", handleReactionsUpdated);
      socket.off("dm_typing_start", handleTypingStart);
      socket.off("dm_typing_stop", handleTypingStop);
      socket.off("dm_read", handleRead);
      socket.off("dm_read_receipt", handleReadReceipt);
      socket.off("connect", rejoin);
      clearInterval(pollId);
      // Both timers are cleared here; left running they survive the effect and
      // then fire against state that has already moved on to another thread.
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      socket.emit("dm_leave", { conversationId: conversation.id });
    };
  }, [conversation.id, user?.id, fetchMessages, markAsRead]);

  useEffect(() => {
    setEditingId(null);
    setEditContent("");
    setReplyTo(null);
    setFlashId(null);
    setMenu(null);
    setHeaderMenu(null);
    // These carry the previous thread's state. Clearing them stops a failed
    // fetch from leaving one person's private messages under another person's
    // name, and stops the typing indicator from following you across — it is
    // labelled with the *current* conversation's user, so a leaked entry
    // accuses the wrong person.
    setMessages([]);
    setTypingUsers([]);
    setShouldAutoScroll(true);
  }, [conversation.id]);

  useEffect(() => {
    if (shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    }
  }, [messages, shouldAutoScroll]);

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
  };

  const sendMessage = async () => {
    if (blocked || !newMessage.trim()) return;
    const socket = getSocket();
    socket.emit("dm_typing_stop", { conversationId: conversation.id });

    const content = newMessage;
    const tempId = `temp-${Date.now()}`;
    setNewMessage("");
    setReplyTo(null);
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content,
        senderId: user?.id ?? "",
        conversationId: conversation.id,
        attachmentUrl: null,
        attachmentType: null,
        replyToId: replyTo?.id ?? null,
        edited: false,
        readAt: null,
        deliveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: user ?? undefined,
        replyTo: replyTo ?? undefined,
      },
    ]);

    try {
      await api.post(`/dms/${conversation.id}`, {
        content,
        replyToId: replyTo?.id || null,
      });
      if (isPendingRequest && !amRequester) {
        onConversationUpdated?.({ ...conversation, status: "active", requestSenderId: null });
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Restores the composer only when the user has not started typing again,
      // so a failed send cannot destroy what they wrote in the meantime.
      setNewMessage((current) => (current.trim() === "" ? content : current));
    }
  };

  const acceptRequestInline = async () => {
    try {
      await api.post(`/dms/${conversation.id}/accept`);
      onConversationUpdated?.({ ...conversation, status: "active", requestSenderId: null });
    } catch {
      // silent
    }
  };

  const sendAttachment = async (file: File) => {
    // One upload at a time: a second click while the first is in flight would
    // otherwise send the same file twice.
    if (isUploading) return;

    setIsUploading(true);
    setShowAttachMenu(false);

    const tempId = `temp-${Date.now()}`;
    const previewType = file.type.startsWith("image")
      ? "image"
      : file.type.startsWith("video")
      ? "video"
      : file.type.startsWith("audio")
      ? "audio"
      : "file";

    // A local object URL shows the image immediately instead of waiting for
    // the round trip. It is revoked below in a finally block so the blob is
    // not retained for the life of the tab.
    const objectUrl = previewType === "image" ? URL.createObjectURL(file) : null;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content: file.name,
        senderId: user?.id ?? "",
        conversationId: conversation.id,
        attachmentUrl: objectUrl,
        attachmentType: previewType,
        replyToId: null,
        edited: false,
        readAt: null,
        deliveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: user ?? undefined,
        replyTo: undefined,
      },
    ]);

    try {
      const uploaded = await uploadMedia(file, file.name, {
        onProgress: setUploadPercent,
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempId
            ? {
                ...m,
                attachmentUrl: uploaded.url,
                attachmentType: uploaded.type,
                attachmentPublicId: uploaded.publicId ?? null,
              }
            : m
        )
      );

      await api.post(`/dms/${conversation.id}`, {
        content: file.name,
        attachmentUrl: uploaded.url,
        attachmentType: uploaded.type,
        attachmentPublicId: uploaded.publicId ?? undefined,
      });
    } catch (err) {
      // The optimistic bubble is removed; without this the user is left with a
      // permanent phantom message.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(uploadErrorMessage(err, "Upload failed"));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUploadPercent(0);
      setIsUploading(false);
    }
  };

  const sendVoiceMessage = async (blob: Blob) => {
    setIsUploading(true);

    const tempId = `temp-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content: "Voice message",
        senderId: user?.id ?? "",
        conversationId: conversation.id,
        attachmentUrl: null,
        attachmentType: "audio",
        replyToId: null,
        edited: false,
        readAt: null,
        deliveredAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: user ?? undefined,
        replyTo: undefined,
      },
    ]);

    try {
      // Voice notes never reach Cloudinary — it would re-encode or reject
      // them — so they use the configured MEDIA_PROVIDER backend and come
      // back as a /uploads path with no public ID to clean up later.
      const uploaded = await uploadMedia(
        new Blob([blob], { type: "audio/webm" }),
        "voice-message.webm"
      );

      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, attachmentUrl: uploaded.url } : m))
      );

      await api.post(`/dms/${conversation.id}`, {
        content: "Voice message",
        attachmentUrl: uploaded.url,
        attachmentType: "audio",
      });
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      // Silent before: a dropped voice note looked like the recorder had just
      // not worked, with nothing on screen saying so.
      toast.error(uploadErrorMessage(err, "Could not send your voice message"));
    } finally {
      setIsUploading(false);
    }
  };

  const scrollToMessage = (id: string) => {
    document.getElementById(`dm-message-${id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    setFlashId(id);
    // Tracked and cleared on unmount: an untracked timer outlives the component
    // and can clear a flashId belonging to a conversation opened in the
    // meantime.
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(
      () => setFlashId((cur) => (cur === id ? null : cur)),
      1500
    );
  };

  const editMessage = async (messageId: string) => {
    if (!editContent.trim() || messageId.startsWith("temp-")) return;
    try {
      const { data } = await api.patch(`/dms/${messageId}`, { content: editContent });
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
      await api.delete(`/dms/${messageId}`);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      setReplyTo((cur) => (cur?.id === messageId ? null : cur));
    } catch {
      // silent
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      await api.post(`/dms/${messageId}/reactions`, { emoji });
    } catch {
      // silent
    }
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard?.writeText(content);
    } catch {
      // Clipboard can be blocked by permissions; nothing useful to show.
    }
  };

  const openMessageMenu = (event: React.MouseEvent, message: DirectMessage) => {
    if (message.id.startsWith("temp-")) return;
    event.preventDefault();
    setMenu({ message, x: event.clientX, y: event.clientY });
  };

  const openHeaderMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    // A keyboard-triggered button reports 0,0 rather than a point; anchor below
    // the control instead so the menu still appears next to it.
    const fromButton = event.clientX === 0 && event.clientY === 0;
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setHeaderMenu({
      x: fromButton ? Math.max(8, rect.right - 224) : event.clientX,
      y: fromButton ? rect.bottom + 6 : event.clientY,
    });
  };

  const handleMarkRead = () => {
    dmMarkRead(conversation.id);
    void markAsRead();
    setHeaderMenu(null);
  };

  const handleToggleMute = () => {
    toggleDmMute(conversation.id);
    setHeaderMenu(null);
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
      setEditingId(null);
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
    return <span className="text-accent-300">✓✓</span>;
  };

  const renderAttachment = (msg: DirectMessage) => {
    if (!msg.attachmentUrl) return null;

    if (msg.attachmentType === "image") {
      return (
        <div className="mt-2 max-w-full">
          {msg.id.startsWith("temp-") && (
            <div className="mb-1 text-[10px] text-gray-400">Uploading…</div>
          )}
          <img
            src={msg.attachmentUrl}
            alt="Shared image"
            // max-w-full + h-auto keeps a wide image inside the bubble instead
            // of forcing the chat column wider; the rounded corners match the
            // rest of the message styling.
            className="block max-h-80 max-w-full rounded-lg border border-white/10 object-contain"
            loading="lazy"
          />
        </div>
      );
    }

    if (msg.attachmentType === "video") {
      return (
        <div className="mt-2 max-w-full">
          <video
            src={msg.attachmentUrl}
            controls
            className="max-h-80 max-w-full rounded-lg border border-white/10"
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
        className="mt-2 flex items-center gap-2 self-start rounded-full border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-sm text-accent-300 transition-all duration-200 ease-out hover:border-gray-600 hover:bg-gray-800 hover:text-accent-200"
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
      <div
        onContextMenu={openHeaderMenu}
        className="glass sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3"
      >
        <div className="relative">
          <Avatar user={conversation.otherUser} className="h-9 w-9 text-sm" />
          <div
            className={`status-dot bottom-0 right-0 h-2.5 w-2.5 ${
              conversation.otherUser?.status === "online"
                ? "bg-green-500"
                : conversation.otherUser?.status === "idle"
                ? "bg-amber-400"
                : "bg-gray-500"
            }`}
          />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-white">{conversation.otherUser?.username}</p>
          <p className="text-xs capitalize text-gray-400">{conversation.otherUser?.status || "offline"}</p>
        </div>
<div className="ml-auto flex items-center gap-2">
          {conversation.otherUser && (
            <>
              <button
                onClick={() => initiateCall(conversation.otherUser!.id, conversation.otherUser!, "voice")}
                className="icon-btn"
                title="Voice call"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a1 1 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
              <button
                onClick={() => initiateCall(conversation.otherUser!.id, conversation.otherUser!, "video")}
                className="icon-btn"
                title="Video call"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </>
          )}
          <button onClick={openHeaderMenu} className="icon-btn" title="More options" aria-label="More options">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" />
            </svg>
          </button>
        </div>
      </div>

      {isPendingRequest && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-800/70 bg-amber-500/10 px-4 py-2">
          <p className="text-xs text-amber-200">
            {amRequester
              ? `Waiting for ${conversation.otherUser?.username ?? "them"} to accept your message request.`
              : `Message request from ${conversation.otherUser?.username ?? "this user"}. Replying will accept it.`}
          </p>
          {!amRequester && (
            <button
              onClick={() => void acceptRequestInline()}
              className="shrink-0 rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300 ring-1 ring-inset ring-green-400/30 transition-all duration-200 ease-out hover:bg-green-500/25"
            >
              Accept
            </button>
          )}
        </div>
      )}

      <div
        ref={chatContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
      >
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-400">No messages yet</p>
              <p className="mt-1 text-sm text-gray-600">
                Send a message to start the conversation.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => {
              const isSelf = msg.senderId === user?.id;
              const isFlashing = flashId === msg.id;
              return (
                <div
                  key={msg.id}
                  id={msg.id.startsWith("temp-") ? undefined : `dm-message-${msg.id}`}
                  onContextMenu={(event) => openMessageMenu(event, msg)}
                  className={`group flex rounded-xl px-3 py-1.5 transition-colors duration-150 ease-out hover:bg-gray-800/40 ${
                    isSelf ? "justify-end" : "justify-start"
                  }`}
                >
                  <div className="relative max-w-[70%]">
                    <div
                      className={`rounded-2xl px-4 py-2 ${
                        isFlashing ? "ring-2 ring-accent-400" : ""
                      } ${isSelf ? "bg-accent-600 text-white shadow-glow" : "glass-card text-gray-200"}`}
                    >
                      {msg.replyTo && (
                        <button
                          onClick={() => scrollToMessage(msg.replyTo!.id)}
                          className={`mb-1 block rounded-lg border-l-2 transition-colors duration-200 ease-out ${
                            isSelf
                              ? "border-accent-300 bg-accent-500/20 text-accent-100"
                              : "border-gray-600 bg-gray-900/50 text-gray-300 hover:bg-gray-900"
                          } px-2.5 py-1.5 text-left text-xs opacity-80 hover:opacity-100`}
                          title={`Reply to ${msg.replyTo.sender?.username ?? ""}`}
                        >
                          <span className="font-semibold">
                            {msg.replyTo.sender?.username}:{" "}
                          </span>
                          {msg.replyTo.content}
                        </button>
                      )}
                      {editingId === msg.id ? (
                        <div className="min-w-[220px]">
                          <input
                            type="text"
                            value={editContent}
                            autoFocus
                            onChange={(e) => setEditContent(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                void editMessage(msg.id);
                              }
                              if (e.key === "Escape") {
                                setEditingId(null);
                                setEditContent("");
                              }
                            }}
                            className="field py-1.5 text-sm"
                          />
                          <p className="mt-0.5 text-[10px] text-gray-500">
                            <button
                              onClick={() => {
                                setEditingId(null);
                                setEditContent("");
                              }}
                              className="font-semibold underline-offset-2 hover:text-white hover:underline"
                            >
                              escape
                            </button>{" "}
                            to cancel ·{" "}
                            <button
                              onClick={() => void editMessage(msg.id)}
                              className="font-semibold underline-offset-2 hover:text-white hover:underline"
                            >
                              enter
                            </button>{" "}
                            to save
                          </p>
                        </div>
                      ) : (
                        <>
                          {msg.content && <p className="text-sm break-words">{msg.content}</p>}
                          {renderAttachment(msg)}
                        </>
                      )}
                      <div
                        className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${
                          isSelf ? "text-accent-200" : "text-gray-500"
                        }`}
                      >
                        {msg.edited && <span className="opacity-70">(edited)</span>}
                        <span className="tabular">{formatMessageTime(msg.createdAt)}</span>
                        {renderReadReceipt(msg)}
                      </div>
                    </div>

                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${isSelf ? "justify-end" : "justify-start"}`}>
                        {msg.reactions.map((reaction) => (
                          <button
                            key={reaction.id}
                            onClick={() => void toggleReaction(msg.id, reaction.emoji)}
                            className={`rounded-full border px-2 py-0.5 text-xs tabular-nums transition-all duration-150 ${
                              reaction.userId === user?.id
                                ? "border-accent-400 bg-accent-500/20 text-accent-200"
                                : "border-gray-700 bg-gray-800/60 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                            }`}
                          >
                            <Emoji emoji={reaction.emoji} className="h-4 w-4" />
                          </button>
                        ))}
                      </div>
                    )}

                    {editingId !== msg.id && !msg.id.startsWith("temp-") && (
                      <div className="absolute -top-3.5 right-0 z-10 transition-opacity">
                        <div className="glass-panel flex items-center rounded-xl px-1 py-0.5 opacity-0 shadow-elev3 group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            onClick={() => setReplyTo(msg)}
                            className="icon-btn !h-7 !w-7"
                            title="Reply"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                          </button>
                          {isSelf && (
                            <button
                              onClick={() => {
                                setEditingId(msg.id);
                                setEditContent(msg.content);
                              }}
                              className="icon-btn !h-7 !w-7"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                          )}
                          {isSelf && (
                            <button
                              onClick={() => void deleteMessage(msg.id)}
                              className="icon-btn !h-7 !w-7 hover:!text-red-400"
                              title="Delete"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {typingUsers.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-1 text-xs text-gray-400">
          {/* Three-dot typing indicator — a stagger rather than a static row so
              it reads as "active", not as stray punctuation. */}
          <span className="flex gap-0.5" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 w-1 animate-pulse rounded-full bg-accent-400"
                style={{ animationDelay: `${i * 160}ms` }}
              />
            ))}
          </span>
          {conversation.otherUser?.username} is typing...
        </div>
      )}

      {replyTo && (
        <div
          key={replyTo.id}
          className="anim-reply-in flex items-center gap-2 border-t border-gray-800/70 bg-gray-900/40 px-4 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400">
              Replying to{" "}
              <span className="font-semibold text-gray-200">{replyTo.sender?.username}</span>
            </p>
            <p className="truncate text-xs text-gray-500">{replyTo.content}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="icon-btn !h-6 !w-6 text-xs"
            aria-label="Cancel reply"
          >
            ✕
          </button>
        </div>
      )}

      {blocked && (
        <div className="border-t border-gray-800/70 bg-red-500/10 px-4 py-2">
          <p className="text-xs text-red-200">
            You blocked {conversation.otherUser?.username ?? "this user"}. Unblock them from the menu above to send messages.
          </p>
        </div>
      )}

      <div className="p-4 pt-2">
        {isUploading && (
          <div className="mb-2" role="status" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
              <div
                className="h-full rounded-full bg-accent-500 transition-all"
                style={{ width: `${uploadPercent || 5}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Uploading… <span className="tabular">{uploadPercent}%</span>
            </p>
          </div>
        )}
        {/* Frosted composer. The controls sit directly on the panel instead of
            each carrying their own fill, so the whole row reads as one
            surface you type into. */}
        <div className="glass-panel flex items-end gap-2 rounded-2xl p-2">
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              disabled={isUploading}
              className="icon-btn disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Attach a file"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            {showAttachMenu && (
              <div className="glass-panel layer-popup animate-pop-in absolute bottom-full left-0 mb-2 w-48 rounded-xl py-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors duration-200 ease-out hover:bg-white/5 hover:text-white"
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
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-300 transition-colors duration-200 ease-out hover:bg-white/5 hover:text-white"
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
              // Reset so picking the same file twice still fires onChange.
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
            placeholder={blocked ? "You blocked this user" : "Type a message..."}
            disabled={blocked}
            className="min-h-[2.75rem] max-h-32 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none disabled:cursor-not-allowed"
            rows={1}
          />

          <VoiceRecorder onRecordingComplete={sendVoiceMessage} disabled={isUploading || blocked} />

          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || isUploading || blocked}
            className="btn-primary !h-11 !w-11 shrink-0 !p-0"
            aria-label="Send message"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} width={288}>
          <p className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            React
          </p>
          <EmojiPicker
            maxHeight={176}
            onSelect={(emoji) => {
              void toggleReaction(menu.message.id, emoji);
              setMenu(null);
            }}
          />
          <ContextMenuSeparator />
          <ContextMenuItem
            label="Reply"
            icon={
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            }
            onClick={() => {
              setReplyTo(menu.message);
              setMenu(null);
            }}
          />
          <ContextMenuItem
            label="Copy text"
            icon={
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
            onClick={() => {
              void copyMessage(menu.message.content);
              setMenu(null);
            }}
          />
          {menu.message.senderId === user?.id && (
            <ContextMenuItem
              label="Edit"
              icon={
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
              onClick={() => {
                setEditingId(menu.message.id);
                setEditContent(menu.message.content);
                setMenu(null);
              }}
            />
          )}
          {menu.message.senderId === user?.id && (
            <ContextMenuItem
              label="Delete message"
              danger
              icon={
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              }
              onClick={() => {
                void deleteMessage(menu.message.id);
                setMenu(null);
              }}
            />
          )}
        </ContextMenu>
      )}

      {headerMenu && conversation.otherUser && (
        <UserContextMenu
          user={conversation.otherUser}
          x={headerMenu.x}
          y={headerMenu.y}
          conversationId={conversation.id}
          muted={dmMuted}
          onMarkRead={handleMarkRead}
          onToggleMute={handleToggleMute}
          onClose={() => setHeaderMenu(null)}
        />
      )}
    </div>
  );
}
