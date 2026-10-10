import type { ClientSession, Collection, Db, Document, Filter } from "mongodb";
import { MODELS, getModel, type ModelDef, type RelationDef } from "./mongoSchema.js";
import { runWithSession, sessionOpts } from "./session.js";
import { buildFilter, buildSort, type QueryContext } from "./mongoWhere.js";
import { shapeDocuments, type ShapeArgs } from "./mongoPopulate.js";

/**
 * A Prisma-shaped client backed by MongoDB.
 *
 * Only the subset of the Prisma API that the routes actually use is
 * implemented (see `mongoSchema.ts` for the contract). The object is exported
 * as the `prisma` singleton, so no route file changes when the MongoDB
 * backend is selected.
 *
 * Anything unsupported throws a descriptive error at runtime instead of
 * silently returning the wrong rows.
 */

/** Mirrors Prisma's "record not found" failure so route error handling matches. */
export class PrismaNotFoundError extends Error {
  readonly code = "P2025";
  readonly meta = { cause: "Record to update/delete not found." };

  constructor(model: string) {
    super(`An operation failed because it depends on one or more records that were required but not found. Record to update/delete not found. (model: ${model})`);
    this.name = "PrismaClientKnownRequestError";
  }
}

export class UnsupportedOperationError extends Error {
  constructor(operation: string, model: string) {
    super(
      `The MongoDB backend does not support prisma.${model}.${operation}(). Use the Prisma/PostgreSQL backend for this route.`
    );
    this.name = "UnsupportedOperationError";
  }
}

type Where = Record<string, unknown>;

/**
 * Upper bound on rows a single `deleteMany` will cascade from. The only
 * unbounded call is the expired-story sweep, which has nothing pointing at
 * it; the cap just keeps a pathological filter from loading every id into
 * memory before deleting.
 */
const CASCADE_DELETE_LIMIT = 10_000;

/**
 * Lazy operation, equivalent to Prisma's PrismaPromise: nothing runs until it
 * is awaited, which is what lets `$transaction([...])` collect operations
 * before executing them.
 */
class LazyOp<T> implements PromiseLike<T> {
  constructor(private readonly run: () => Promise<T>) {}

  then<R1 = T, R2 = never>(
    onfulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  catch<R = never>(onrejected?: ((reason: unknown) => R | PromiseLike<R>) | null): PromiseLike<T | R> {
    return this.then(undefined, onrejected);
  }
}

export interface DataArgs extends ShapeArgs {
  data: Record<string, unknown>;
}

export interface WhereArgs extends ShapeArgs {
  where: Where;
}

/** Prisma's `upsert` takes `create` and `update` separately, not one `data`. */
export interface UpsertArgs extends ShapeArgs {
  where: Where;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
}

export interface FindManyArgs extends ShapeArgs {
  where?: Where;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    );
  }
  return value;
}

/** Builds a filter from a `where` used by findUnique/update/delete. */
function uniqueFilter(model: ModelDef, where: Where): Filter<Document> {
  const filter: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if (key === "id") {
      filter._id = value;
      continue;
    }

    // A compound key arrives as `{ userId_serverId: { userId, serverId } }`.
    // A single-field unique declared in `uniques` (e.g. Server.inviteCode)
    // arrives as a plain scalar, so the guard has to be the shape of the
    // value, not the presence of a registered key. Indexing a string by field
    // name yields undefined, which made every such lookup match nothing.
    const compound = model.uniques[key];
    if (compound && value !== null && typeof value === "object") {
      const spec = value as Record<string, unknown>;
      for (const field of compound) filter[field] = spec[field];
      continue;
    }

    if (model.fields[key]) {
      filter[key] = value;
      continue;
    }

    throw new Error(
      `findUnique on "${model.name}" needs a unique field or a registered compound key; got "${key}". Add it to mongoSchema.ts uniques.`
    );
  }

  if (Object.keys(filter).length === 0) {
    throw new Error(`findUnique on "${model.name}" requires a where clause.`);
  }

  return filter as Filter<Document>;
}

/**
 * Splits Prisma's `data` into the scalars that belong on this document and
 * the nested relation writes, which become documents in their own collection.
 *
 * A relation key carrying nested syntax is the signal. A relation key carrying
 * a plain scalar is not something Prisma allows, so treating it as a normal
 * field would only ever hide a mistake.
 */
function splitNestedWrites(
  model: ModelDef,
  data: Record<string, unknown>
): { scalars: Record<string, unknown>; nested: Array<[RelationDef, Record<string, unknown>]> } {
  const scalars: Record<string, unknown> = {};
  const nested: Array<[RelationDef, Record<string, unknown>]> = [];

  for (const [key, value] of Object.entries(stripUndefined(data) as Record<string, unknown>)) {
    const relation = model.relations.find((r) => r.name === key);
    const isNestedSpec =
      relation && !model.fields[key] && value !== null && typeof value === "object" && !Array.isArray(value);

    if (isNestedSpec) nested.push([relation as RelationDef, value as Record<string, unknown>]);
    else scalars[key] = value;
  }

  return { scalars, nested };
}

