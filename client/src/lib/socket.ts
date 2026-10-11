import { io, Socket } from "socket.io-client";

/**
 * Hosts that only mean something on one machine or one LAN. A production page
 * dialling one of these asks the visitor to grant local-network access and then
 * fails to connect, so a production build ignores them entirely.
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return true;
  // A bare hostname with no dot ("nas", "media-host") is LAN-only too.
  if (!host.includes(".") && !host.includes(":")) return true;
  if (host.startsWith("[")) return host === "[::1]";
  if (host === "::1") return true;

  const octets = host.split(".");
  if (octets.length === 4 && octets.every((part) => /^\d{1,3}$/.test(part))) {
    const [a, b] = octets.map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  return false;
}

/**
 * Resolution order:
 *   1. `VITE_WS_URL` when set to a usable URL (non-production dev against :3001)
 *   2. same origin — correct for the single-service Render deployment
 *
 * Never hardcode a hostname: a baked `localhost` breaks every production client.
 * In a production build a loopback or LAN address is discarded rather than
 * dialled, because connecting to it from a public page makes the browser ask the
 * visitor to expose their local network.
 */
function resolveSocketUrl(): string | undefined {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) {
    if (import.meta.env.DEV) return configured;
    try {
      const { hostname, protocol } = new URL(configured);
      if (protocol === "https:" && !isLocalHost(hostname)) return configured;
    } catch {
      // Unparseable value: fall through to same-origin.
    }
    console.warn(
      "[socket] Ignoring VITE_WS_URL in a production build: it must be an https:// URL on a public host."
    );
  }
  if (import.meta.env.DEV) return "http://localhost:3001";
  return undefined; // undefined => socket.io connects to window.location
}

let socket: Socket | null = null;
let currentToken: string | null = null;

// Read at handshake time so reconnects always use the freshest token.
const handshakeAuth = {
  get token(): string | undefined {
    return currentToken ?? undefined;
  },
};

export function getSocket(): Socket {
  if (!socket) {
    const url = resolveSocketUrl();
    const options = {
      autoConnect: false,
      withCredentials: true,
      reconnection: true,
      auth: handshakeAuth,
    };
    socket = url ? io(url, options) : io(options);
  }
  return socket;
}

export function connectSocket(token: string): Socket {
  currentToken = token;
  const s = getSocket();
  s.auth = handshakeAuth;
  if (!s.connected) s.connect();
  return s;
}

/** Keeps the handshake fresh after a silent token refresh. */
export function setSocketToken(token: string): void {
  currentToken = token;
}

/**
 * Drops the session but keeps the Socket instance so component-level
 * listeners registered before logout still work after the next login.
 */
export function disconnectSocket(): void {
  currentToken = null;
  if (socket) socket.disconnect();
}

/** Full teardown — only used on hard session resets. */
export function destroySocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.io.engine?.close();
    socket = null;
  }
  currentToken = null;
}
