/**
 * Host classification for URLs the *browser* is about to load.
 *
 * The bug this exists to prevent: `MEDIA_PUBLIC_URL` was only checked for
 * presence, so a value like `http://192.168.1.50:8081` was accepted and turned
 * into a 302 target for every `/uploads/:name` request. Browsers treat a load
 * of a private-range address from a public page as a local-network request and
 * gate it behind "…wants to see devices on your local network", which is both
 * an untrustworthy prompt and an image that never loads.
 *
 * Kept separate from `lib/urls.ts` (user-supplied media URLs) because this one
 * answers a different question: not "is this string safe" but "is this host one
 * a browser may be told to fetch from".
 */

/** Hostnames that always mean "this machine" or "this LAN". */
const LOCAL_NAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

/** Suffixes reserved for names that only resolve inside a local network. */
const PRIVATE_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa", ".lan"];

/**
 * Parses dotted-quad IPv4 into four octets, or null when the host is not a
 * literal IPv4 address. Leading zeros and short forms (`010.0.0.1`, `127.1`)
 * are deliberately rejected rather than normalised: `new URL()` already
 * canonicalises the host for us, so anything reaching here in an odd shape is
 * not something we should be trusting.
 */
function parseIPv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** RFC 1918 / RFC 4193 / loopback / link-local / CGNAT / "this network". */
function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  return false;
}

/** IPv6 loopback, unspecified, unique-local (fc00::/7) and link-local (fe80::/10). */
function isPrivateIPv6(host: string): boolean {
  const bare = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (bare === "::1" || bare === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(bare)) return true; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(bare)) return true; // fe80::/10 link-local
  // An IPv4-mapped or IPv4-compatible address is only as public as the v4 part.
  const embedded = /(?:^::ffff:|^::)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (embedded) {
    const octets = parseIPv4(embedded[1]);
    if (octets) return isPrivateIPv4(octets);
  }
  return false;
}

/** True when the host is loopback, LAN-only, or otherwise not publicly routable. */
export function isPrivateHost(host: string): boolean {
  const trimmed = host.trim().toLowerCase().replace(/\.$/, "");
  if (!trimmed) return true;

  if (LOCAL_NAMES.has(trimmed)) return true;
  if (PRIVATE_SUFFIXES.some((suffix) => trimmed.endsWith(suffix))) return true;

  // A bare label with no dot ("nas", "media-host") resolves through the local
  // resolver only, so treat it as private too.
  if (!trimmed.includes(".") && !trimmed.includes(":")) return true;

  if (trimmed.startsWith("[")) return isPrivateIPv6(trimmed);
  if (trimmed.includes(":")) return isPrivateIPv6(trimmed);

  const octets = parseIPv4(trimmed);
  if (octets) return isPrivateIPv4(octets);

  return false;
}

/**
 * The scheme+host a browser would be sent to, or null when the value is
 * unusable or must not be handed to a browser.
 *
 * Rejects anything that is not https, and anything that resolves inside the
 * user's network — the two conditions that make a browser show a local-network
 * permission prompt instead of loading the image.
 */
export function publicOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  // Plain http on a public host is still downgradable and, on an https page,
  // blocked as mixed content. https is the only scheme a browser-facing media
  // origin may use.
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (isPrivateHost(parsed.hostname)) return null;

  return parsed.origin;
}