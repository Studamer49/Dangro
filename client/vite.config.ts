import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",   // Exposes Vite to your local network (LAN)
    port: 5173,        // Targets port 5173
    strictPort: true,  // Fails with an error if 5173 is busy instead of silently changing ports
    // Vite 6 rejects unknown Host headers unless the entry matches. Raw IPv4
    // addresses are always allowed, but a mDNS name such as "my-mac.local"
    // is not, so allow ".local" to reach the dev server by hostname too.
    allowedHosts: [".local"],
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
