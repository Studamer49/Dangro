import type { Filter, Document } from "mongodb";
import { getModel, type ModelDef } from "./mongoSchema.js";

/** Anything the query engine needs to resolve a `where` clause. */
export interface QueryContext {
  /** Resolves a model name to its collection, so `some` can run a subquery. */
  collectionFor: (modelName: string) => Document;
}

type Where = Record<string, unknown> | undefined;

/** Field names that are Prisma operators rather than columns. */
const OPERATORS = new Set([
  "AND",
  "OR",
  "NOT",
  "some",
  "every",
  "none",
  "mode",
  "contains",
  "startsWith",
  "endsWith",
  "equals",
  "in",
  "notIn",
  "not",
  "gt",
  "gte",
  "lt",
  "lte",
]);

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Translates a Prisma `where` object into a MongoDB filter.
 *
 * Relation filters (`some`) are resolved with a subquery rather than a
 * `$lookup`: we first collect the foreign keys of every matching child
 * document, then restrict the parent query to those keys. That keeps the
 * translation free of aggregation pipelines and works on a standalone
 * mongod (no replica set required).
 */
export async function buildFilter(
  model: ModelDef,
  where: Where,
  ctx: QueryContext
): Promise<Filter<Document>> {
  if (!where || Object.keys(where).length === 0) return {};

  const clauses: Filter<Document>[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    if (key === "AND") {
      const list = Array.isArray(value) ? value : [value];
      for (const entry of list) {
        clauses.push(await buildFilter(model, entry as Where, ctx));
      }
      continue;
    }

    if (key === "OR") {
      const list = Array.isArray(value) ? value : [value];
      const built = await Promise.all(list.map((entry) => buildFilter(model, entry as Where, ctx)));
      clauses.push({ $or: built });
      continue;
    }

    if (key === "NOT") {
      const list = Array.isArray(value) ? value : [value];
      const built = await Promise.all(list.map((entry) => buildFilter(model, entry as Where, ctx)));
      clauses.push({ $nor: built });
      continue;
    }

    // Relation filters are keyed by the relation name, with the operator
    // inside: `{ memberships: { some: { role: "owner" } } }`.
    const relationDef = model.relations.find((r) => r.name === key);
    if (relationDef) {
      const spec = value as Record<string, unknown>;
      const unsupported = Object.keys(spec).filter((op) => op !== "some");
      if (unsupported.length > 0) {
        throw new Error(
          `Relation filter "${key}: { ${unsupported.join(", ")} }" is not supported by the MongoDB backend. Only "some" is implemented.`
        );
      }

      if (!relationDef.backKey) {
        throw new Error(`Relation "${key}" cannot be used as a filter because it holds no foreign key`);
      }

      const target = getModel(relationDef.target);
      const childFilter = await buildFilter(target, spec.some as Where, ctx);
      const children = await ctx.collectionFor(relationDef.target).find(childFilter).toArray();
      // The foreign key lives on the child, so a parent matches when its own
      // id appears in the foreign key of at least one matching child.
      clauses.push({
        _id: { $in: children.map((child: Document) => child[relationDef.backKey as string]) },
      });
      continue;
    }

    if (key === "every" || key === "none" || key === "some") {
      throw new Error(
        `Relation filter "${key}" must be nested under a relation name, e.g. { memberships: { some: ... } }.`
      );
    }

    // A key that is neither a declared column nor a relation means the
    // registry in mongoSchema.ts has drifted from schema.prisma. Failing
    // loudly beats silently returning zero rows for a filter that can never
    // match.
    if (key !== "id" && !model.fields[key]) {
      throw new Error(
        `Unknown field "${key}" on model "${model.name}". Add it to mongoSchema.ts so the MongoDB backend can query it.`
      );
    }

    clauses.push(scalarFilter(key, value));
  }

  if (clauses.length === 0) return {};
  if (clauses.length === 1) return clauses[0];
  return { $and: clauses };
}

function scalarFilter(field: string, value: unknown): Filter<Document> {
  if (value === null) return { [field]: null };

  if (typeof value !== "object" || value instanceof Date) {
    return { [field]: value as never };
  }

  const spec = value as Record<string, unknown>;
  const filter: Record<string, unknown> = {};

  for (const [op, operand] of Object.entries(spec)) {
    // Prisma puts `mode` next to the string operator it applies to.
    if (op === "mode") continue;

    switch (op) {
      case "equals":
        filter[field] = operand as never;
        break;
      case "not":
        filter[field] = { $ne: operand };
        break;
      case "in":
        filter[field] = { $in: operand };
        break;
      case "notIn":
        filter[field] = { $nin: operand };
        break;
      case "gt":
        filter[field] = { $gt: operand };
        break;
      case "gte":
        filter[field] = { $gte: operand };
        break;
      case "lt":
        filter[field] = { $lt: operand };
        break;
      case "lte":
        filter[field] = { $lte: operand };
        break;
      case "contains": {
        const insensitive = spec.mode === "insensitive";
        filter[field] = {
          $regex: escapeRegex(String(operand)),
          ...(insensitive ? { $options: "i" } : {}),
        };
        break;
      }
      case "startsWith": {
        const insensitive = spec.mode === "insensitive";
        filter[field] = {
          $regex: `^${escapeRegex(String(operand))}`,
          ...(insensitive ? { $options: "i" } : {}),
        };
        break;
      }
      case "endsWith": {
        const insensitive = spec.mode === "insensitive";
        filter[field] = {
          $regex: `${escapeRegex(String(operand))}$`,
          ...(insensitive ? { $options: "i" } : {}),
        };
        break;
      }
      default:
        // Unknown operator: fall back to equality so a new Prisma call
        // degrades to an exact match instead of silently matching nothing.
        filter[field] = operand as never;
    }
  }

  return filter as Filter<Document>;
}

/** Translates `orderBy`, including the `{ field: "asc" }` shorthand. */
export function buildSort(
  model: ModelDef,
  orderBy: unknown
): Record<string, 1 | -1> | undefined {
  if (!orderBy) return undefined;

  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  const sort: Record<string, 1 | -1> = {};

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    for (const [field, direction] of Object.entries(entry as Record<string, string>)) {
      sort[field] = direction === "desc" ? -1 : 1;
    }
  }

  if (Object.keys(sort).length === 0) return undefined;

  // Stable pagination needs a tiebreaker, otherwise documents sharing a
  // timestamp can repeat or vanish across pages.
  if (!sort._id) sort._id = 1;
  return sort;
}

export { OPERATORS };