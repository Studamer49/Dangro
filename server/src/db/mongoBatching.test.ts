import { describe, expect, it } from "vitest";
import { shapeDocuments } from "./mongoPopulate.js";
import { getModel } from "./mongoSchema.js";
import type { Document } from "mongodb";
import type { QueryContext } from "./mongoWhere.js";

/**
 * Relation loading must stay batched.
 *
 * The bug this covers: children were shaped one document at a time, and
 * shaping a document resolves *its* relations. So a single page load issued
 * one query per child whenever the include nested another relation —
 * `members: { include: { user } }` on a 500-member server cost 501 round
 * trips, on a path the client hits on every channel switch
 * (`ChannelSidebar` calls `GET /channels/:id/server` each time).
 */

const MEMBER_COUNT = 40;

const USERS: Document[] = Array.from({ length: MEMBER_COUNT }, (_, index) => ({
  _id: `user-${index}`,
  username: `user${index}`,
  avatar: null,
  password: "HASH",
  status: "offline",
}));

const MEMBERS: Document[] = Array.from({ length: MEMBER_COUNT }, (_, index) => ({
  _id: `member-${index}`,
  serverId: "server-1",
  userId: `user-${index}`,
  role: "member",
  // member.defaultOrder is { joinedAt: "asc" }, so the fixture has to carry the
  // sort key or every document ties and the _id tiebreaker decides the order.
  joinedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)),
}));

/** Records which collection each `find` hit, so the query count is assertable. */
function countingCtx() {
  const calls: string[] = [];

  const matches = (doc: Document, filter: Document): boolean =>
    Object.entries(filter).every(([field, condition]) => {
      if (field === "$and") {
        return (condition as Document[]).every((f) => matches(doc, f));
      }
      const value = doc[field];
      const cond = condition as Record<string, unknown> | null;
      if (cond && typeof cond === "object" && "$in" in cond) {
        return (cond.$in as unknown[]).map(String).includes(String(value));
      }
      if (cond && typeof cond === "object" && "$ne" in cond) {
        return String(value) !== String(cond.$ne);
      }
      return String(value) === String(condition);
    });

  const collection = (name: string, docs: Document[]) => ({
    find: (filter: Document) => {
      calls.push(name);
      // Slicing is applied to a copy: mutating `matched` in place would let a
      // `skip` from one call leak into the next.
      let result = docs.filter((doc) => matches(doc, filter));
      const cursor = {
        sort: (spec: Record<string, 1 | -1>) => {
          const entries = Object.entries(spec);
          result = [...result].sort((a, b) => {
            for (const [field, dir] of entries) {
              const av = a[field];
              const bv = b[field];
              if (av === bv) continue;
              return (av > bv ? 1 : -1) * dir;
            }
            return 0;
          });
          return cursor;
        },
        limit: (n: number) => {
          result = result.slice(0, n);
          return cursor;
        },
        skip: (n: number) => {
          result = result.slice(n);
          return cursor;
        },
        toArray: async () => result.map((doc) => ({ ...doc })),
      };
      return cursor;
    },
    aggregate: () => {
      calls.push(`${name}:aggregate`);
      return { toArray: async () => [] };
    },
    countDocuments: async () => docs.length,
  });

  const ctx: QueryContext = {
    collectionFor: (name) => {
      if (name === "user") return collection(name, USERS) as never;
      if (name === "member") return collection(name, MEMBERS) as never;
      return collection(name, []) as never;
    },
  };

  const countFor = (name: string) => calls.filter((c) => c === name).length;
  return { ctx, countFor };
}

const server = getModel("server");
const parents: Document[] = [{ _id: "server-1", name: "Big Server", ownerId: "user-0" }];

describe("relation loading is batched", () => {
  it("loads a nested belongs-to once for the whole page, not once per child", async () => {
    const { ctx, countFor } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      parents,
      {
        select: { id: true },
        include: { members: { include: { user: { select: { id: true, username: true } } } } },
      },
      ctx
    );

    const members = shaped.members as Array<{ user: { username: string } | null }>;
    expect(members).toHaveLength(MEMBER_COUNT);
    expect(members[0].user?.username).toBe("user0");
    expect(members[MEMBER_COUNT - 1].user?.username).toBe(`user${MEMBER_COUNT - 1}`);

    // One member fetch and ONE user fetch for all 40 children. Before the fix
    // this was 1 + 40.
    expect(countFor("member")).toBe(1);
    expect(countFor("user")).toBe(1);
  });

  it("still applies select to the nested relation (no password leak)", async () => {
    const { ctx } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      parents,
      { select: { id: true }, include: { members: { include: { user: { select: { id: true } } } } } },
      ctx
    );

    const first = (shaped.members as Array<{ user: Record<string, unknown> }>)[0].user;
    expect(Object.keys(first).sort()).toEqual(["id"]);
    expect(first.password).toBeUndefined();
  });

  it("applies a nested take before shaping, so discarded children are not fetched", async () => {
    const { ctx, countFor } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      parents,
      {
        select: { id: true },
        include: { members: { take: 2, include: { user: { select: { id: true } } } } },
      },
      ctx
    );

    expect(shaped.members).toHaveLength(2);
    // One user query for the two retained children, not one per discarded one.
    expect(countFor("user")).toBe(1);
  });

  it("applies a nested skip before shaping", async () => {
    const { ctx } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      parents,
      { select: { id: true }, include: { members: { skip: 2, take: 2, select: { id: true, userId: true } } } },
      ctx
    );

    expect(shaped.members).toEqual([
      { id: "member-2", userId: "user-2" },
      { id: "member-3", userId: "user-3" },
    ]);
  });

  it("scopes children to the parents on the page", async () => {
    const { ctx, countFor } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      parents,
      { select: { id: true }, include: { members: { select: { id: true, userId: true } } } },
      ctx
    );

    expect(countFor("member")).toBe(1);
    expect(shaped.members).toHaveLength(MEMBER_COUNT);
    // Distinct children, each belonging to the one parent on the page.
    const ids = (shaped.members as Array<{ id: string }>).map((m) => m.id);
    expect(new Set(ids).size).toBe(MEMBER_COUNT);
  });

  it("returns an empty array for a parent with no children", async () => {
    const { ctx } = countingCtx();

    const [shaped] = await shapeDocuments(
      server,
      [{ _id: "server-empty", name: "Empty" }],
      { select: { id: true }, include: { members: true } },
      ctx
    );

    expect(shaped.members).toEqual([]);
  });
});
