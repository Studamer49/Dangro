import type { ClientSession, Collection, Db, Document, Filter } from "mongodb";
import { MODELS, getModel, type ModelDef } from "./mongoSchema.js";
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

    const compound = model.uniques[key];
    if (compound) {
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

function toStorage(model: ModelDef, data: Record<string, unknown>): Document {
  const doc: Document = {};

  for (const [key, value] of Object.entries(stripUndefined(data) as Record<string, unknown>)) {
    if (key === "id") {
      doc._id = value;
      continue;
    }
    const field = model.fields[key];
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

/** Postgres returns insertion order; `createdAt` is the closest equivalent. */
function defaultSort(model: ModelDef): Record<string, 1 | -1> {
  return model.fields.createdAt ? { createdAt: 1, _id: 1 } : { _id: 1 };
}

export interface MongoDelegate {
  findUnique(args: WhereArgs): LazyOp<Record<string, unknown> | null>;
  findFirst(args?: FindManyArgs): LazyOp<Record<string, unknown> | null>;
  findMany(args?: FindManyArgs): LazyOp<Record<string, unknown>[]>;
  create(args: DataArgs): LazyOp<Record<string, unknown>>;
  update(args: DataArgs & { where: Where }): LazyOp<Record<string, unknown>>;
  upsert(args: DataArgs & { where: Where }): LazyOp<Record<string, unknown>>;
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

  const buildData = (data: Record<string, unknown>, isCreate: boolean): Document => {
    const doc = toStorage(model, data);
    const now = new Date();

    for (const [field, def] of Object.entries(model.fields)) {
      if (def.default === undefined) continue;
      if (doc[field] !== undefined) continue;
      if (isCreate) doc[field] = typeof def.default === "function" ? def.default() : def.default;
    }

    if (!isCreate && model.fields.updatedAt) doc.updatedAt = now;
    return doc;
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
        const doc = buildData(data, true);
        if (doc._id === undefined) doc._id = crypto.randomUUID();
        await collection().insertOne(doc, sessionOpts());
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

    upsert({ where, data, ...shape }) {
      return new LazyOp(async () => {
        const existing = await collection().findOne(uniqueFilter(model, where), sessionOpts());
        if (existing) {
          const result = await collection().findOneAndUpdate(
            { _id: existing._id },
            { $set: buildData(data, false) },
            sessionOpts({ returnDocument: "after" })
          );
          const [shaped] = await applyShape([result as Document], shape);
          return shaped;
        }
        const doc = buildData(data, true);
        if (doc._id === undefined) doc._id = crypto.randomUUID();
        await collection().insertOne(doc, sessionOpts());
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    updateMany({ where, data }) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, where, ctx);
        const update = buildData(data, false);
        const result = await collection().updateMany(filter, { $set: update }, sessionOpts());
        return { count: result.modifiedCount };
      });
    },

    delete({ where, ...shape }) {
      return new LazyOp(async () => {
        const filter = uniqueFilter(model, where);
        const doc = await collection().findOneAndDelete(filter, sessionOpts());
        if (!doc) throw new PrismaNotFoundError(model.name);
        const [shaped] = await applyShape([doc], shape);
        return shaped;
      });
    },

    deleteMany({ where } = {}) {
      return new LazyOp(async () => {
        const filter = await buildFilter(model, where, ctx);
        const result = await collection().deleteMany(filter, sessionOpts());
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