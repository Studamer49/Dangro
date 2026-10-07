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

const THEMES: Theme[] = ["dark", "light", "amoled"];
const ACCENTS: AccentColor[] = [
  "indigo", "blue", "green", "red", "orange",
  "pink", "purple", "cyan", "yellow", "teal",
];
const DENSITIES: ChatDensity[] = ["comfortable", "compact"];
const FONT_SIZES: FontSize[] = ["small", "default", "large"];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

const defaults = {
  theme: "dark" as Theme,
  accentColor: "indigo" as AccentColor,
  chatDensity: "comfortable" as ChatDensity,
  fontSize: "default" as FontSize,
  animationsEnabled: true,
  developerMode: false,
  notificationsEnabled: true,
  showOnlineStatus: true,
};

/**
 * Persisted settings are user-editable storage: any stale or hand-edited
 * value must degrade to the default instead of crashing ThemeProvider.
 */
function sanitize(persisted: unknown): typeof defaults {
  const p = (persisted ?? {}) as Record<string, unknown>;
  return {
    theme: oneOf(p.theme, THEMES, defaults.theme),
    accentColor: oneOf(p.accentColor, ACCENTS, defaults.accentColor),
    chatDensity: oneOf(p.chatDensity, DENSITIES, defaults.chatDensity),
    fontSize: oneOf(p.fontSize, FONT_SIZES, defaults.fontSize),
    animationsEnabled: bool(p.animationsEnabled, defaults.animationsEnabled),
    developerMode: bool(p.developerMode, defaults.developerMode),
    notificationsEnabled: bool(p.notificationsEnabled, defaults.notificationsEnabled),
    showOnlineStatus: bool(p.showOnlineStatus, defaults.showOnlineStatus),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaults,

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
      version: 1,
      migrate: (persisted) => sanitize(persisted),
      partialize: (state) => ({
        theme: state.theme,
        accentColor: state.accentColor,
        chatDensity: state.chatDensity,
        fontSize: state.fontSize,
        animationsEnabled: state.animationsEnabled,
        developerMode: state.developerMode,
        notificationsEnabled: state.notificationsEnabled,
        showOnlineStatus: state.showOnlineStatus,
      }),
      merge: (persisted, current) => ({
        ...current,
        ...sanitize(persisted),
      }),
    }
  )
);
