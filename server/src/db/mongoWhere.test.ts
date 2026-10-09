import { describe, expect, it } from "vitest";
import { buildFilter, buildSort } from "./mongoWhere.js";
import { getModel } from "./mongoSchema.js";
import { safeUploadName } from "./storage.js";
import type { QueryContext } from "./mongoWhere.js";

/** Stands in for the database: `some` filters are the only part that reads. */
function ctxWith(children: Array<Record<string, unknown>>): QueryContext {
  return {
    collectionFor: () =>
      ({
        find: () => ({ toArray: async () => children }),
      }) as never,
  };
}

const emptyCtx: QueryContext = { collectionFor: () => ({ find: () => ({ toArray: async () => [] }) }) as never };

describe("buildFilter", () => {
  const message = getModel("message");

  it("returns an empty filter for no where clause", async () => {
    expect(await buildFilter(message, undefined, emptyCtx)).toEqual({});
    expect(await buildFilter(message, {}, emptyCtx)).toEqual({});
  });

  it("maps equality and explicit null", async () => {
    expect(await buildFilter(message, { channelId: "c1" }, emptyCtx)).toEqual({ channelId: "c1" });
    expect(await buildFilter(message, { replyToId: null }, emptyCtx)).toEqual({ replyToId: null });
  });

  it("combines multiple keys with $and", async () => {
    const filter = await buildFilter(message, { channelId: "c1", edited: false }, emptyCtx);
    expect(filter).toEqual({ $and: [{ channelId: "c1" }, { edited: false }] });
  });

  it("maps Prisma AND / OR / NOT", async () => {
    expect(
      await buildFilter(message, { AND: [{ channelId: "c1" }, { edited: true }] }, emptyCtx)
    ).toEqual({ $and: [{ channelId: "c1" }, { edited: true }] });

    expect(await buildFilter(message, { OR: [{ channelId: "c1" }, { channelId: "c2" }] }, emptyCtx)).toEqual({
      $or: [{ channelId: "c1" }, { channelId: "c2" }],
    });

    expect(await buildFilter(message, { NOT: [{ edited: true }] }, emptyCtx)).toEqual({
      $nor: [{ edited: true }],
    });
  });

  it("maps comparison operators", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    expect(await buildFilter(getModel("story"), { createdAt: { gt: now } }, emptyCtx)).toEqual({
      createdAt: { $gt: now },
    });
    expect(await buildFilter(message, { id: { in: ["a", "b"] } }, emptyCtx)).toEqual({
      id: { $in: ["a", "b"] },
    });
    expect(await buildFilter(message, { id: { notIn: ["a"] } }, emptyCtx)).toEqual({
      id: { $nin: ["a"] },
    });
    expect(await buildFilter(message, { content: { not: "spam" } }, emptyCtx)).toEqual({
      content: { $ne: "spam" },
    });
  });

  it("escapes regex metacharacters in contains / startsWith", async () => {
    const filter = (await buildFilter(message, { content: { contains: "a.b*" } }, emptyCtx)) as {
      content: { $regex: string };
    };
    expect(filter.content.$regex).toBe("a\\.b\\*");

    const starts = (await buildFilter(message, { content: { startsWith: "hi" } }, emptyCtx)) as {
      content: { $regex: string };
    };
    expect(starts.content.$regex).toBe("^hi");
  });

  it("applies mode: insensitive to string operators", async () => {
    const filter = (await buildFilter(
      getModel("user"),
      { username: { contains: "AB", mode: "insensitive" } },
      emptyCtx
    )) as { username: { $options?: string } };

    expect(filter.username.$options).toBe("i");
  });

  it("resolves relation `some` filters through the child's foreign key", async () => {
    // `user.memberships` is a has-many via Member.userId, so matching members
    // select their parent user ids.
    const ctx = ctxWith([
      { _id: "m1", userId: "u1", role: "owner" },
      { _id: "m2", userId: "u2", role: "owner" },
    ]);
    const filter = await buildFilter(getModel("user"), { memberships: { some: { role: "owner" } } }, ctx);
    expect(filter).toEqual({ _id: { $in: ["u1", "u2"] } });
  });

  it("rejects relation filters other than `some`", async () => {
    await expect(
      buildFilter(getModel("user"), { memberships: { every: { role: "owner" } } }, emptyCtx)
    ).rejects.toThrow(/not supported/);
  });

  it("rejects `some` on a to-one relation", async () => {
    await expect(
      buildFilter(getModel("message"), { author: { some: { username: "x" } } }, emptyCtx)
    ).rejects.toThrow(/cannot be used as a filter/);
  });

  it("rejects unknown fields so schema drift fails loudly", async () => {
    await expect(buildFilter(message, { nonsense: "x" }, emptyCtx)).rejects.toThrow(/Unknown field/);
  });
});

describe("buildSort", () => {
  it("maps directions and always adds a stable tiebreaker", () => {
    expect(buildSort(getModel("message"), { createdAt: "desc" })).toEqual({ createdAt: -1, _id: 1 });
    expect(buildSort(getModel("message"), { createdAt: "asc" })).toEqual({ createdAt: 1, _id: 1 });
  });

  it("accepts the array form used by multi-key sorts", () => {
    expect(buildSort(getModel("message"), [{ createdAt: "desc" }, { authorId: "asc" }])).toEqual({
      createdAt: -1,
      authorId: 1,
      _id: 1,
    });
  });

  it("returns undefined when nothing was requested", () => {
    expect(buildSort(getModel("message"), undefined)).toBeUndefined();
  });
});

describe("safeUploadName", () => {
  it("accepts the uuid + extension form the uploader produces", () => {
    expect(safeUploadName("3f2a1b4c-1111-2222-3333-444455556666.png")).toBe(
      "3f2a1b4c-1111-2222-3333-444455556666.png"
    );
  });

  it("rejects traversal and unexpected extensions", () => {
    expect(safeUploadName("../../server/.env")).toBeNull();
    expect(safeUploadName("evil.html")).toBeNull();
    expect(safeUploadName("noextension")).toBeNull();
    expect(safeUploadName("x.png/../../y")).toBeNull();
  });
});