import { Router } from "express";
import { ok } from "../lib/http.js";
import { hasConfiguredTurn, iceServerList } from "../lib/ice.js";

/**
 * ICE discovery for browser calls.
 *
 * The client cannot work out which STUN/TURN servers to use on its own: the
 * useful relays all need credentials, and those must not live in a bundle the
 * browser downloads. So the API serves them here instead, and the client
 * fetches the list once at startup.
 *
 * This is what makes a call fixable without shipping a new client. Point
 * TURN_URLS / TURN_USERNAME / TURN_CREDENTIAL at any hosted relay — Metered,
 * OpenRelay, Xirsys, Cloudflare, or your own coturn — and every browser that
 * opens the app afterwards picks it up.
 */
const router = Router();

/**
 * Public: this carries no user data and no secret beyond the TURN credential
 * that already has to reach the browser to be usable at all. The caller's
 * identity is irrelevant here, so an unauthenticated fetch must not fail —
 * a failed fetch would silently leave the client on its hardcoded defaults,
 * which is the failure mode this endpoint exists to remove.
 */
router.get("/rtc/ice-servers", (_req, res) => {
  ok(res, {
    iceServers: iceServerList(),
    /** Reported so the UI can warn when only the free public relay is in use. */
    configuredTurn: hasConfiguredTurn(),
  });
});

export default router;