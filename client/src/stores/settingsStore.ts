import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "amoled";
export type AccentColor =
  | "indigo"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "pink"
  | "purple"
  | "cyan"
  | "yellow"
  | "teal";
export type ChatDensity = "comfortable" | "compact";
export type FontSize = "small" | "default" | "large";

interface SettingsState {
  theme: Theme;
  accentColor: AccentColor;
  chatDensity: ChatDensity;
  fontSize: FontSize;
  animationsEnabled: boolean;
  developerMode: boolean;
  notificationsEnabled: boolean;
  showOnlineStatus: boolean;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColor) => void;
  setChatDensity: (density: ChatDensity) => void;
  setFontSize: (size: FontSize) => void;
  toggleAnimations: () => void;
  toggleDeveloperMode: () => void;
  toggleNotifications: () => void;
  toggleOnlineStatus: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      accentColor: "indigo",
      chatDensity: "comfortable",
      fontSize: "default",
      animationsEnabled: true,
      developerMode: false,
      notificationsEnabled: true,
      showOnlineStatus: true,

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor }),
      setChatDensity: (chatDensity) => set({ chatDensity }),
      setFontSize: (fontSize) => set({ fontSize }),
      toggleAnimations: () => set((s) => ({ animationsEnabled: !s.animationsEnabled })),
      toggleDeveloperMode: () => set((s) => ({ developerMode: !s.developerMode })),
      toggleNotifications: () => set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      toggleOnlineStatus: () => set((s) => ({ showOnlineStatus: !s.showOnlineStatus })),
    }),
    {
      name: "dangro-settings",
    }
  )
);
