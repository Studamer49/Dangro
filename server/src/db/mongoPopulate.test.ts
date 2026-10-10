import { describe, expect, it } from "vitest";
import { shapeDocuments } from "./mongoPopulate.js";
import { getModel } from "./mongoSchema.js";
import type { Document } from "mongodb";
import type { QueryContext } from "./mongoWhere.js";

/**
 * Regression tests for relation loading.
 *
 * The belongs-to bug this covers: the engine looked up related documents
 * using the *parent's own id* instead of the foreign key stored on it. A
 * FriendRequest._id never matches a User._id, so `sender` silently came back
 * null and pending friend requests counted 1 while rendering nothing.
 */

interface FakeCollection {
  find: (filter: Document, options?: unknown) => { toArray: () => Promise<Document[]> };
  aggregate: (pipeline: Document[], options?: unknown) => { toArray: () => Promise<Document[]> };
  countDocuments: (filter: Document) => Promise<number>;
}

/** Minimal in-memory collection supporting the equality filters we generate. */
function fakeCollection(docs: Document[]): FakeCollection {
  const matches = (doc: Document, filter: Document): boolean =>
    Object.entries(filter).every(([field, condition]) => {
      const value = doc[field];
      if (condition && typeof condition === "object" && "$in" in condition) {
        return (condition as { $in: unknown[] }).$in.map(String).includes(String(value));
      }
      return String(value) === String(condition);
    });

  return {
    find: (filter) => ({ toArray: async () => docs.filter((doc) => matches(doc, filter)) }),
    aggregate: () => ({ toArray: async () => [] }),
    countDocuments: async () => docs.length,
  };
}

const USERS: Document[] = [
  { _id: "user-a", username: "alice", avatar: null, password: "HASH", status: "offline" },
  { _id: "user-b", username: "bob", avatar: null, password: "HASH", status: "offline" },
];

function ctx(): QueryContext {
  return {
    collectionFor: (name) =>
      (name === "user" ? fakeCollection(USERS) : fakeCollection([])) as never,
  };
}

describe("shapeDocuments belongs-to relations", () => {
  const friendRequest = getModel("friendRequest");

  it("resolves sender via senderId, not the request's own id", async () => {
    const requests: Document[] = [
      { _id: "req-1", senderId: "user-b", receiverId: "user-a", status: "pending" },
    ];

    const shaped = await shapeDocuments(
      friendRequest,
      requests,
      { include: { sender: { select: { id: true, username: true, avatar: true } } } },
      ctx()
    );

    expect(shaped[0].sender).toEqual({ id: "user-b", username: "bob", avatar: null });
  });

  it("never leaks fields excluded by select (a password hash)", async () => {
    const requests: Document[] = [
      { _id: "req-1", senderId: "user-b", receiverId: "user-a", status: "pending" },
    ];

    const shaped = await shapeDocuments(
      friendRequest,
      requests,
      { include: { sender: { select: { id: true, username: true } } } },
      ctx()
    );

    const sender = shaped[0].sender as Record<string, unknown>;
    expect(sender.password).toBeUndefined();
    expect(Object.keys(sender).sort()).toEqual(["id", "username"]);
  });

  it("returns null when the referenced user is missing, instead of a wrong one", async () => {
    const requests: Document[] = [
      { _id: "req-1", senderId: "does-not-exist", receiverId: "user-a", status: "pending" },
    ];

    const shaped = await shapeDocuments(
      friendRequest,
      requests,
      { include: { sender: { select: { id: true } } } },
      ctx()
    );

    expect(shaped[0].sender).toBeNull();
  });

  it("maps each parent to its own related document", async () => {
    const requests: Document[] = [
      { _id: "req-1", senderId: "user-a", receiverId: "user-b", status: "pending" },
      { _id: "req-2", senderId: "user-b", receiverId: "user-a", status: "pending" },
    ];

    const shaped = await shapeDocuments(
      friendRequest,
      requests,
      { include: { sender: { select: { id: true, username: true } } } },
      ctx()
    );

    expect((shaped[0].sender as { username: string }).username).toBe("alice");
    expect((shaped[1].sender as { username: string }).username).toBe("bob");
  });

  it("handles a null foreign key", async () => {
    const requests: Document[] = [
      { _id: "req-1", senderId: null, receiverId: "user-a", status: "pending" },
    ];

    const shaped = await shapeDocuments(
      friendRequest,
      requests,
      { include: { sender: { select: { id: true } } } },
      ctx()
    );

    expect(shaped[0].sender).toBeNull();
  });
});