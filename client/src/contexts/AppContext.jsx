import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";
import socket, { reconnectSocket } from "../services/socket";
import { api, setTokens, clearTokens, getAccessToken } from "../services/api";

const initialState = {
  user: null,
  servers: [],
  friends: [],
  groupChats: [],
  messages: {},
  messageCursors: {},
  activeChatType: "channel",
  activeServerId: null,
  activeChannelId: null,
  activeDmFriendId: null,
  activeGroupChatId: null,
  activeNavTab: "dms",
  activeFriendSubtab: "online",
  displayName: "You",
  bio: "",
  status: "online",
  customStatus: "",
  profilePic: "",
  friendSearchQuery: "",
  chatSearchQuery: "",
  toasts: [],
  rememberMe: false,
  uploadProgress: null,
  typingUsers: {},
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
    case "SET_MESSAGES_BATCH":
      return {
        ...state,
        messages: { ...state.messages, [action.chatKey]: [...(action.prepend ? action.payload : []), ...(state.messages[action.chatKey] || []), ...(action.prepend ? [] : action.payload)] },
        messageCursors: { ...state.messageCursors, [action.chatKey]: { ...state.messageCursors[action.chatKey], ...action.cursors } },
      };
    case "PREPEND_MESSAGES":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatKey]: [...action.payload, ...(state.messages[action.chatKey] || [])],
        },
      };
    case "ADD_MESSAGE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatKey]: [...(state.messages[action.chatKey] || []), action.payload],
        },
      };
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatKey]: (state.messages[action.chatKey] || []).map(m =>
            m.id === action.payload.id ? { ...m, ...action.payload } : m
          ),
        },
      };
    case "REMOVE_MESSAGE":
      return {
        ...state,
        messages: {
          ...state.messages,
          [action.chatKey]: (state.messages[action.chatKey] || []).filter(m => m.id !== action.payload),
        },
      };
    case "SET_ACTIVE_CHAT":
      return { ...state, ...action.payload };
    case "SET_NAV_TAB":
      return { ...state, activeNavTab: action.payload };
    case "SET_FRIEND_SUBTAB":
      return { ...state, activeFriendSubtab: action.payload };
    case "SET_PROFILE":
      return { ...state, ...action.payload };
    case "SET_FRIEND_SEARCH":
      return { ...state, friendSearchQuery: action.payload };
    case "SET_CHAT_SEARCH":
      return { ...state, chatSearchQuery: action.payload };
    case "SET_TYPING":
      return {
        ...state,
        typingUsers: { ...state.typingUsers, [action.chatKey]: action.payload },
      };
    case "SET_UPLOAD_PROGRESS":
      return { ...state, uploadProgress: action.payload };
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
  const [persisted, setPersisted] = useLocalStorage("dangro_state_v5", {});
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...persisted });
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const { user, servers, friends, groupChats, messages, messageCursors, typingUsers, ...layoutState } = state;
    if (state.user) {
      setPersisted({ ...layoutState, rememberMe: state.rememberMe });
    }
  }, [state]);

  useEffect(() => {
    const token = getAccessToken();
    if (token && !state.user) {
      api.auth.me().then(data => {
        const u = data.user;
        dispatch({ type: "SET_USER", payload: { id: u.id, username: u.username, email: u.email } });
        dispatch({ type: "SET_PROFILE", payload: {
          displayName: u.displayName || u.username,
          bio: u.bio || "",
          status: u.status || "online",
          customStatus: u.customStatus || "",
          profilePic: u.profilePic || "",
        }});
      }).catch(() => {
        clearTokens();
      });
    }
  }, []);

  useEffect(() => {
    if (state.user) {
      api.servers.list().then(servers => dispatch({ type: "SET_SERVERS", payload: servers })).catch(() => {});
      api.friends.list().then(friends => dispatch({ type: "SET_FRIENDS", payload: friends })).catch(() => {});
      reconnectSocket();
      socket.connect();
      return () => { socket.disconnect(); };
    }
  }, [state.user]);

  useEffect(() => {
    socket.on("message:new", (msg) => {
      const chatKey = getActiveChatKey(stateRef.current);
      dispatch({ type: "ADD_MESSAGE", chatKey: msg.chatKey || chatKey, payload: msg });
    });

    socket.on("message:updated", (data) => {
      const chatKey = getActiveChatKey(stateRef.current);
      const msgs = stateRef.current.messages[chatKey] || [];
      const idx = msgs.findIndex(m => m.id === data.messageId);
      if (idx >= 0) {
        dispatch({ type: "UPDATE_MESSAGE", chatKey, payload: { id: data.messageId, ...data } });
      }
    });

    socket.on("message:deleted", (data) => {
      const chatKey = getActiveChatKey(stateRef.current);
      const msgs = stateRef.current.messages[chatKey] || [];
      if (msgs.find(m => m.id === data.messageId)) {
        dispatch({ type: "REMOVE_MESSAGE", chatKey, payload: data.messageId });
      }
    });

    socket.on("typing:update", (data) => {
      const chatKey = getActiveChatKey(stateRef.current);
      dispatch({ type: "SET_TYPING", chatKey, payload: data });
    });

    socket.on("presence:update", (data) => {
      dispatch({ type: "SET_FRIENDS", payload: stateRef.current.friends.map(f =>
        f.id === data.userId ? { ...f, status: data.status } : f
      )});
    });

    return () => {
      socket.off("message:new");
      socket.off("message:updated");
      socket.off("message:deleted");
      socket.off("typing:update");
      socket.off("presence:update");
    };
  }, []);

  const login = useCallback(async (username, password, rememberMe = false) => {
    const result = await api.auth.login(username, password, rememberMe);
    setTokens(result.accessToken, result.refreshToken);
    const u = result.user;
    dispatch({ type: "SET_USER", payload: { id: u.id, username: u.username, email: u.email } });
    dispatch({ type: "SET_PROFILE", payload: {
      displayName: u.displayName || u.username,
      bio: u.bio || "",
      status: u.status || "online",
      customStatus: u.customStatus || "",
      profilePic: u.profilePic || "",
    }});
    return result;
  }, []);

  const signup = useCallback(async (username, email, password) => {
    const result = await api.auth.signup(username, email, password);
    setTokens(result.accessToken, result.refreshToken);
    const u = result.user;
    dispatch({ type: "SET_USER", payload: { id: u.id, username: u.username, email: u.email } });
    dispatch({ type: "SET_PROFILE", payload: {
      displayName: u.displayName || u.username,
      bio: u.bio || "",
      status: u.status || "online",
      customStatus: u.customStatus || "",
      profilePic: u.profilePic || "",
    }});
    return result;
  }, []);

  const logout = useCallback(async () => {
    try {
      const rt = localStorage.getItem("dangro_refresh_token");
      if (rt) await api.auth.logout(rt);
    } catch {}
    clearTokens();
    localStorage.removeItem("dangro_state_v5");
    dispatch({ type: "RESET" });
  }, []);

  const loadMessages = useCallback(async (chatKey, options = {}) => {
    try {
      const result = await api.messages.list(chatKey, options);
      if (options.before) {
        dispatch({ type: "PREPEND_MESSAGES", chatKey, payload: result.messages });
      } else {
        dispatch({ type: "SET_MESSAGES", chatKey, payload: result.messages });
      }
      dispatch({
        type: "SET_MESSAGES_BATCH",
        chatKey,
        payload: result.messages,
        prepend: !!options.before,
        cursors: { hasMore: result.hasMore, nextCursor: result.nextCursor, total: result.total },
      });
      return result;
    } catch {
      return null;
    }
  }, []);

  const sendMessage = useCallback(async (content, isImage = false, replyTo = null, attachments = []) => {
    const s = stateRef.current;
    const chatKey = getActiveChatKey(s);
    const optimisticId = "opt_" + Date.now();
    const optimisticMsg = {
      id: optimisticId,
      chatKey,
      sender: s.displayName,
      content,
      timestamp: new Date().toISOString(),
      isImage,
      system: false,
      reactions: {},
      replyTo: replyTo || null,
      attachments,
      editedAt: null,
    };

    dispatch({ type: "ADD_MESSAGE", chatKey, payload: optimisticMsg });
    socket.emit("message:send", { chatKey, sender: s.displayName, content, isImage, replyTo, attachments });
  }, []);

  const addToast = useCallback((message, type = "info") => {
    const id = Date.now();
    dispatch({ type: "ADD_TOAST", payload: { id, message, type } });
    setTimeout(() => dispatch({ type: "REMOVE_TOAST", payload: id }), 3500);
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, login, signup, logout, loadMessages, sendMessage, addToast }}>
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
  if (s.activeChatType === "channel" && s.activeServerId && s.activeChannelId)
    return s.activeServerId + "_" + s.activeChannelId;
  if (s.activeChatType === "dm" && s.activeDmFriendId)
    return "dm_" + s.activeDmFriendId;
  if (s.activeChatType === "group" && s.activeGroupChatId)
    return "group_" + s.activeGroupChatId;
  return null;
}
