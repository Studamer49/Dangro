import { create } from "zustand";
import api, { apiErrorCode, invalidateSession, setAuthListeners } from "@/lib/api";
import { connectSocket, disconnectSocket, setSocketToken } from "@/lib/socket";
import { useCallStore } from "@/stores/callStore";
import { devAuthEnabled, devUser } from "@/lib/devAuth";
import type { User } from "@/types";

/**
 * What signup returns.
 *
 * Deliberately not a session: the account exists but cannot be signed in to
 * until the emailed link is clicked, so the caller shows the "check your
 * inbox" notice and routes to login rather than into the app.
 */
export interface RegisterResult {
  verificationRequired: boolean;
  /** The masked address the link was sent to. */
  email: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  setUser: (user: User | null) => void;
  /**
   * Set when the server refuses the session because the address is not
   * verified. Cleared by a successful login or verification.
   */
  unverifiedEmail: string | null;
  clearUnverifiedEmail: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  unverifiedEmail: null,

  login: async (email, password) => {
    // Local dev runs without a backend, so any credentials "succeed" and land
    // the developer in the app. Never reachable in a production build.
    if (devAuthEnabled) {
      set({ user: devUser, isAuthenticated: true, unverifiedEmail: null });
      return;
    }
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("accessToken", data.accessToken);
    set({ user: data.user, isAuthenticated: true, unverifiedEmail: null });
    connectSocket(data.accessToken);
  },

  register: async (username, email, password) => {
    if (devAuthEnabled) {
      set({ user: devUser, isAuthenticated: true });
      return { verificationRequired: false, email };
    }
    // No token is stored here. The server issues none until the address is
    // verified, and writing one anyway would leave the app believing it is
    // signed in with a session that does not exist.
    const { data } = await api.post("/auth/register", { username, email, password });
    set({ user: null, isAuthenticated: false, unverifiedEmail: data.email ?? email });
    return {
      verificationRequired: Boolean(data.verificationRequired),
      email: data.email ?? email,
    };
  },

  clearUnverifiedEmail: () => set({ unverifiedEmail: null }),

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
    // Local dev: no backend to ask, so treat the developer as already signed
    // in. Without this the app would render the login screen on every reload.
    if (devAuthEnabled) {
      set({ user: devUser, isAuthenticated: true, isLoading: false });
      return;
    }
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const { data } = await api.get("/auth/me");
      const currentToken = localStorage.getItem("accessToken");
      set({ user: data.user, isAuthenticated: true, isLoading: false, unverifiedEmail: null });
      connectSocket(currentToken || token);
    } catch (err) {
      // The server refused this session because the address is not verified —
      // an email change can do that to a perfectly valid token. Send the user
      // back to login with the address in hand rather than leaving them on a
      // blank screen.
      if (apiErrorCode(err) === "EMAIL_NOT_VERIFIED") {
        const known = get().user?.email ?? null;
        localStorage.removeItem("accessToken");
        disconnectSocket();
        set({ user: null, isAuthenticated: false, isLoading: false, unverifiedEmail: known });
        return;
      }
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
