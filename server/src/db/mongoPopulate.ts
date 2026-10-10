import type { Document } from "mongodb";
import { getModel, type ModelDef, type RelationDef } from "./mongoSchema.js";
import { buildFilter, buildSort, type QueryContext } from "./mongoWhere.js";
import { sessionOpts } from "./session.js";

/**
 * Shapes raw Mongo documents into the payload Prisma would have returned:
 * scalars only, plus any relations named in `include` / `select`, plus
 * `_count` blocks.
 *
 * Relations are loaded with batched queries (one query per relation for the
 * whole page) rather than per document, so a page of 50 messages with an
 * `author` include costs one extra query, not fifty.
 */

export interface ShapeArgs {
  select?: Record<string, unknown>;
  include?: Record<string, unknown>;
  where?: Record<string, unknown>;
  orderBy?: unknown;
  take?: number;
  skip?: number;
}

function stripId(doc: Document): Record<string, unknown> {
  const { _id, ...rest } = doc;
  void _id;
  return { id: doc._id, ...rest };
}

function relationArgs(args: ShapeArgs, relationName: string): ShapeArgs {
  const nested = (args.include?.[relationName] ?? args.select?.[relationName]) as ShapeArgs | undefined;
  return nested ?? {};
}

/** Prisma returns every scalar field when neither select nor include is used. */
function pickScalars(
  model: ModelDef,
  doc: Record<string, unknown>,
  select: Record<string, unknown> | undefined
): Record<string, unknown> {
  const base = stripId(doc);

  if (!select) {
    for (const rel of model.relations) delete base[rel.name];
    return base;
  }

  const picked: Record<string, unknown> = {};
  if (select.id === true) picked.id = base.id;
  for (const [field, enabled] of Object.entries(select)) {
    if (enabled !== true) continue;
    if (field === "id") continue;
    if (model.relations.some((rel) => rel.name === field)) continue;
    picked[field] = base[field] === undefined ? null : base[field];
  }
  return picked;
}

/** Reads a nested select/include spec out of an include entry. */
function childShapeArgs(args: ShapeArgs): ShapeArgs {
  return { select: args.select, include: args.include };
}

export async function shapeDocuments(
  model: ModelDef,
  docs: Document[],
  args: ShapeArgs,
  ctx: QueryContext
): Promise<Record<string, unknown>[]> {
  if (docs.length === 0) return [];

  const select = args.select as Record<string, unknown> | undefined;
  const include = args.include as Record<string, unknown> | undefined;

  const requested = new Map<string, RelationDef>();
  for (const rel of model.relations) {
    if (include?.[rel.name] !== undefined) requested.set(rel.name, rel);
    else if (select?.[rel.name] !== undefined) requested.set(rel.name, rel);
  }

  const results = docs.map((doc) => pickScalars(model, doc, select));
  const parentIds = docs.map((doc) => doc._id);

  // `id` is always present in a relation payload even if the caller only
  // selected other columns, so links stay navigable.
  for (const [name, rel] of requested) {
    const nested = relationArgs(args, name);
    const loaded = await loadRelation(rel, docs, parentIds, nested, ctx);

    results.forEach((shaped, index) => {
      const value = loaded.get(String(parentIds[index]));
      if (rel.kind === "many") {
        shaped[name] = value ?? [];
      } else {
        const single = Array.isArray(value) ? value[0] ?? null : (value ?? null);
        shaped[name] = single && "id" in single ? single : single ? { id: single.id, ...single } : null;
      }
    });
  }

  if (include?._count || select?._count) {
    const countSpec = (include?._count ?? select?._count) as { select?: Record<string, boolean> };
    const wanted = Object.entries(countSpec.select ?? {}).filter(([, on]) => on);
    const counts = await Promise.all(
      wanted.map(async ([name]) => [name, await countRelation(model, name, parentIds, ctx)] as const)
    );
    results.forEach((shaped, index) => {
      const id = String(parentIds[index]);
      shaped._count = Object.fromEntries(counts.map(([name, map]) => [name, map.get(id) ?? 0]));
    });
  }

  return results;
}

