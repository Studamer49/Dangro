/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        accent: {
          50: "var(--accent-50)",
          100: "var(--accent-100)",
          200: "var(--accent-200)",
          300: "var(--accent-300)",
          400: "var(--accent-400)",
          500: "var(--accent-500)",
          600: "var(--accent-600)",
          700: "var(--accent-700)",
          800: "var(--accent-800)",
          900: "var(--accent-900)",
          950: "var(--accent-950)",
        },
      },
      fontSize: {
        "chat-sm": ["0.75rem", { lineHeight: "1rem" }],
        "chat-base": ["0.875rem", { lineHeight: "1.25rem" }],
        "chat-lg": ["1rem", { lineHeight: "1.5rem" }],
      },
    },
  },
  plugins: [],
};
