import { useEffect, useState, useRef, useCallback, Fragment } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { getSocket } from "@/lib/socket";
import api from "@/lib/api";
import { scrollBehavior } from "@/lib/motion";
import { dayKey } from "@/lib/time";
import { uploadErrorMessage, uploadMedia } from "@/lib/upload";
import { useToast } from "@/stores/toastStore";
import Avatar from "@/components/Avatar";
import ContextMenu, { ContextMenuItem, ContextMenuSeparator } from "@/components/ContextMenu";
import EmojiPicker, { EMOJI_CATEGORIES } from "@/components/EmojiPicker";
import Emoji from "@/components/Emoji";
import ChatDayDivider from "@/components/ChatDayDivider";
import type { Message, Reaction } from "@/types";

const EMOJI_SHORTCODE_RE = /;;([A-Za-z0-9_+\-]+);;/g;

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
  const [menu, setMenu] = useState<{ message: Message; x: number; y: number } | null>(null);
  // Right-click on the empty chat area: offers "paste image".
  const [chatMenu, setChatMenu] = useState<{ x: number; y: number } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  // Granted by the API on the message list: owners and anyone with
  // MANAGE_MESSAGES may delete other people's messages from the context menu.
  const [canManageMessages, setCanManageMessages] = useState(false);
  const toast = useToast();
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Distinguishes the channel currently on screen from one still loading, so a
  // slow response for a channel you already left cannot overwrite the view.
  const activeChannelRef = useRef<string | undefined>(channelId);
  // Only autoscroll when the reader was already at the bottom; otherwise a
  // 15 s poll yanks them away from the history they are reading.
  const shouldAutoScrollRef = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!channelId) return;
    const requestChannelId = channelId;
    try {
      const { data } = await api.get(`/messages/${requestChannelId}`);
      // The poll and the channel-switch fetch share this path, so a response
      // that arrives after the user switched channels is dropped rather than
      // written into the new channel's view.
      if (activeChannelRef.current !== requestChannelId) return;
      setMessages(data.messages);
      setCanManageMessages(Boolean(data.canManageMessages));
    } catch {
      // Silent: the next poll retries, and the messages already on screen stay.
    }
  }, [channelId]);

  useEffect(() => {
    activeChannelRef.current = channelId;
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
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      // Without this the socket stayed joined to every channel visited this
      // session and kept receiving its broadcasts.
      socket.emit("leave_channel", { channelId });
    };
  }, [channelId, user?.id, fetchMessages]);

  useEffect(() => {
    // Only follow new messages when the reader is already at the bottom.
    // Autoscrolling on every `messages` change meant the 15 s poll dragged the
    // view back down mid-scrollback.
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: scrollBehavior() });
    }
  }, [messages]);

  useEffect(() => {
    setEditingId(null);
    setEditContent("");
    setReplyTo(null);
    setFlashId(null);
    setMenu(null);
    setCanManageMessages(false);
    // `messages` and `typingUsers` carry the previous channel's state. Leaving
    // them in place meant a failed fetch left the old channel's history under
    // the new channel's header, and a typing indicator followed you across.
    setMessages([]);
    setTypingUsers([]);
    shouldAutoScrollRef.current = true;
  }, [channelId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !channelId) return;
    const socket = getSocket();
    socket.emit("typing_stop", { channelId });

    let content = newMessage;
    content = content.replace(EMOJI_SHORTCODE_RE, (_m, name) => {
      const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
      return all.find((e) => e === name || e === `:${name}:`) ?? _m;
    });
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
      // Only restores the composer if the user has not started typing again —
      // otherwise a failed send destroys whatever they wrote while it was in
      // flight.
      setNewMessage((current) => (current.trim() === "" ? content : current));
    }
  };

  /** Uploads one file and sends it as a channel message with an attachment. */
  const sendAttachment = async (file: File) => {
    if (isUploading || !channelId) return;
    setIsUploading(true);

    const tempId = `temp-${Date.now()}`;
    // A local object URL previews an image before the upload lands, and is
    // revoked below so the bytes are not held for the session.
    const objectUrl = file.type.startsWith("image") ? URL.createObjectURL(file) : null;
    const replyToId = replyTo?.id ?? null;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        content: file.name,
        authorId: user?.id ?? "",
        channelId,
        replyToId,
        edited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: user ?? undefined,
        reactions: [],
        attachments: [
          {
            id: tempId,
            filename: file.name,
            url: objectUrl ?? "",
            size: file.size,
            mimeType: file.type,
            messageId: tempId,
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ]);
    setReplyTo(null);

    try {
      const uploaded = await uploadMedia(file, file.name, { onProgress: setUploadPercent });
      await api.post("/messages", {
        content: file.name,
        channelId,
        replyToId: replyToId || null,
        attachment: {
          url: uploaded.url,
          type: uploaded.type,
          filename: uploaded.filename,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
        },
      });
    } catch (err) {
      // Without this the optimistic bubble lingers forever on a failed upload.
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      toast.error(uploadErrorMessage(err, "Upload failed"));
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUploadPercent(0);
      setIsUploading(false);
    }
  };

  const renderAttachments = (message: Message) => {
    if (!message.attachments || message.attachments.length === 0) return null;
    return (
      <div className="mt-1.5 flex flex-col gap-1.5">
        {message.attachments.map((attachment) => {
          if (!attachment.url) return null;
          if (attachment.mimeType.startsWith("image/")) {
            return (
              <img
                key={attachment.id}
                src={attachment.url}
                alt={attachment.filename}
                loading="lazy"
                className="max-h-80 max-w-sm rounded-lg border border-white/10 object-contain"
              />
            );
          }
          if (attachment.mimeType.startsWith("video/")) {
            return (
              <video
                key={attachment.id}
                src={attachment.url}
                controls
                className="max-h-80 max-w-sm rounded-lg border border-white/10"
              />
            );
          }
          return (
            <a
              key={attachment.id}
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-sm items-center gap-2 rounded-lg border border-gray-700 bg-gray-800/40 px-3 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-800/70"
            >
              {attachment.filename}
            </a>
          );
        })}
      </div>
    );
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
    document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    setFlashId(id);
    // Tracked so switching channels or unmounting cannot leave a timer
    // pointing at state that has moved on.
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    flashTimeoutRef.current = setTimeout(() => setFlashId((cur) => (cur === id ? null : cur)), 1500);
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      await api.post(`/messages/${messageId}/reactions`, { emoji });
    } catch {
      // silent
    }
  };

  const openMessageMenu = (event: React.MouseEvent, message: Message) => {
    // Optimistic rows have no server id yet, so their actions would 404.
    if (message.id.startsWith("temp-")) return;
    event.preventDefault();
    // Keep the message menu from also raising the chat-area "paste" menu.
    event.stopPropagation();
    setMenu({ message, x: event.clientX, y: event.clientY });
  };

  /** Right-click on the empty chat area (not on a message). */
  const openChatMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setChatMenu({ x: event.clientX, y: event.clientY });
  };

  const insertEmoji = (emoji: string) => {
    const el = composerRef.current;
    const start = el?.selectionStart ?? newMessage.length;
    const end = el?.selectionEnd ?? newMessage.length;
    setNewMessage(newMessage.slice(0, start) + emoji + newMessage.slice(end));
    handleTyping();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  const firstImageFile = (data: DataTransfer | null): File | null => {
    const fromItems = Array.from(data?.items ?? []).find(
      (entry) => entry.kind === "file" && entry.type.startsWith("image/")
    );
    const itemFile = fromItems?.getAsFile();
    if (itemFile) return itemFile;
    return Array.from(data?.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
  };

  /** Ctrl+V of an image sends it as an attachment. */
  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (isUploading) return;
    const file = firstImageFile(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void sendAttachment(file);
  };

  /** "Paste image" from the chat context menu, via the async Clipboard API. */
  const pasteImageFromClipboard = async () => {
    if (isUploading) return;
    if (!navigator.clipboard?.read) {
      toast.error("This browser cannot read the clipboard for paste");
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        await sendAttachment(new File([blob], "pasted-image", { type }));
        return;
      }
      toast.info("No image found on the clipboard");
    } catch {
      toast.error("Could not read the clipboard");
    }
  };

  const copyMessage = async (content: string) => {
    try {
      await navigator.clipboard?.writeText(content);
    } catch {
      // Clipboard can be blocked by permissions; nothing useful to show.
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

  /**
   * Records whether the reader is pinned to the bottom of the scroll area.
   *
   * The 15 s poll replaces the message array on every tick, so an unconditional
   * autoscroll pulled the view down even while someone was reading scrollback.
   */
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (!channelId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-800/60 text-gray-500">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 10.5h8M8 14h5m-4.5 6L12 17h5a3 3 0 003-3V6a3 3 0 00-3-3H7a3 3 0 00-3 3v8a3 3 0 003 3h.5z"
              />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-300">No channel selected</p>
          <p className="mt-1 text-sm text-gray-500">Pick one from the sidebar to start chatting.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 py-4" ref={scrollRef} onScroll={handleScroll} onContextMenu={openChatMenu}>
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-400">This channel is quiet</p>
              <p className="mt-1 text-sm text-gray-600">Be the first to say something.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((message, index) => {
              const showDivider =
                index === 0 ||
                dayKey(messages[index - 1].createdAt) !== dayKey(message.createdAt);
              return (
              <Fragment key={message.id}>
              {showDivider && <ChatDayDivider iso={message.createdAt} />}
              <div
                id={message.id.startsWith("temp-") ? undefined : `message-${message.id}`}
                onContextMenu={(event) => openMessageMenu(event, message)}
                className={`group relative flex gap-3 rounded-xl px-3 py-1.5 transition-colors duration-150 hover:bg-gray-800/40 ${
                  flashId === message.id ? "ring-1 ring-accent-400" : ""
                }`}
              >
                <Avatar user={message.author} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tracking-tight text-white">
                      {message.author?.username}
                    </span>
                    <span className="text-xs tabular-nums text-gray-600">
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {message.edited && (
                      <span className="text-xs text-gray-600">(edited)</span>
                    )}
                  </div>
                  {message.replyTo && (
                    <button
                      onClick={() => scrollToMessage(message.replyTo!.id)}
                      className="mb-1.5 mt-1 block rounded-lg border-l-2 border-accent-500 bg-gray-900/50 px-2.5 py-1.5 text-left text-xs text-gray-400 transition-colors hover:bg-gray-900 hover:text-gray-300"
                      title={`Reply to ${message.replyTo.author?.username ?? ""}`}
                    >
                      <span className="font-semibold text-accent-300">
                        {message.replyTo.author?.username}
                      </span>{" "}
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
                        className="field py-2"
                        autoFocus
                      />
                      <p className="mt-1.5 text-[10px] text-gray-500">
                        <button
                          onClick={() => {
                            setEditingId(null);
                            setEditContent("");
                          }}
                          className="font-semibold text-gray-400 underline-offset-2 hover:text-white hover:underline"
                        >
                          escape
                        </button>{" "}
                        to cancel ·{" "}
                        <button
                          onClick={() => void editMessage(message.id)}
                          className="font-semibold text-gray-400 underline-offset-2 hover:text-white hover:underline"
                        >
                          enter
                        </button>{" "}
                        to save
                      </p>
                    </div>
                  ) : (
                    <>
                      {message.content && (
                        <p className="break-words leading-relaxed text-gray-200">{message.content}</p>
                      )}
                      {renderAttachments(message)}
                    </>
                  )}

                  {message.reactions && message.reactions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {message.reactions.map((reaction) => (
                        <button
                          key={reaction.id}
                          onClick={() => toggleReaction(message.id, reaction.emoji)}
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
                </div>

                {editingId !== message.id && !message.id.startsWith("temp-") && (
                  <div className="absolute -top-3 right-2 z-10 transition-opacity">
                    <div className="glass-panel flex items-center rounded-xl px-1 py-0.5 opacity-0 shadow-elev3 group-hover:opacity-100 focus-within:opacity-100">
                      {quickReactions.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(message.id, emoji)}
                          className="icon-btn !h-7 !w-7"
                          title={`React ${emoji}`}
                        >
                          <Emoji emoji={emoji} className="h-5 w-5" decorative />
                        </button>
                      ))}
                      <button
                        onClick={() => setReplyTo(message)}
                        className="icon-btn !h-7 !w-7"
                        title="Reply"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                      {message.authorId === user?.id && (
                        <button
                          onClick={() => {
                            setEditingId(message.id);
                            setEditContent(message.content);
                          }}
                          className="icon-btn !h-7 !w-7"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      {(message.authorId === user?.id || canManageMessages) && (
                        <button
                          onClick={() => void deleteMessage(message.id)}
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
              </Fragment>
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
          Someone is typing…
        </div>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 border-t border-gray-800/70 bg-gray-900/40 px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate text-xs text-gray-400">
            Replying to{" "}
            <span className="font-semibold text-gray-200">{replyTo.author?.username}</span>:{" "}
            {replyTo.content}
          </span>
          <button onClick={() => setReplyTo(null)} className="icon-btn !h-6 !w-6" aria-label="Cancel reply">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
        <div className="glass-panel flex items-end gap-2 rounded-2xl p-2">
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker((current) => !current)}
              className="icon-btn"
              aria-label="Insert emoji"
              title="Emoji"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
            {showEmojiPicker && (
              <>
                <div className="fixed inset-0 z-10" onMouseDown={() => setShowEmojiPicker(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-gray-700/60 bg-gray-950/95 p-1.5 shadow-elev2">
                  <EmojiPicker maxHeight={192} onSelect={insertEmoji} />
                </div>
              </>
            )}
          </div>
          <textarea
            ref={composerRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Type a message..."
            aria-label="Message"
            className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none"
            rows={1}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
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
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} width={288} dark>
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
          {menu.message.authorId === user?.id && (
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
          {(menu.message.authorId === user?.id || canManageMessages) && (
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

      {chatMenu && (
        <ContextMenu x={chatMenu.x} y={chatMenu.y} onClose={() => setChatMenu(null)}>
          <ContextMenuItem
            label="Paste image"
            icon={
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            }
            onClick={() => {
              void pasteImageFromClipboard();
              setChatMenu(null);
            }}
          />
        </ContextMenu>
      )}
    </div>
  );
}
