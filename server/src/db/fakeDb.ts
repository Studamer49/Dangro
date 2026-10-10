import type { Document } from "mongodb";

/**
 * A tiny in-memory stand-in for the handful of MongoDB operations the query
 * engine calls, so tests can exercise `createMongoClient` end to end without
 * a running server.
 *
 * Supports the operators `buildFilter` actually emits. Anything else throws,
 * so an unsupported query fails the test instead of passing for the wrong
 * reason.
 */

function matchValue(actual: unknown, expected: unknown): boolean {
  const isOperatorSpec =
    expected !== null &&
    typeof expected === "object" &&
    !Array.isArray(expected) &&
    !(expected instanceof Date) &&
    Object.keys(expected).some((key) => key.startsWith("$"));

  if (isOperatorSpec) {
    const spec = expected as Record<string, unknown>;
    return Object.entries(spec).every(([op, want]) => {
      switch (op) {
        case "$in":
          return (want as unknown[]).some((v) => String(v) === String(actual));
        case "$nin":
          return !(want as unknown[]).some((v) => String(v) === String(actual));
        case "$ne":
          return String(actual) !== String(want);
        case "$lt":
          return actual instanceof Date && want instanceof Date
            ? actual.getTime() < want.getTime()
            : Number(actual) < Number(want);
        case "$lte":
          return actual instanceof Date && want instanceof Date
            ? actual.getTime() <= want.getTime()
            : Number(actual) <= Number(want);
        case "$gt":
          return actual instanceof Date && want instanceof Date
            ? actual.getTime() > want.getTime()
            : Number(actual) > Number(want);
        case "$gte":
          return actual instanceof Date && want instanceof Date
            ? actual.getTime() >= want.getTime()
            : Number(actual) >= Number(want);
        case "$regex":
          return new RegExp(String(want), String(spec.$options ?? "")).test(String(actual));
        case "$options":
          return true;
        default:
          throw new Error(`fakeDb: unsupported operator ${op}`);
      }
    });
  }

  if (Array.isArray(expected)) return expected.some((v) => String(v) === String(actual));
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime();
  }
  return String(actual) === String(expected);
}

export function matches(doc: Document, filter: Document): boolean {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === "$and") return (condition as Document[]).every((f) => matches(doc, f));
    if (key === "$or") return (condition as Document[]).some((f) => matches(doc, f));
    if (key === "$nor") return !(condition as Document[]).some((f) => matches(doc, f));
    if (key === "$not") return !matches(doc, condition as Document);
    return matchValue(doc[key], condition);
  });
}

export interface FakeDb {
  db: unknown;
  /** Raw documents per collection name, for assertions. */
  collections: Map<string, Document[]>;
}

export function fakeDb(): FakeDb {
  const collections = new Map<string, Document[]>();
  const docsFor = (name: string): Document[] => {
    let docs = collections.get(name);
    if (!docs) {
      docs = [];
      collections.set(name, docs);
    }
    return docs;
  };

  const db = {
    collection(name: string) {
      const docs = docsFor(name);
      return {
        async insertOne(doc: Document) {
          if (docs.some((d) => d._id === doc._id)) {
            const err = new Error(`E11000 duplicate key error`) as Error & { code: number };
            err.code = 11000;
            throw err;
          }
          docs.push(doc);
          return { insertedId: doc._id };
        },

        async findOne(filter: Document) {
          return docs.find((doc) => matches(doc, filter)) ?? null;
        },

        async findOneAndDelete(filter: Document) {
          const index = docs.findIndex((doc) => matches(doc, filter));
          if (index === -1) return null;
          return docs.splice(index, 1)[0];
        },

        async findOneAndUpdate(filter: Document, update: Document) {
          const doc = docs.find((candidate) => matches(candidate, filter));
          if (!doc) return null;
          Object.assign(doc, update.$set ?? {});
          return { ...doc };
        },

        find(filter: Document) {
          let result = docs.filter((doc) => matches(doc, filter));
          const cursor = {
            sort(spec: Record<string, 1 | -1>) {
              const entries = Object.entries(spec);
              result = [...result].sort((a, b) => {
                for (const [field, dir] of entries) {
                  const av = a[field] instanceof Date ? a[field].getTime() : a[field];
                  const bv = b[field] instanceof Date ? b[field].getTime() : b[field];
                  if (av === bv) continue;
                  return (av > bv ? 1 : -1) * dir;
                }
                return 0;
              });
              return cursor;
            },
            limit(n: number) {
              result = result.slice(0, n);
              return cursor;
            },
            skip(n: number) {
              result = result.slice(n);
              return cursor;
            },
            async toArray() {
              return result.map((doc) => ({ ...doc }));
            },
          };
          return cursor;
        },

        async countDocuments(filter: Document = {}) {
          return docs.filter((doc) => matches(doc, filter)).length;
        },

        async updateMany(filter: Document, update: Document) {
          const hit = docs.filter((doc) => matches(doc, filter));
          for (const doc of hit) Object.assign(doc, update.$set ?? {});
          return { modifiedCount: hit.length, matchedCount: hit.length };
        },

        async deleteMany(filter: Document) {
          const before = docs.length;
          const kept = docs.filter((doc) => !matches(doc, filter));
          docs.length = 0;
          docs.push(...kept);
          return { deletedCount: before - kept.length };
        },

        aggregate() {
          return { async toArray() { return []; } };
        },
      };
    },
  };

  return { db, collections };
}

export function rows(fakedb: FakeDb, collection: string): Document[] {
  return fakedb.collections.get(collection) ?? [];
}