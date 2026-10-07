import { io, Socket } from "socket.io-client";

/**
 * Resolution order:
 *   1. `VITE_WS_URL` when explicitly set (non-production dev against :3001)
 *   2. same origin — correct for the single-service Render deployment
 *
 * Never hardcode a hostname: a baked `localhost` breaks every production client.
 */
function resolveSocketUrl(): string | undefined {
  const configured = import.meta.env.VITE_WS_URL?.trim();
  if (configured) return configured;
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
