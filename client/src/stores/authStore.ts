import { create } from "zustand";
import api from "@/lib/api";
import { connectSocket, disconnectSocket } from "@/lib/socket";
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
    try {
      await api.post("/auth/logout");
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
      set({ user: data.user, isAuthenticated: true, isLoading: false });
      connectSocket(token);
    } catch {
      localStorage.removeItem("accessToken");
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user }),
}));
