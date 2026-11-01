import { defineConfig, loadEnv, type Plugin } from "vite";
import { readFileSync, writeFileSync } from "fs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** The secure WebSocket origin matching `wsUrl`, falling back to the API host. */
function socketOrigin(wsUrl: string | undefined, apiOrigin: string): string {
  if (wsUrl) {
    try {
      const url = new URL(wsUrl);
      if (url.protocol === "https:" || url.protocol === "wss:") {
        return `wss://${url.host}`;
      }
    } catch {
      // Unparseable: fall back to the API origin below.
    }
  }
  return apiOrigin.replace(/^http/i, "ws");
}

/**
 * Rewrites the two Cloudflare Pages control files for a split deployment.
 *
 * `_redirects`: stored media URLs are root-relative (`/uploads/<id>`), so on
 * Pages they must be redirected to the API origin or every image 404s.
 *
 * `_headers`: the checked-in CSP allows only `'self'`, which is correct for the
 * single-origin Worker + Container deployment. When the SPA is on Pages and the
 * API is elsewhere, that rule blocks every API call, WebSocket and GridFS
 * upload in the browser while the requests themselves would have succeeded. The
 * API and socket origins are added here rather than hardcoded, so changing
 * VITE_API_URL cannot leave the CSP stale.
 *
 * The default same-origin deployment never sets VITE_API_URL to an absolute
 * URL, so this plugin leaves both files untouched there.
 */
function pagesSplitDeployment(apiUrl: string | undefined, wsUrl: string | undefined): Plugin {
  return {
    name: "pages-split-deployment",
    apply: "build",
    writeBundle(options) {
      if (!apiUrl || !/^https?:\/\//.test(apiUrl) || !options.dir) return;

      const apiOrigin = new URL(apiUrl).origin;
      const ws = socketOrigin(wsUrl, apiOrigin);

      writeFileSync(resolve(options.dir, "_redirects"), `/uploads/* ${apiOrigin}/uploads/:splat 302\n`);

      const headersSource = resolve(__dirname, "public/_headers");
      const headersTarget = resolve(options.dir, "_headers");

      let headers: string;
      try {
        headers = readFileSync(headersSource, "utf8");
      } catch {
        return;
      }

      headers = headers
        .replace("connect-src 'self'", `connect-src 'self' ${apiOrigin} ${ws}`)
        .replace("img-src 'self'", `img-src 'self' ${apiOrigin}`)
        .replace("media-src 'self'", `media-src 'self' ${apiOrigin}`);

      writeFileSync(headersTarget, headers);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [react(), pagesSplitDeployment(env.VITE_API_URL, env.VITE_WS_URL)],
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
  };
});