/** Loads one relation for every parent id at once. */
async function loadRelation(
  rel: RelationDef,
  parents: Document[],
  parentIds: unknown[],
  nested: ShapeArgs,
  ctx: QueryContext
): Promise<Map<string, unknown>> {
  const target = getModel(rel.target);
  const out = new Map<string, unknown>();

  if (rel.ownKey) {
    // Belongs-to: the foreign key sits on the parent, so it must be read off
    // each parent document. The key point that a lookup by the parent's own
    // id would never match a related document.
    const foreignKeys = parents
      .map((parent) => parent[rel.ownKey as string])
      .filter((value): value is string => typeof value === "string" && value.length > 0);

    const childDocs = foreignKeys.length
      ? await ctx.collectionFor(rel.target).find({ _id: { $in: [...new Set(foreignKeys)] } }, sessionOpts()).toArray()
      : [];

    const byId = new Map(childDocs.map((doc: Document) => [String(doc._id), doc]));

    for (let index = 0; index < parents.length; index += 1) {
      const foreignKey = parents[index][rel.ownKey as string];
      // Must be shaped like every other relation: this applies `select`
      // (so a user is never returned with its password hash), renames _id to
      // id, and resolves any nested include.
      const doc = typeof foreignKey === "string" ? byId.get(foreignKey) : undefined;
      out.set(String(parentIds[index]), doc ? await shapeSingle(target, doc, nested, ctx) : null);
    }

    return out;
  }

  if (!rel.backKey) return out;

  // Has-many / has-one: the foreign key sits on the child document.
  const filter: Document = { [rel.backKey]: { $in: parentIds } };
  if (nested.where) Object.assign(filter, await buildFilter(target, nested.where, ctx));

  const sort = buildSort(target, nested.orderBy) ?? buildSort(target, target.defaultOrder);
  const children = await ctx
    .collectionFor(rel.target)
    .find(filter, sessionOpts())
    .sort(sort ?? { _id: 1 })
    .toArray();

  const grouped = new Map<string, Document[]>();
  for (const child of children) {
    const key = String(child[rel.backKey]);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(child);
    else grouped.set(key, [child]);
  }

  for (const parentId of parentIds) {
    const key = String(parentId);
    let bucket = grouped.get(key) ?? [];
    if (nested.skip) bucket = bucket.slice(nested.skip);
    if (typeof nested.take === "number") bucket = bucket.slice(0, nested.take);
    if (rel.kind === "one") {
      const first = bucket[0];
      out.set(key, first ? await shapeSingle(target, first, nested, ctx) : null);
    } else {
      out.set(
        key,
        await Promise.all(
          bucket.map((doc: Document) => shapeSingle(target, doc, nested, ctx))
        )
      );
    }
  }

  return out;
}

async function shapeSingle(
  model: ModelDef,
  doc: Document,
  args: ShapeArgs,
  ctx: QueryContext
): Promise<Record<string, unknown>> {
  const [shaped] = await shapeDocuments(model, [doc], childShapeArgs(args), ctx);
  return shaped;
}

async function countRelation(
  model: ModelDef,
  relationName: string,
  parentIds: unknown[],
  ctx: QueryContext
): Promise<Map<string, number>> {
  const rel = model.relations.find((r) => r.name === relationName);
  const out = new Map<string, number>();
  if (!rel) throw new Error(`Unknown relation "${relationName}" on model "${model.name}"`);

  if (rel.ownKey) {
    const target = getModel(rel.target);
    const children = await ctx
      .collectionFor(rel.target)
      .find({ _id: { $in: parentIds } }, sessionOpts())
      .toArray();
    for (const child of children) out.set(String(child._id), 1);
    void target;
    return out;
  }

  if (!rel.backKey) return out;

  const rows = await ctx
    .collectionFor(rel.target)
    .aggregate(
      [
        { $match: { [rel.backKey]: { $in: parentIds } } },
        { $group: { _id: `$${rel.backKey}`, count: { $sum: 1 } } },
      ],
      sessionOpts()
    )
    .toArray();

  for (const row of rows) out.set(String(row._id), row.count as number);
  return out;
}