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
export type ChatDensity = "cozy" | "comfortable" | "compact";

export interface CustomColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
}

interface SettingsState {
  theme: Theme;
  accentColor: AccentColor;
  customAccent: string;
  chatDensity: ChatDensity;
  baseFontSize: number;
  radius: number;
  customColors: CustomColors;
  animationsEnabled: boolean;
  developerMode: boolean;
  notificationsEnabled: boolean;
  showOnlineStatus: boolean;
  setTheme: (theme: Theme) => void;
  setAccentColor: (color: AccentColor) => void;
  setCustomAccent: (hex: string) => void;
  setChatDensity: (density: ChatDensity) => void;
  setBaseFontSize: (size: number) => void;
  setRadius: (radius: number) => void;
  setCustomColor: (key: keyof CustomColors, value: string) => void;
  resetCustomColors: () => void;
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
const DENSITIES: ChatDensity[] = ["cozy", "comfortable", "compact"];

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function hex(value: unknown): string {
  if (typeof value !== "string") return "";
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "";
}

const DEFAULTS = {
  theme: "dark" as Theme,
  accentColor: "indigo" as AccentColor,
  customAccent: "",
  chatDensity: "comfortable" as ChatDensity,
  baseFontSize: 16,
  radius: 12,
  customColors: { bg: "", surface: "", border: "", text: "" } as CustomColors,
  animationsEnabled: true,
  developerMode: false,
  notificationsEnabled: true,
  showOnlineStatus: true,
};

/**
 * Persisted settings are user-editable storage: any stale or hand-edited
 * value must degrade to the default instead of crashing ThemeProvider.
 */
function sanitize(persisted: unknown): typeof DEFAULTS {
  const p = (persisted ?? {}) as Record<string, unknown>;
  const colors = (p.customColors ?? {}) as Record<string, unknown>;
  return {
    theme: oneOf(p.theme, THEMES, DEFAULTS.theme),
    accentColor: oneOf(p.accentColor, ACCENTS, DEFAULTS.accentColor),
    customAccent: hex(p.customAccent),
    chatDensity: oneOf(p.chatDensity, DENSITIES, DEFAULTS.chatDensity),
    baseFontSize: num(p.baseFontSize, DEFAULTS.baseFontSize, 13, 20),
    radius: num(p.radius, DEFAULTS.radius, 4, 28),
    customColors: {
      bg: hex(colors.bg),
      surface: hex(colors.surface),
      border: hex(colors.border),
      text: hex(colors.text),
    },
    animationsEnabled: bool(p.animationsEnabled, DEFAULTS.animationsEnabled),
    developerMode: bool(p.developerMode, DEFAULTS.developerMode),
    notificationsEnabled: bool(p.notificationsEnabled, DEFAULTS.notificationsEnabled),
    showOnlineStatus: bool(p.showOnlineStatus, DEFAULTS.showOnlineStatus),
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setTheme: (theme) => set({ theme }),
      setAccentColor: (accentColor) => set({ accentColor, customAccent: "" }),
      setCustomAccent: (customAccent) => set({ customAccent: hex(customAccent) }),
      setChatDensity: (chatDensity) => set({ chatDensity }),
      setBaseFontSize: (baseFontSize) => set({ baseFontSize }),
      setRadius: (radius) => set({ radius }),
      setCustomColor: (key, value) =>
        set((s) => ({ customColors: { ...s.customColors, [key]: hex(value) } })),
      resetCustomColors: () =>
        set({ customColors: { bg: "", surface: "", border: "", text: "" } }),
      toggleAnimations: () => set((s) => ({ animationsEnabled: !s.animationsEnabled })),
      toggleDeveloperMode: () => set((s) => ({ developerMode: !s.developerMode })),
      toggleNotifications: () => set((s) => ({ notificationsEnabled: !s.notificationsEnabled })),
      toggleOnlineStatus: () => set((s) => ({ showOnlineStatus: !s.showOnlineStatus })),
    }),
    {
      name: "dangro-settings",
      version: 2,
      migrate: (persisted) => sanitize(persisted),
      partialize: (state) => ({
        theme: state.theme,
        accentColor: state.accentColor,
        customAccent: state.customAccent,
        chatDensity: state.chatDensity,
        baseFontSize: state.baseFontSize,
        radius: state.radius,
        customColors: state.customColors,
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