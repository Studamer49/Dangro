import { create } from "zustand";
import api, { apiErrorCode, invalidateSession, setAuthListeners } from "@/lib/api";
import { connectSocket, disconnectSocket, setSocketToken } from "@/lib/socket";
import { useCallStore } from "@/stores/callStore";
import type { User } from "@/types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("accessToken", data.accessToken);
    set({ user: data.user, isAuthenticated: true });
    connectSocket(data.accessToken);
  },

  register: async (username, email, password) => {
    const { data } = await api.post("/auth/register", {
      username,
      email,
      password,
    });
    localStorage.setItem("accessToken", data.accessToken);
    set({ user: data.user, isAuthenticated: true });
    connectSocket(data.accessToken);
  },

  logout: async () => {
    // Ends the session locally first: any refresh still in flight would
    // otherwise write its token back into localStorage after the clear below.
    invalidateSession();
    // The call UI is mounted above the router, so signing out did not unmount
    // it. Ending the call here is what tells the other party, and it is the
    // only thing that stops the microphone/camera tracks — otherwise the OS
    // recording indicator stays lit over the login screen.
    useCallStore.getState().endCall();
    try {
      await api.post("/auth/logout");
    } catch {
      // The server-side cookie may not be clearable while offline. The local
      // session is already gone, and the token is about to be discarded.
    } finally {
      localStorage.removeItem("accessToken");
      disconnectSocket();
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchUser: async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { data } = await api.get("/auth/me");
      const currentToken = localStorage.getItem("accessToken");
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(currentToken || token);
    } catch (err) {
      // Only a real auth failure ends the session. Being offline, a 500 or
      // the global rate limiter must not delete a still-valid token and bounce
      // the user to /login.
      if (apiErrorCode(err) === "UNAUTHORIZED") {
        localStorage.removeItem("accessToken");
        disconnectSocket();
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      set({ isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));

// Keep the live Socket.IO session in sync with silent token refreshes, and
// drop the client into a logged-out state (without a redirect loop) when the
// refresh token is no longer valid.
setAuthListeners(
  (accessToken) => setSocketToken(accessToken),
  () => {
    invalidateSession();
    localStorage.removeItem("accessToken");
    disconnectSocket();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  }
);
