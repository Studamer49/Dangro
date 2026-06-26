import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import socket from "../services/socket";
import { api } from "../services/api";

const MOCK_YOUTUBE_VIDEOS = [
  { id: "dQw4w9WgXcQ", title: "Rick Astley - Never Gonna Give You Up (Official Music Video)", channelName: "Rick Astley", views: "1.4B views", likes: "17M likes", thumbnail: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&w=400&q=80" },
  { id: "jfKfPfyJRdk", title: "lofi hip hop radio - beats to relax/study to", channelName: "Lofi Girl", views: "68M views", likes: "2.3M likes", thumbnail: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=400&q=80" },
  { id: "2g811Eo7K8U", title: "Modern Web Design Aesthetics - CSS Secrets", channelName: "AestheticCodes", views: "154K views", likes: "12K likes", thumbnail: "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=400&q=80" },
];

const MOCK_INSTAGRAM_POSTS = [
  { id: "ig1", username: "design_inspiration", userAvatarColor: "#555555", image: "https://images.unsplash.com/photo-1541462608141-2f5287b4e93d?auto=format&fit=crop&w=500&q=80", likes: 1243, caption: "Clean dashboard concepts. Minimalist, functional. What do you think? #uidesign #minimal", liked: false, comments: [{ username: "pixel_craft", text: "Wow, the colors are amazing!" }, { username: "ux_lily", text: "Love the clean design." }] },
  { id: "ig2", username: "setup_goals", userAvatarColor: "#444444", image: "https://images.unsplash.com/photo-1547082299-de196ea013d6?auto=format&fit=crop&w=500&q=80", likes: 852, caption: "Late night coding session. Clean vibes only! Rate this setup 1-10.", liked: true, comments: [{ username: "coder_dan", text: "Solid 10/10, keyboard specs?" }, { username: "neon_vibes", text: "That setup is perfect." }] },
];

const MOCK_REPLIES = [
  "Oh that's awesome!", "Nice! Tell me more.", "Haha, for real 😂", "I'm testing the new features.",
  "Did you check the video player?", "Sounds great!", "I'll review this later.", "CSS grids are magic.",
  "Love the new design!", "Keep up the great work!",
];

const initialState = {
  user: null,
  servers: [],
  friends: [],
  groupChats: [],
  messages: {},
  activeChatType: "channel",
  activeServerId: "dangro-hq",
  activeChannelId: "general",
  activeDmFriendId: null,
  activeGroupChatId: null,
  activeNavTab: "servers",
  activeLeftTab: "youtube-client",
  activeFriendSubtab: "online",
  displayName: "You",
  bio: "",
  status: "online",
  customStatus: "",
  profilePic: "",
  leftPanelWidth: 25,
  rightPanelWidth: 18.75,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  friendSearchQuery: "",
  chatSearchQuery: "",
  youtubeVideos: MOCK_YOUTUBE_VIDEOS,
  instagramPosts: MOCK_INSTAGRAM_POSTS,
  activeYtVideoId: "dQw4w9WgXcQ",
  toasts: [],
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_USER":
      return { ...state, user: action.payload };
    case "SET_SERVERS":
      return { ...state, servers: action.payload };
    case "SET_FRIENDS":
      return { ...state, friends: action.payload };
    case "SET_GROUP_CHATS":
      return { ...state, groupChats: action.payload };
    case "SET_MESSAGES":
      return { ...state, messages: { ...state.messages, [action.chatKey]: action.payload } };
    case "ADD_MESSAGE":
      return { ...state, messages: { ...state.messages, [action.chatKey]: [...(state.messages[action.chatKey] || []), action.payload] } };
    case "SET_ACTIVE_CHAT":
      return { ...state, ...action.payload };
    case "SET_NAV_TAB":
      return { ...state, activeNavTab: action.payload };
    case "SET_LEFT_TAB":
      return { ...state, activeLeftTab: action.payload };
    case "SET_FRIEND_SUBTAB":
      return { ...state, activeFriendSubtab: action.payload };
    case "SET_LAYOUT":
      return { ...state, ...action.payload };
    case "SET_PROFILE":
      return { ...state, ...action.payload };
    case "SET_FRIEND_SEARCH":
      return { ...state, friendSearchQuery: action.payload };
    case "SET_CHAT_SEARCH":
      return { ...state, chatSearchQuery: action.payload };
    case "SET_YT_VIDEO":
      return { ...state, activeYtVideoId: action.payload };
    case "TOGGLE_IG_LIKE": {
      const posts = state.instagramPosts.map(p =>
        p.id === action.payload ? { ...p, liked: !p.liked, likes: p.liked ? p.likes - 1 : p.likes + 1 } : p
      );
      return { ...state, instagramPosts: posts };
    }
    case "ADD_IG_COMMENT": {
      const posts = state.instagramPosts.map(p =>
        p.id === action.payload.postId ? { ...p, comments: [...p.comments, { username: "dangro_user", text: action.payload.text }] } : p
      );
      return { ...state, instagramPosts: posts };
    }
    case "ADD_YOUTUBE_VIDEO":
      return { ...state, youtubeVideos: [...state.youtubeVideos, action.payload] };
    case "ADD_TOAST":
      return { ...state, toasts: [...state.toasts, action.payload] };
    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case "RESET":
      return { ...initialState, user: null };
    default:
      return state;
  }
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [persisted, setPersisted] = useLocalStorage("dangro_state_v3", {});
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...persisted });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const { user, servers, friends, groupChats, messages, ...layoutState } = state;
    if (state.user) {
      setPersisted(layoutState);
    }
  }, [state]);

  useEffect(() => {
    const session = localStorage.getItem("dangro_session");
    if (session) {
      try {
        const parsed = JSON.parse(session);
        if (parsed.loggedIn) {
          dispatch({ type: "SET_USER", payload: { username: parsed.username } });
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (state.user) {
      api.servers.list().then(servers => dispatch({ type: "SET_SERVERS", payload: servers })).catch(() => {});
      api.friends.list().then(friends => dispatch({ type: "SET_FRIENDS", payload: friends })).catch(() => {});
      socket.connect();
      return () => { socket.disconnect(); };
    }
  }, [state.user]);

  useEffect(() => {
    socket.on("message:new", (msg) => {
      const chatKey = getActiveChatKey(stateRef.current);
      if (msg.sender !== stateRef.current.displayName) {
        dispatch({ type: "ADD_MESSAGE", chatKey: getChatKeyFromMsg(stateRef.current, msg), payload: msg });
        triggerMockReply(stateRef.current, msg);
      }
    });
    return () => { socket.off("message:new"); };
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await api.auth.login(username, password);
    localStorage.setItem("dangro_session", JSON.stringify({ loggedIn: true, username: result.username, timestamp: Date.now() }));
    dispatch({ type: "SET_USER", payload: { username: result.username } });
    return result;
  }, []);

  const guestLogin = useCallback(async () => {
    const result = await api.auth.guest();
    localStorage.setItem("dangro_session", JSON.stringify({ loggedIn: true, username: "guest", timestamp: Date.now() }));
    dispatch({ type: "SET_USER", payload: { username: "guest" } });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("dangro_session");
    localStorage.removeItem("dangro_state_v3");
    dispatch({ type: "RESET" });
  }, []);

  const loadMessages = useCallback(async (chatKey) => {
    try {
      const messages = await api.messages.list(chatKey);
      dispatch({ type: "SET_MESSAGES", chatKey, payload: messages });
    } catch {}
  }, []);

  const sendMessage = useCallback(async (content, isImage = false, replyTo = null) => {
    const s = stateRef.current;
    const chatKey = getActiveChatKey(s);
    socket.emit("message:send", { chatKey, sender: s.displayName, content, isImage, replyTo });
  }, []);

  const triggerMockReply = useCallback((s, userMsg) => {
    const chatKey = getActiveChatKey(s);
    let replyName = "pixel_alex";
    if (s.activeChatType === "channel") {
      const pool = s.friends.filter(f => f.status !== "offline");
      if (pool.length) replyName = pool[Math.floor(Math.random() * pool.length)].username;
    } else if (s.activeChatType === "dm") {
      const friend = s.friends.find(f => f.id === s.activeDmFriendId);
      if (friend) replyName = friend.username;
    } else if (s.activeChatType === "group") {
      const group = s.groupChats.find(g => g.id === s.activeGroupChatId);
      if (group && group.members.length > 0) {
        const others = group.members.filter(m => m !== s.displayName);
        if (others.length) replyName = others[Math.floor(Math.random() * others.length)];
      }
    }
    setTimeout(() => {
      if (getActiveChatKey(stateRef.current) !== chatKey) return;
      setTimeout(() => {
        let response = MOCK_REPLIES[Math.floor(Math.random() * MOCK_REPLIES.length)];
        const lower = userMsg?.toLowerCase() || "";
        if (lower.includes("hello") || lower.includes("hey")) response = "Hey! Hope you're having a great day! 👋";
        else if (lower.includes("youtube") || lower.includes("video")) response = "The video player works great! Check it out.";
        else if (lower.includes("instagram") || lower.includes("ig")) response = "Just saw the latest posts! They look awesome 🔥";
        socket.emit("message:send", { chatKey, sender: replyName, content: response, isImage: false, replyTo: null });
      }, 2000);
    }, 1000);
  }, []);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now();
    dispatch({ type: "ADD_TOAST", payload: { id, message, type } });
    setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: id }), 3500);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, login, guestLogin, logout, loadMessages, sendMessage, addToast }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export function getActiveChatKey(s) {
  if (s.activeChatType === "channel") return s.activeServerId + "_" + s.activeChannelId;
  if (s.activeChatType === "dm") return "dm_" + s.activeDmFriendId;
  if (s.activeChatType === "group") return "group_" + s.activeGroupChatId;
  return s.activeServerId + "_" + s.activeChannelId;
}

function getChatKeyFromMsg(s, msg) {
  return getActiveChatKey(s);
}
