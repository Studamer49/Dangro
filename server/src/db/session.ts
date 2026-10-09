import { AsyncLocalStorage } from "node:async_hooks";
import type { ClientSession } from "mongodb";

/**
 * Carries the session of an in-flight `$transaction` so that every query run
 * inside it joins the same transaction — without threading a session
 * parameter through every method in the query engine.
 *
 * The driver takes a session per operation (not per collection), so callers
 * spread `sessionOpts(...)` into their operation options.
 */
const activeSession = new AsyncLocalStorage<ClientSession>();

/**
 * Merges the in-flight transaction session into operation options.
 *
 * Always returns an object: several driver overloads (findOneAndUpdate and
 * friends) reject `undefined` for their options parameter.
 */
export function sessionOpts<T extends object>(options?: T): T & { session?: ClientSession } {
  const session = activeSession.getStore();
  return (session ? { ...options, session } : { ...options }) as T & { session?: ClientSession };
}

export function runWithSession<R>(session: ClientSession, fn: () => Promise<R>): Promise<R> {
  return activeSession.run(session, fn);
}