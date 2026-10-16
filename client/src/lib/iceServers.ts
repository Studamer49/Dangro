import api from "@/lib/api";

/**
 * ICE configuration.
 *
 * A direct peer-to-peer path is only found when at least one side is
 * reachable. STUN discovers each peer's public mapping; TURN *relays* media
 * when no direct path exists at all. Without a working TURN server, two people
 * both behind symmetric NAT (common on mobile data, corporate and many
 * national networks) get a call that connects to nothing: you see your own
 * camera, never theirs, and nobody is audible.
 *
 * Two layers provide the relay:
 *   1. Build-time `VITE_TURN_*` values (see `client/.env.example`).
 *   2. The server's `GET /api/turn`, which is asked for at startup and can
 *      hand out short-lived credentials — the relay password never has to be
 *      baked into the bundle. When it answers, it wins.
 *
 * The public servers below are a best-effort last resort: free, heavily
 * rate-limited, and blocked on some networks. A deployment that needs reliable
 * calls should configure its own relay.
 */
const env = import.meta.env;

const DEFAULT_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
];

const DEFAULT_TURN = [
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

function configuredTurn(): RTCIceServer[] | null {
  const raw = (env.VITE_TURN_URLS ?? env.VITE_TURN_URL ?? "").trim();
  if (!raw) return null;

  const urls = raw
    .split(",")
    .map((url: string) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return null;

  const username = (env.VITE_TURN_USERNAME ?? "").trim();
  const credential = (env.VITE_TURN_CREDENTIAL ?? "").trim();

  // A TURN server without credentials is only useful for time-limited tokens,
  // so both are attached only when supplied rather than sending empty strings,
  // which some relays reject outright.
  return [{ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) }];
}

/**
 * The live ICE configuration every `RTCPeerConnection` is built from.
 *
 * This object is intentionally mutable and shared: `refreshIceServers()`
 * replaces its `iceServers` in place, so a peer connection created after the
 * fetch gets the server's relay without any async plumbing at the call sites —
 * including the mesh voice channels that build connections synchronously.
 */
export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [...DEFAULT_STUN, ...(configuredTurn() ?? DEFAULT_TURN)],
  // Ask the browser to try every candidate pair it gathers rather than settling
  // for the first that looks reachable. Without this a single early "connected"
  // candidate that later stalls leaves the call black instead of moving on to
  // the pair that actually works.
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
};

/**
 * How long a successful fetch is reused, and how long a failure is.
 *
 * TURN credentials are time-limited, so they must be re-fetched before they
 * lapse; a short success TTL keeps that safe without a request per call. A
 * failure is retried sooner than a success so a relay that was briefly
 * unreachable is picked up on the next call rather than after an hour.
 */
const SUCCESS_TTL_MS = 5 * 60 * 1000;
const FAILURE_TTL_MS = 30 * 1000;

let cachedUntil = 0;
let inFlight: Promise<void> | null = null;

/**
 * Fetches the deployment's ICE servers and installs them for future calls.
 *
 * Never rejects and never blocks a call: on any failure the static fallback
 * above stays in place. Safe to call often — a fresh cache or an in-flight
 * request short-circuits it, so the call sites can simply `void` it.
 */
export function refreshIceServers(): Promise<void> {
  if (Date.now() < cachedUntil) return Promise.resolve();
  if (inFlight) return inFlight;

  inFlight = api
    .get<{ iceServers?: RTCIceServer[]; ttlSeconds?: number }>("/turn")
    .then(({ data }) => {
      const servers = data?.iceServers;
      if (Array.isArray(servers) && servers.length > 0) {
        // Keep the STUN defaults even if the server omitted them, then the
        // server's list (which may add TURN) on top.
        const hasStun = servers.some((server) => String(server.urls).includes("stun:"));
        ICE_SERVERS.iceServers = hasStun ? servers : [...DEFAULT_STUN, ...servers];
      }
      const ttl = typeof data?.ttlSeconds === "number" ? data.ttlSeconds * 1000 : 0;
      const reFetchIn = ttl > 0 ? Math.max(60_000, ttl - 60_000) : SUCCESS_TTL_MS;
      cachedUntil = Date.now() + reFetchIn;
    })
    .catch(() => {
      cachedUntil = Date.now() + FAILURE_TTL_MS;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
