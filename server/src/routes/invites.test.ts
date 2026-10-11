import { describe, expect, it } from "vitest";
import { inviteState } from "./invites.js";

/**
 * Invite lifetime rules.
 *
 * An invite is redeemable only while it is inside both its time window and its
 * use cap. Both are computed here rather than in the database, because MongoDB
 * has no partial index to express them and a stale invite must be rejected at
 * redemption time, not merely hidden in the list.
 */

const future = (ms: number) => new Date(Date.now() + ms);
const past = (ms: number) => new Date(Date.now() - ms);

describe("inviteState", () => {
  it("is open with no expiry and no cap", () => {
    const state = inviteState({ uses: 0, maxUses: null, expiresAt: null });
    expect(state).toEqual({ expired: false, exhausted: false });
  });

  it("stays open after many uses when there is no cap", () => {
    expect(inviteState({ uses: 9999, maxUses: null, expiresAt: null }).exhausted).toBe(false);
  });

  it("closes once the use cap is reached", () => {
    expect(inviteState({ uses: 2, maxUses: 2 }).exhausted).toBe(true);
    expect(inviteState({ uses: 3, maxUses: 2 }).exhausted).toBe(true);
  });

  it("stays open one use short of the cap", () => {
    expect(inviteState({ uses: 1, maxUses: 2 }).exhausted).toBe(false);
  });

  it("closes once the expiry has passed", () => {
    expect(inviteState({ uses: 0, expiresAt: past(1000) }).expired).toBe(true);
  });

  it("treats the exact expiry instant as expired", () => {
    // `<=` rather than `<`: at the boundary the invite is already dead.
    expect(inviteState({ uses: 0, expiresAt: new Date() }).expired).toBe(true);
  });

  it("stays open before the expiry", () => {
    expect(inviteState({ uses: 0, expiresAt: future(60_000) }).expired).toBe(false);
  });

  it("reports both flags independently", () => {
    const dead = inviteState({ uses: 5, maxUses: 5, expiresAt: past(1000) });
    expect(dead).toEqual({ expired: true, exhausted: true });

    const expiredButUnused = inviteState({ uses: 0, maxUses: 5, expiresAt: past(1000) });
    expect(expiredButUnused).toEqual({ expired: true, exhausted: false });
  });

  it("treats an undefined cap as unlimited", () => {
    // The Mongo shim can leave the field absent on documents written before it
    // existed; that must not read as "0 uses allowed".
    expect(inviteState({ uses: 3 }).exhausted).toBe(false);
    expect(inviteState({ uses: 3, maxUses: undefined }).exhausted).toBe(false);
  });

  it("treats a null expiry as never expiring", () => {
    expect(inviteState({ uses: 0, expiresAt: null }).expired).toBe(false);
    expect(inviteState({ uses: 0, expiresAt: undefined }).expired).toBe(false);
  });
});