function toStorage(model: ModelDef, data: Record<string, unknown>): Document {
  const doc: Document = {};

  for (const [key, value] of Object.entries(stripUndefined(data) as Record<string, unknown>)) {
    if (key === "id") {
      doc._id = value;
      continue;
    }
    const field = model.fields[key];
    if (!field && model.relations.some((r) => r.name === key)) {
      // A nested write reached a path that does not handle them. Storing the
      // key verbatim would bury a literal `{ create: ... }` object inside the
      // parent document and create no related row at all — a silent data loss
      // that still answers the request with a plausible-looking body.
      throw new UnsupportedOperationError(`nested write on "${key}"`, model.name);
    }
    if (value instanceof Date) {
      doc[key] = value;
    } else if (field?.type === "date" && typeof value === "string") {
      doc[key] = new Date(value);
    } else {
      doc[key] = value;
    }
  }

  return doc;
}

/** Fills in declared defaults, and stamps `updatedAt` on non-create writes. */
function applyDefaults(model: ModelDef, doc: Document, isCreate: boolean): Document {
  const now = new Date();

  for (const [field, def] of Object.entries(model.fields)) {
    if (def.default === undefined) continue;
    if (doc[field] !== undefined) continue;
    if (isCreate) doc[field] = typeof def.default === "function" ? def.default() : def.default;
  }

  if (!isCreate && model.fields.updatedAt) doc.updatedAt = now;
  return doc;
}

/**
 * The collections whose rows point at `modelName` through a foreign key.
 *
 * Derived from the registry rather than hand-listed, so it stays correct as
 * models are added. Every such relation is declared `onDelete: Cascade` in
 * schema.prisma, and MongoDB enforces nothing on its own.
 */
function cascadeTargets(modelName: string): Array<{ model: ModelDef; field: string }> {
  const targets: Array<{ model: ModelDef; field: string }> = [];

  for (const child of Object.values(MODELS)) {
    for (const relation of child.relations) {
      if (relation.ownKey && relation.target === modelName) {
        targets.push({ model: child, field: relation.ownKey });
      }
    }
  }

  return targets;
}

/**
 * The sort used when a query asks for no explicit `orderBy`.
 *
 * Reads the model's declared `defaultOrder` — the same one the relation
 * loader honours — so an unordered `findMany` returns the same rows in the
 * same order on both backends. Hardcoding `createdAt` instead meant a model
 * keyed on another column (follows by `createdAt`, members by `joinedAt`)
 * came back in a different order on MongoDB than on PostgreSQL.
 */
function defaultSort(model: ModelDef): Record<string, 1 | -1> {
  return buildSort(model, model.defaultOrder) ?? { _id: 1 };
}

export interface MongoDelegate {
  findUnique(args: WhereArgs): LazyOp<Record<string, unknown> | null>;
  findFirst(args?: FindManyArgs): LazyOp<Record<string, unknown> | null>;
  findMany(args?: FindManyArgs): LazyOp<Record<string, unknown>[]>;
  create(args: DataArgs): LazyOp<Record<string, unknown>>;
  update(args: DataArgs & { where: Where }): LazyOp<Record<string, unknown>>;
  upsert(args: UpsertArgs): LazyOp<Record<string, unknown>>;
  updateMany(args: { where?: Where; data: Record<string, unknown> }): LazyOp<{ count: number }>;
  delete(args: WhereArgs): LazyOp<Record<string, unknown>>;
  deleteMany(args?: { where?: Where }): LazyOp<{ count: number }>;
  count(args?: { where?: Where }): LazyOp<number>;
  aggregate(args: unknown): never;
  createMany(args: unknown): never;
}

/**
 * True when the deployment cannot run multi-document transactions —
 * a standalone `mongod`, or a shared cluster tier that refuses them.
 *
 * Exported for tests: misclassifying this would either break a working
 * transaction or silently downgrade a real error into a partial write.
 */
export function transactionsUnsupported(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (!/transaction/i.test(message)) return false;
  return (
    /transaction numbers are only allowed/i.test(message) ||
    /transactions are not supported/i.test(message) ||
    /transaction numbers/i.test(message) ||
    /not supported/i.test(message)
  );
}

/** The part of the driver's MongoClient this module relies on. */
export interface MongoClientDriver {
  connect(): Promise<unknown>;
  close(): Promise<void>;
  startSession(): ClientSession;
}

