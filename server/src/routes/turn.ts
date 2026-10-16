import { Router } from "express";
import crypto from "crypto";
import { config } from "../config.js";
import { authenticate, AuthRequest, requireUser } from "../middleware/auth.js";
import { asyncHandler, ok } from "../lib/http.js";

const router = Router();

/**
 * Public STUN servers.
 *
 * These are the same defaults the client ships with. They are repeated here so
 * a client that has never been built with an ICE config still receives a
 * usable one, and so the STUN set can be tuned server-side without a rebuild.
 */
const STUN_SERVERS = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:stun2.l.google.com:19302", "stun:stun3.l.google.com:19302"] },
];

interface IceServerPayload {
  urls: string[];
  username?: string;
  credential?: string;
}

/**
 * The ICE servers a client should use for its next peer connection.
 *
 * A direct path between two peers is only found when at least one side is
 * reachable; behind symmetric NAT (mobile data, many corporate and national
 * networks) there is no such path and the media MUST be relayed. This endpoint
 * is where a configured TURN relay is handed to the browser — including
 * short-lived, per-user credentials when a secret is configured, so the relay
 * password itself is never shipped to the client.
 *
 * Deliberately never fails for the caller: an unconfigured relay simply
 * returns the STUN-only list, and the client keeps whatever fallback it has.
 */
router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = requireUser(req);
    const iceServers: IceServerPayload[] = [...STUN_SERVERS];

    if (config.turn.configured) {
      if (config.turn.secret) {
        // coturn REST API scheme: username is "<expiry>:<user>", credential is
        // base64(HMAC-SHA1(secret, username)). The relay recomputes it and
        // checks the expiry, so this credential is useless once it lapses.
        const expiry = Math.floor(Date.now() / 1000) + config.turn.ttlSeconds;
        const username = `${expiry}:${userId}`;
        const credential = crypto
          .createHmac("sha1", config.turn.secret)
          .update(username)
          .digest("base64");
        iceServers.push({ urls: config.turn.urls, username, credential });
      } else if (config.turn.username && config.turn.credential) {
        iceServers.push({
          urls: config.turn.urls,
          username: config.turn.username,
          credential: config.turn.credential,
        });
      } else {
        // No credentials at all: still useful for a relay that authenticates
        // by other means (IP allow-list, etc.).
        iceServers.push({ urls: config.turn.urls });
      }
    }

    ok(res, {
      iceServers,
      ttlSeconds: config.turn.configured ? config.turn.ttlSeconds : 0,
    });
  })
);

export default router;
