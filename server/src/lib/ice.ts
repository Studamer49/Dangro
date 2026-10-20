import { config } from "../config.js";

/**
 * The ICE configuration browsers use to reach a call peer.
 *
 * A peer-to-peer call needs two different things:
 *
 *   STUN  tells each side what the rest of the internet sees it as, so the two
 *         can usually connect directly.
 *   TURN  actually *carries* the audio and video when no direct route exists.
 *
 * STUN on its own is not enough. Two people both behind symmetric NAT — mobile
 * data, most corporate networks, several VPNs — discover no usable candidate
 * pair, and without a relay they get a call that shows their own camera,
 * connects no media, and carries no sound.
 *
 * Serving this from the API (rather than hardcoding it in the bundle) is what
 * makes a relay swappable: change TURN_URLS in the environment and every open
 * tab picks it up on the next call, with no client rebuild and no rebuild of
 * anything the browser has cached.
 */

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Every server the client should try, best relay first. */
export function iceServerList(): IceServerConfig[] {
  const servers: IceServerConfig[] = [];

  if (config.rtc.turnUrls.length > 0) {
    servers.push({
      urls: config.rtc.turnUrls,
      ...(config.rtc.turnUsername ? { username: config.rtc.turnUsername } : {}),
      ...(config.rtc.turnCredential ? { credential: config.rtc.turnCredential } : {}),
    });
  } else {
    // No relay configured: fall back to the free public one so calls still work
    // on ordinary home networks instead of failing outright.
    servers.push(config.rtc.fallbackTurn);
  }

  if (config.rtc.stunUrls.length > 0) {
    servers.push({ urls: config.rtc.stunUrls });
  }

  return servers;
}

/** The `RTCConfiguration` handed to `new RTCPeerConnection(...)`. */
export function rtcConfiguration(): RTCConfigurationLike {
  return {
    iceServers: iceServerList(),
    // Try every candidate pair instead of settling for the first that merely
    // looks reachable: one early pair that later stalls otherwise leaves the
    // call black rather than moving on to the one that works.
    iceCandidatePoolSize: 10,
    iceTransportPolicy: "all",
  };
}

/**
 * Mirrors the DOM lib's `RTCConfiguration` without depending on it.
 *
 * The server runs in Node, where `RTCPeerConnection` does not exist, so this
 * interface exists purely to give `rtcConfiguration()` a return type that
 * TypeScript can check structurally against the browser's.
 */
export interface RTCConfigurationLike {
  iceServers: IceServerConfig[];
  iceCandidatePoolSize?: number;
  iceTransportPolicy?: RTCIceTransports;
}

/** Union alias kept local so no DOM lib has to be referenced. */
type RTCIceTransports = "all" | "relay";

/** Whether the operator has pointed this deployment at its own relay. */
export function hasConfiguredTurn(): boolean {
  return config.rtc.turnUrls.length > 0;
}