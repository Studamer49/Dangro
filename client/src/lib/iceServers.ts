/**
 * ICE configuration for calls and voice channels.
 *
 * Getting two browsers to talk to each other needs two different things:
 *
 *   STUN  tells each side what the rest of the internet sees it as, so the two
 *         can usually connect directly.
 *   TURN  actually carries the audio and video when no direct route exists.
 *
 * STUN alone is not enough. Two people both behind symmetric NAT — mobile data,
 * most corporate networks, several VPNs — discover no usable candidate pair at
 * all, and without a relay the call shows your own camera, connects no media,
 * and carries no sound. That is the usual reason "calling does not work" on a
 * network that looks perfectly ordinary.
 *
 * The list is fetched from `GET /api/rtc/ice-servers` rather than baked in,
 * because the useful relays need credentials and a credential in the bundle is
 * a public, rate-limited credential for everyone. Fetching it means pointing
 * TURN_URLS at any hosted relay (Metered, OpenRelay, Xirsys, Cloudflare, or
 * your own coturn) fixes calls for every browser without a client rebuild.
 *
 * The built-in list below is only the fallback for when that fetch has not
 * completed or has failed, so a call started immediately still has something
 * to try.
 */

const env = import.meta.env;

const FALLBACK_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:global.stun.twilio.com:3478" },
];

const FALLBACK_TURN = [
  {
    urls: [
      "turn:relay.metered.ca:80",
      "turn:relay.metered.ca:80?transport=tcp",
      "turn:relay.metered.ca:443",
      "turn:relay.metered.ca:443?transport=tcp",
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

/**
 * A relay configured at build time.
 *
 * Kept because `VITE_TURN_*` may still be set on an existing deployment, and it
 * is merged ahead of the fetched list so a deliberate build-time setting keeps
 * winning. New deployments should use the server-side variables instead.
 */
function buildTimeTurn(): RTCIceServer[] {
  const raw = (env.VITE_TURN_URLS ?? env.VITE_TURN_URL ?? "").trim();
  if (!raw) return [];

  const urls = raw
    .split(",")
    .map((url: string) => url.trim())
    .filter(Boolean);
  if (urls.length === 0) return [];

  const username = (env.VITE_TURN_USERNAME ?? "").trim();
  const credential = (env.VITE_TURN_CREDENTIAL ?? "").trim();

  return [{ urls, ...(username ? { username } : {}), ...(credential ? { credential } : {}) }];
}

function baseConfiguration(iceServers: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers,
    // Try every candidate pair rather than settling for the first that merely
    // looks reachable. Without this a single early "connected" candidate that
    // later stalls leaves the call black instead of moving on to a pair that
    // actually works.
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
  };
}

/** Used until (or if) the server's list arrives. */
export const FALLBACK_ICE_SERVERS: RTCConfiguration = baseConfiguration([
  ...buildTimeTurn(),
  ...FALLBACK_TURN,
  ...FALLBACK_STUN,
]);

let current: RTCConfiguration = FALLBACK_ICE_SERVERS;

/** What `new RTCPeerConnection(...)` should be given right now. */
export function getIceConfiguration(): RTCConfiguration {
  return current;
}

/**
 * Replaces the configuration with the one the API served.
 *
 * Called once per session, before any call is placed. A failure here is not
 * worth surfacing: the fallback list is already usable, so the only consequence
 * is that this deployment keeps using the free public relay instead of its own.
 */
export function applyIceServers(payload: unknown): boolean {
  const list = (payload as { iceServers?: unknown })?.iceServers;
  if (!Array.isArray(list) || list.length === 0) return false;

  const valid = list.filter((entry): entry is RTCIceServer => {
    if (!entry || typeof entry !== "object") return false;
    const urls = (entry as RTCIceServer).urls;
    return typeof urls === "string" || (Array.isArray(urls) && urls.length > 0);
  });
  if (valid.length === 0) return false;

  current = baseConfiguration([...buildTimeTurn(), ...valid]);
  return true;
}