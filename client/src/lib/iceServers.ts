/**
 * ICE configuration.
 *
 * A direct peer-to-peer path is only found when at least one side is
 * reachable. STUN discovers each peer's public mapping; TURN *relays* media
 * when no direct path exists at all. Without a working TURN server, two people
 * both behind symmetric NAT (common on mobile data and corporate networks) get
 * a call that connects to nothing: you see your own camera, never theirs, and
 * nobody is audible.
 *
 * The public servers below are a best-effort default. They are free, heavily
 * rate-limited, and are blocked outright on some networks, so a deployment
 * that needs reliable calls should point these at its own relay:
 *
 *   VITE_TURN_URLS=turn:turn.example.com:3478?transport=tcp,turn:turn.example.com:3478
 *   VITE_TURN_URL   = a single URL (shorthand for the above)
 *   VITE_TURN_USERNAME=...
 *   VITE_TURN_CREDENTIAL=...
 */
const env = import.meta.env;

const DEFAULT_STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
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

export const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    ...DEFAULT_STUN,
    // The operator's relay wins when configured; otherwise the public one.
    ...(configuredTurn() ?? DEFAULT_TURN),
  ],
  // Ask the browser to try every candidate pair it gathers rather than settling
  // for the first that looks reachable. Without this a single early "connected"
  // candidate that later stalls leaves the call black instead of moving on to
  // the pair that actually works.
  iceCandidatePoolSize: 10,
  iceTransportPolicy: "all",
};