function createDelegate(modelName: string, db: Db): MongoDelegate {
  const model = getModel(modelName);
  const collection = (): Collection<Document> => db.collection(model.collection);

  const ctx: QueryContext = {
    collectionFor: (name) => db.collection(getModel(name).collection),
  };

  const applyShape = async (
    docs: Document[],
    args: ShapeArgs
  ): Promise<Record<string, unknown>[]> => shapeDocuments(model, docs, args, ctx);

  const buildData = (data: Record<string, unknown>, isCreate: boolean): Document =>
    applyDefaults(model, toStorage(model, data), isCreate);

  /**
   * Writes the related documents for Prisma's nested `create`, stamping the
   * parent's id onto each one.
   *
   * Only `create` is supported. `connect`, `createMany`, `update` and friends
   * throw rather than quietly doing nothing, because the alternative — the
   * behaviour before this existed — was to embed the spec in the parent
   * document and create no rows, which reads as success from the outside.
   */
  const runNestedCreates = async (
    nested: Array<[RelationDef, Record<string, unknown>]>,
    parentId: string
  ): Promise<void> => {
    for (const [relation, spec] of nested) {
      const unsupported = Object.keys(spec).filter((key) => key !== "create");
      if (unsupported.length > 0) {
        throw new UnsupportedOperationError(
          `nested "${unsupported.join("/")}" on "${relation.name}"`,
          relation.target
        );
      }

      // For a has-many the foreign key lives on the child. A belongs-to nested
      // create would set the key on the parent instead, which is a shape no
      // route uses, so refuse rather than guess.
      const backKey = relation.backKey;
      if (!backKey) {
        throw new UnsupportedOperationError(`nested create on "${relation.name}"`, relation.target);
      }

      const child = getModel(relation.target);
      const childCollection = db.collection(child.collection);
      const inputs = (Array.isArray(spec.create) ? spec.create : [spec.create]) as Array<Record<string, unknown>>;

      for (const input of inputs) {
        const childDoc = applyDefaults(child, toStorage(child, { ...input, [backKey]: parentId }), true);
        if (childDoc._id === undefined) childDoc._id = crypto.randomUUID();
        await childCollection.insertOne(childDoc, sessionOpts());
      }
    }
  };

  /**
   * Removes rows that point at the deleted documents, following the chain
   * transitively (deleting a server takes its channels, and their messages).
   *
   * Without this, deleting a server left its members and channels behind as
   * orphans that no query could ever reach again — and recreating a server
   * with the same id would resurface them.
   */
  const cascadeDelete = async (root: ModelDef, ids: string[]): Promise<void> => {
    const queue: Array<{ model: ModelDef; ids: string[] }> = [{ model: root, ids }];
    // A cycle in the relation graph would otherwise loop forever.
    const seen = new Set<string>(ids);

    while (queue.length > 0) {
      const level = queue.shift() as { model: ModelDef; ids: string[] };

      for (const { model, field } of cascadeTargets(level.model.name)) {
        const collection = db.collection(model.collection);
        const children = (
          await collection.find({ [field]: { $in: level.ids } }, sessionOpts()).toArray()
        ).map((doc) => String(doc._id));

        if (children.length === 0) continue;
        // Typed as `Document` because ids here are UUID strings, not ObjectIds.
        const childFilter: Document = { _id: { $in: children } };
        await collection.deleteMany(childFilter, sessionOpts());

        const fresh = children.filter((id) => !seen.has(id));
        for (const id of children) seen.add(id);
        if (fresh.length > 0) queue.push({ model, ids: fresh });
      }
    }
  };

  const delegate: MongoDelegate = {
    findUnique({ where, ...shape }) {
      return new LazyOp(async () => {
        const doc = await collection().findOne(uniqueFilter(model, where), sessionOpts());
        if (!doc) return null;
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    findFirst(args = {}) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, args.where, ctx);
        const sort = buildSort(model, args.orderBy) ?? defaultSort(model);
        const docs = await collection()
          .find(filter, sessionOpts())
          .sort(sort)
          .limit(1)
          .toArray();
        if (docs.length === 0) return null;
        const [shaped] = await applyShape(docs, args);
        return shaped;
      });
    },

    findMany(args = {}) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, args.where, ctx);
        const sort = buildSort(model, args.orderBy) ?? defaultSort(model);
        let cursor = collection().find(filter, sessionOpts()).sort(sort);
        if (args.skip) cursor = cursor.skip(args.skip);
        if (typeof args.take === "number") cursor = cursor.limit(args.take);
        return applyShape(await cursor.toArray(), args);
      });
    },

    create({ data, ...shape }) {
      return new LazyOp(async () => {
        const { scalars, nested } = splitNestedWrites(model, data);
        const doc = buildData(scalars, true);
        if (doc._id === undefined) doc._id = crypto.randomUUID();
        await collection().insertOne(doc, sessionOpts());
        // Children first: `include` re-reads them from their own collections,
        // so they have to exist before the response is shaped.
        await runNestedCreates(nested, String(doc._id));
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    update({ where, data, ...shape }) {
      return new LazyOp(async () => {
        const filter = uniqueFilter(model, where);
        const update = buildData(data, false);
        const result = await collection().findOneAndUpdate(
          filter,
          { $set: update },
          sessionOpts({ returnDocument: "after" })
        );
        if (!result) throw new PrismaNotFoundError(model.name);
        const [shaped] = await applyShape([result], shape);
        return shaped;
      });
    },

    upsert({ where, create, update, ...shape }) {
      return new LazyOp(async () => {
        const existing = await collection().findOne(uniqueFilter(model, where), sessionOpts());
        if (existing) {
          const result = await collection().findOneAndUpdate(
            { _id: existing._id },
            { $set: buildData(update, false) },
            sessionOpts({ returnDocument: "after" })
          );
          const [shaped] = await applyShape([result as Document], shape);
          return shaped;
        }

        const { scalars, nested } = splitNestedWrites(model, create);
        const doc = buildData(scalars, true);
        if (doc._id === undefined) doc._id = crypto.randomUUID();
        await collection().insertOne(doc, sessionOpts());
        await runNestedCreates(nested, String(doc._id));
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    updateMany({ where, data }) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, where, ctx);
        const update = buildData(data, false);
        const result = await collection().updateMany(filter, { $set: update }, sessionOpts());
        // Prisma reports how many rows matched, not how many values changed.
        // Returning `modifiedCount` under-reports any update that happens to
        // write the value a row already holds.
        return { count: result.matchedCount };
      });
    },

    delete({ where, ...shape }) {
      return new LazyOp(async () => {
        const filter = uniqueFilter(model, where);
        // Driver v6 types this as a ModifyResult unless `includeResultMetadata`
        // is pinned, even though it resolves to the deleted document.
        const doc = (await collection().findOneAndDelete(filter, sessionOpts())) as Document | null;
        if (!doc) throw new PrismaNotFoundError(model.name);
        await cascadeDelete(model, [String(doc._id)]);
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    deleteMany({ where } = {}) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, where, ctx);
        const doomed = (
          await collection().find(filter, sessionOpts()).limit(CASCADE_DELETE_LIMIT).toArray()
        ).map((doc) => String(doc._id));

        const result = await collection().deleteMany(filter, sessionOpts());
        if (doomed.length > 0) await cascadeDelete(model, doomed);

        return { count: result.deletedCount };
      });
    },

    count({ where } = {}) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, where, ctx);
        return collection().countDocuments(filter, sessionOpts());
      });
    },

    aggregate(args: unknown): never {
      void args;
      throw new UnsupportedOperationError("aggregate", model.name);
    },

    createMany(args: unknown): never {
      void args;
      throw new UnsupportedOperationError("createMany", model.name);
    },
  };

  return delegate;
}

