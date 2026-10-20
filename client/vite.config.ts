import { defineConfig, loadEnv, type Plugin } from "vite";
import { writeFileSync } from "fs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// When the API lives on another origin (frontend on Cloudflare Pages), stored
// `/uploads/...` media URLs are redirected there by a Pages `_redirects` file.
function pagesRedirects(apiUrl: string | undefined): Plugin {
  return {
    name: "pages-redirects",
    apply: "build",
    writeBundle(options) {
      if (!apiUrl || !/^https?:\/\//.test(apiUrl) || !options.dir) return;
      const origin = new URL(apiUrl).origin;
      writeFileSync(resolve(options.dir, "_redirects"), `/uploads/* ${origin}/uploads/:splat 302\n`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), pagesRedirects(loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL)],
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
}));
