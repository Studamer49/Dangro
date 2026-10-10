import { describe, expect, it } from "vitest";
import { toFriendList } from "./friends.js";

type FriendUser = { id: string; username: string; avatar: string | null; status: string };

/**
 * Regression tests for the friend list.
 *
 * The bug these cover: accepting a request writes two directed rows — `A→B`
 * and `B→A` — so either side can find the friendship with one query. The
 * friends list then matched *both* rows and rendered every friend twice.
 */

const at = new Date("2026-01-01T00:00:00.000Z");

const alice = { id: "user-alice", username: "alice", avatar: null, status: "offline" };
const bob = { id: "user-bob", username: "bob", avatar: null, status: "online" };
const carol = { id: "user-carol", username: "carol", avatar: null, status: "idle" };

const row = (id: string, userId: string, friendId: string, user: FriendUser | null, friend: FriendUser | null) => ({
  id,
  userId,
  friendId,
  createdAt: at,
  user,
  friend,
});

describe("toFriendList", () => {
  it("returns one entry per friend when both directed rows exist", () => {
    const friends = toFriendList(
      [
        row("edge-1", "user-alice", "user-bob", alice, bob),
        row("edge-2", "user-bob", "user-alice", bob, alice),
      ],
      "user-alice"
    );

    expect(friends).toHaveLength(1);
    expect(friends[0].friend.username).toBe("bob");
  });

  it("resolves the other user from either direction", () => {
    const fromAlice = toFriendList(
      [row("edge-1", "user-alice", "user-bob", alice, bob), row("edge-2", "user-bob", "user-alice", bob, alice)],
      "user-alice"
    );
    const fromBob = toFriendList(
      [row("edge-1", "user-alice", "user-bob", alice, bob), row("edge-2", "user-bob", "user-alice", bob, alice)],
      "user-bob"
    );

    expect(fromAlice[0].friend.username).toBe("bob");
    expect(fromBob[0].friend.username).toBe("alice");
  });

  it("keeps distinct friends separate", () => {
    const friends = toFriendList(
      [
        row("edge-1", "user-alice", "user-bob", alice, bob),
        row("edge-2", "user-bob", "user-alice", bob, alice),
        row("edge-3", "user-alice", "user-carol", alice, carol),
        row("edge-4", "user-carol", "user-alice", carol, alice),
      ],
      "user-alice"
    );

    expect(friends.map((f) => f.friend.username)).toEqual(["bob", "carol"]);
  });

  it("keys the entry by the other user's id, not the row id", () => {
    const friends = toFriendList([row("edge-2", "user-bob", "user-alice", bob, alice)], "user-alice");

    expect(friends[0].id).toBe("user-bob");
  });

  it("is stable when the duplicate row arrives first", () => {
    const rows = [
      row("edge-2", "user-bob", "user-alice", bob, alice),
      row("edge-1", "user-alice", "user-bob", alice, bob),
    ];

    expect(toFriendList(rows, "user-alice")).toEqual(toFriendList([...rows].reverse(), "user-alice"));
  });

  it("still lists a friendship stored in one direction only", () => {
    // A half-applied accept must not make the friend disappear.
    const friends = toFriendList([row("edge-1", "user-alice", "user-bob", alice, bob)], "user-alice");

    expect(friends).toHaveLength(1);
    expect(friends[0].friend.username).toBe("bob");
  });

  it("drops a row whose other user could not be loaded", () => {
    const friends = toFriendList(
      [
        // alice's side of a friendship with a user that no longer resolves
        row("edge-1", "user-alice", "user-gone", alice, null),
        row("edge-2", "user-bob", "user-alice", bob, alice),
      ],
      "user-alice"
    );

    expect(friends).toHaveLength(1);
    expect(friends[0].friend.username).toBe("bob");
  });

  it("returns nothing when there are no friendships", () => {
    expect(toFriendList([], "user-alice")).toEqual([]);
  });

  it("ignores a self-directed row", () => {
    const friends = toFriendList([row("edge-1", "user-alice", "user-alice", alice, alice)], "user-alice");

    expect(friends).toHaveLength(1);
    expect(friends[0].friend.username).toBe("alice");
  });
});