export interface MongoClient {
  $connect(): Promise<void>;
  $disconnect(): Promise<void>;
  $transaction(ops: LazyOp<unknown>[]): Promise<unknown[]>;
}

export function createMongoClient(db: Db, driver: MongoClientDriver): MongoClient {
  const client: Record<string, unknown> = {};

  for (const name of Object.keys(MODELS)) {
    client[name] = createDelegate(name, db);
  }

  client.$connect = async () => {
    await driver.connect();
  };
  client.$disconnect = async () => {
    await driver.close();
  };

  /**
   * Runs the operations atomically inside a MongoDB transaction.
   *
   * Deployments that cannot do multi-document transactions — a standalone
   * `mongod`, or a shared tier that refuses them — fall back to running the
   * operations in order. The route cannot tell the difference, which keeps
   * development and production on one code path.
   */
  client.$transaction = async (ops: LazyOp<unknown>[]) => {
    const runSequentially = async (): Promise<unknown[]> => {
      const results: unknown[] = [];
      for (const op of ops) results.push(await op);
      return results;
    };

    let session: ClientSession | undefined;
    try {
      session = driver.startSession();
    } catch {
      return runSequentially();
    }

    try {
      let results: unknown[] = [];
      // withTransaction may retry the callback, so results is replaced (not
      // appended to) on each attempt.
      await session.withTransaction(async () => {
        results = await runWithSession(session as ClientSession, runSequentially);
      });
      return results;
    } catch (err) {
      if (transactionsUnsupported(err)) {
        console.warn(
          "[db] this MongoDB deployment does not support transactions; running the operations sequentially."
        );
        return runSequentially();
      }
      throw err;
    } finally {
      await session.endSession().catch(() => undefined);
    }
  };

  return client as unknown as MongoClient;
}

export { LazyOp };