/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Colors are rgb triplets so Tailwind can apply /opacity modifiers
        // (e.g. bg-accent-600/10, hover:bg-gray-800/50) on themeable vars.
        accent: {
          50: "rgb(var(--accent-50-rgb, 238 242 255) / <alpha-value>)",
          100: "rgb(var(--accent-100-rgb, 224 231 255) / <alpha-value>)",
          200: "rgb(var(--accent-200-rgb, 199 210 254) / <alpha-value>)",
          300: "rgb(var(--accent-300-rgb, 165 180 252) / <alpha-value>)",
          400: "rgb(var(--accent-400-rgb, 129 140 248) / <alpha-value>)",
          500: "rgb(var(--accent-500-rgb, 99 102 241) / <alpha-value>)",
          600: "rgb(var(--accent-600-rgb, 79 70 229) / <alpha-value>)",
          700: "rgb(var(--accent-700-rgb, 67 56 202) / <alpha-value>)",
          800: "rgb(var(--accent-800-rgb, 55 48 163) / <alpha-value>)",
          900: "rgb(var(--accent-900-rgb, 49 46 129) / <alpha-value>)",
          950: "rgb(var(--accent-950-rgb, 30 27 75) / <alpha-value>)",
        },
        gray: {
          50: "rgb(var(--ui-gray-50-rgb, 249 250 251) / <alpha-value>)",
          100: "rgb(var(--ui-gray-100-rgb, 243 244 246) / <alpha-value>)",
          200: "rgb(var(--ui-gray-200-rgb, 229 231 235) / <alpha-value>)",
          300: "rgb(var(--ui-gray-300-rgb, 209 213 219) / <alpha-value>)",
          400: "rgb(var(--ui-gray-400-rgb, 156 163 175) / <alpha-value>)",
          500: "rgb(var(--ui-gray-500-rgb, 107 114 128) / <alpha-value>)",
          600: "rgb(var(--ui-gray-600-rgb, 75 85 99) / <alpha-value>)",
          700: "rgb(var(--ui-gray-700-rgb, 55 65 81) / <alpha-value>)",
          800: "rgb(var(--ui-gray-800-rgb, 31 41 55) / <alpha-value>)",
          900: "rgb(var(--ui-gray-900-rgb, 17 24 39) / <alpha-value>)",
          950: "rgb(var(--ui-gray-950-rgb, 3 7 18) / <alpha-value>)",
        },
        white: "rgb(var(--ui-text-rgb, 255 255 255) / <alpha-value>)",
      },
      borderRadius: {
        lg: "var(--ui-radius-lg)",
        xl: "var(--ui-radius-xl)",
        "2xl": "var(--ui-radius-2xl)",
        "3xl": "var(--ui-radius-3xl)",
      },
      fontSize: {
        "chat-sm": ["0.75rem", { lineHeight: "1rem" }],
        "chat-base": ["0.875rem", { lineHeight: "1.25rem" }],
        "chat-lg": ["1rem", { lineHeight: "1.5rem" }],
      },
      fontFamily: {
        sans: [
          "Inter var",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "sans-serif",
        ],
      },
      /*
       * One curve for the whole app. Every `transition-*` in the codebase now
       * resolves through these, so a card hover, a modal entry and a toast all
       * decelerate identically.
       */
      transitionTimingFunction: {
        out: "var(--ease-out)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        fast: "120ms",
        DEFAULT: "200ms",
        slow: "320ms",
      },
      boxShadow: {
        elev1: "var(--ui-elev-1)",
        elev2: "var(--ui-elev-2)",
        elev3: "var(--ui-elev-3)",
        /* Accent-coloured ambient light, used behind primary actions, active
           nav items and anything that should pull the eye. */
        glow: "0 0 24px -6px rgb(var(--accent-400-rgb) / 0.55)",
        "glow-lg": "0 0 44px -10px rgb(var(--accent-400-rgb) / 0.6)",
      },
      backdropBlur: {
        glass: "20px",
        panel: "24px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "none" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pop-in": {
          from: { opacity: "0", transform: "scale(0.96) translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        "glow-pulse": {
          "0%, 100%": {
            opacity: "1",
            boxShadow: "0 0 0 0 rgb(var(--accent-400-rgb) / 0.5)",
          },
          "50%": {
            opacity: "0.75",
            boxShadow: "0 0 0 6px rgb(var(--accent-400-rgb) / 0)",
          },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up var(--dur-slow) var(--ease-out) both",
        "fade-in": "fade-in var(--dur) var(--ease-out) both",
        "pop-in": "pop-in var(--dur) var(--ease-out) both",
        "glow-pulse": "glow-pulse 2.4s var(--ease-in-out) infinite",
        shimmer: "shimmer 1.6s linear infinite",
      },
    },
  },
  plugins: [],
};