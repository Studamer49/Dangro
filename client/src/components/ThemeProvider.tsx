import { useEffect } from "react";
import { useSettingsStore } from "@/stores/settingsStore";
import type { AccentColor } from "@/stores/settingsStore";

const accentColors: Record<AccentColor, Record<string, string>> = {
  indigo: {
    "--accent-50": "#eef2ff", "--accent-100": "#e0e7ff", "--accent-200": "#c7d2fe",
    "--accent-300": "#a5b4fc", "--accent-400": "#818cf8", "--accent-500": "#6366f1",
    "--accent-600": "#4f46e5", "--accent-700": "#4338ca", "--accent-800": "#3730a3",
    "--accent-900": "#312e81", "--accent-950": "#1e1b4b",
  },
  blue: {
    "--accent-50": "#eff6ff", "--accent-100": "#dbeafe", "--accent-200": "#bfdbfe",
    "--accent-300": "#93c5fd", "--accent-400": "#60a5fa", "--accent-500": "#3b82f6",
    "--accent-600": "#2563eb", "--accent-700": "#1d4ed8", "--accent-800": "#1e40af",
    "--accent-900": "#1e3a8a", "--accent-950": "#172554",
  },
  green: {
    "--accent-50": "#f0fdf4", "--accent-100": "#dcfce7", "--accent-200": "#bbf7d0",
    "--accent-300": "#86efac", "--accent-400": "#4ade80", "--accent-500": "#22c55e",
    "--accent-600": "#16a34a", "--accent-700": "#15803d", "--accent-800": "#166534",
    "--accent-900": "#14532d", "--accent-950": "#052e16",
  },
  red: {
    "--accent-50": "#fef2f2", "--accent-100": "#fee2e2", "--accent-200": "#fecaca",
    "--accent-300": "#fca5a5", "--accent-400": "#f87171", "--accent-500": "#ef4444",
    "--accent-600": "#dc2626", "--accent-700": "#b91c1c", "--accent-800": "#991b1b",
    "--accent-900": "#7f1d1d", "--accent-950": "#450a0a",
  },
  orange: {
    "--accent-50": "#fff7ed", "--accent-100": "#ffedd5", "--accent-200": "#fed7aa",
    "--accent-300": "#fdba74", "--accent-400": "#fb923c", "--accent-500": "#f97316",
    "--accent-600": "#ea580c", "--accent-700": "#c2410c", "--accent-800": "#9a3412",
    "--accent-900": "#7c2d12", "--accent-950": "#431407",
  },
  pink: {
    "--accent-50": "#fdf2f8", "--accent-100": "#fce7f3", "--accent-200": "#fbcfe8",
    "--accent-300": "#f9a8d4", "--accent-400": "#f472b6", "--accent-500": "#ec4899",
    "--accent-600": "#db2777", "--accent-700": "#be185d", "--accent-800": "#9d174d",
    "--accent-900": "#831843", "--accent-950": "#500724",
  },
  purple: {
    "--accent-50": "#faf5ff", "--accent-100": "#f3e8ff", "--accent-200": "#e9d5ff",
    "--accent-300": "#d8b4fe", "--accent-400": "#c084fc", "--accent-500": "#a855f7",
    "--accent-600": "#9333ea", "--accent-700": "#7e22ce", "--accent-800": "#6b21a8",
    "--accent-900": "#581c87", "--accent-950": "#3b0764",
  },
  cyan: {
    "--accent-50": "#ecfeff", "--accent-100": "#cffafe", "--accent-200": "#a5f3fc",
    "--accent-300": "#67e8f9", "--accent-400": "#22d3ee", "--accent-500": "#06b6d4",
    "--accent-600": "#0891b2", "--accent-700": "#0e7490", "--accent-800": "#155e75",
    "--accent-900": "#164e63", "--accent-950": "#083344",
  },
  yellow: {
    "--accent-50": "#fefce8", "--accent-100": "#fef9c3", "--accent-200": "#fef08a",
    "--accent-300": "#fde047", "--accent-400": "#facc15", "--accent-500": "#eab308",
    "--accent-600": "#ca8a04", "--accent-700": "#a16207", "--accent-800": "#854d0e",
    "--accent-900": "#713f12", "--accent-950": "#422006",
  },
  teal: {
    "--accent-50": "#f0fdfa", "--accent-100": "#ccfbf1", "--accent-200": "#99f6e4",
    "--accent-300": "#5eead4", "--accent-400": "#2dd4bf", "--accent-500": "#14b8a6",
    "--accent-600": "#0d9488", "--accent-700": "#0f766e", "--accent-800": "#115e59",
    "--accent-900": "#134e4a", "--accent-950": "#042f2e",
  },
};

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSettingsStore((s) => s.theme);
  const accentColor = useSettingsStore((s) => s.accentColor);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("dark", "light", "amoled");
    root.classList.add(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    const colors = accentColors[accentColor];
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });
  }, [accentColor]);

  return <>{children}</>;
}
