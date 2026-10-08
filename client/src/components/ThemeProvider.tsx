import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import { buildAccentScale, rgbTriplet } from "@/lib/color";
import type { AccentColor } from "@/stores/settingsStore";

const accentColors: Record<AccentColor, Record<string, string>> = {
  indigo: {
    "50": "#eef2ff", "100": "#e0e7ff", "200": "#c7d2fe",
    "300": "#a5b4fc", "400": "#818cf8", "500": "#6366f1",
    "600": "#4f46e5", "700": "#4338ca", "800": "#3730a3",
    "900": "#312e81", "950": "#1e1b4b",
  },
  blue: {
    "50": "#eff6ff", "100": "#dbeafe", "200": "#bfdbfe",
    "300": "#93c5fd", "400": "#60a5fa", "500": "#3b82f6",
    "600": "#2563eb", "700": "#1d4ed8", "800": "#1e40af",
    "900": "#1e3a8a", "950": "#172554",
  },
  green: {
    "50": "#f0fdf4", "100": "#dcfce7", "200": "#bbf7d0",
    "300": "#86efac", "400": "#4ade80", "500": "#22c55e",
    "600": "#16a34a", "700": "#15803d", "800": "#166534",
    "900": "#14532d", "950": "#052e16",
  },
  red: {
    "50": "#fef2f2", "100": "#fee2e2", "200": "#fecaca",
    "300": "#fca5a5", "400": "#f87171", "500": "#ef4444",
    "600": "#dc2626", "700": "#b91c1c", "800": "#991b1b",
    "900": "#7f1d1d", "950": "#450a0a",
  },
  orange: {
    "50": "#fff7ed", "100": "#ffedd5", "200": "#fed7aa",
    "300": "#fdba74", "400": "#fb923c", "500": "#f97316",
    "600": "#ea580c", "700": "#c2410c", "800": "#9a3412",
    "900": "#7c2d12", "950": "#431407",
  },
  pink: {
    "50": "#fdf2f8", "100": "#fce7f3", "200": "#fbcfe8",
    "300": "#f9a8d4", "400": "#f472b6", "500": "#ec4899",
    "600": "#db2777", "700": "#be185d", "800": "#9d174d",
    "900": "#831843", "950": "#500724",
  },
  purple: {
    "50": "#faf5ff", "100": "#f3e8ff", "200": "#e9d5ff",
    "300": "#d8b4fe", "400": "#c084fc", "500": "#a855f7",
    "600": "#9333ea", "700": "#7e22ce", "800": "#6b21a8",
    "900": "#581c87", "950": "#3b0764",
  },
  cyan: {
    "50": "#ecfeff", "100": "#cffafe", "200": "#a5f3fc",
    "300": "#67e8f9", "400": "#22d3ee", "500": "#06b6d4",
    "600": "#0891b2", "700": "#0e7490", "800": "#155e75",
    "900": "#164e63", "950": "#083344",
  },
  yellow: {
    "50": "#fefce8", "100": "#fef9c3", "200": "#fef08a",
    "300": "#fde047", "400": "#facc15", "500": "#eab308",
    "600": "#ca8a04", "700": "#a16207", "800": "#854d0e",
    "900": "#713f12", "950": "#422006",
  },
  teal: {
    "50": "#f0fdfa", "100": "#ccfbf1", "200": "#99f6e4",
    "300": "#5eead4", "400": "#2dd4bf", "500": "#14b8a6",
    "600": "#0d9488", "700": "#0f766e", "800": "#115e59",
    "900": "#134e4a", "950": "#042f2e",
  },
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const customAccent = useSettingsStore((s) => s.customAccent);
  const chatDensity = useSettingsStore((s) => s.chatDensity);
  const baseFontSize = useSettingsStore((s) => s.baseFontSize);
  const radius = useSettingsStore((s) => s.radius);
  const customColors = useSettingsStore((s) => s.customColors);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light", "amoled");
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const scale = customAccent ? buildAccentScale(customAccent) : accentColors[accentColor];
    ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"].forEach(
      (step) => {
        root.style.setProperty(`--accent-${step}-rgb`, rgbTriplet(scale[step]));
      }
    );
  }, [accentColor, customAccent]);

  useEffect(() => {
    const root = document.documentElement;
    const setToken = (name: string, value: string | null) => {
      root.style.removeProperty(name);
      root.style.removeProperty(`${name}-rgb`);
      if (value) {
        root.style.setProperty(name, value);
        root.style.setProperty(`${name}-rgb`, rgbTriplet(value));
      }
    };
    setToken("--ui-bg", customColors.bg || null);
    setToken("--ui-surface", customColors.surface || null);
    setToken("--ui-surface-2", customColors.surface || null);
    setToken("--ui-border", customColors.border || null);
    setToken("--ui-text", customColors.text || null);
  }, [customColors]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${baseFontSize}px`;
    root.dataset.density = chatDensity;
  }, [baseFontSize, chatDensity]);

  useEffect(() => {
    const root = document.documentElement;
    const lg = Math.max(4, Math.round(radius * 0.66));
    const xl = radius;
    const twoXl = Math.round(radius * 1.33);
    const threeXl = Math.round(radius * 2);
    root.style.setProperty("--ui-radius-lg", `${lg}px`);
    root.style.setProperty("--ui-radius-xl", `${xl}px`);
    root.style.setProperty("--ui-radius-2xl", `${twoXl}px`);
    root.style.setProperty("--ui-radius-3xl", `${threeXl}px`);
  }, [radius]);

  return <>{children}</>;
}