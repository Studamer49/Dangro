/**
 * Helpers for reading and safely reporting a MongoDB connection string.
 */

/**
 * Replaces the password in a connection string with `***` so it can be
 * written to logs. Connection strings routinely end up in deploy logs and
 * error messages, and the password is the only thing guarding a cluster that
 * is reachable from anywhere.
 */
export function redactMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]*?)@/, (_match, credentials: string) => {
    const user = credentials.split(":")[0];
    return `//${user}:***@`;
  });
}

/** What a URI actually selects — the first thing to check when auth fails. */
export function describeMongoUri(uri: string): {
  redacted: string;
  user: string | null;
  host: string | null;
  database: string | null;
  authSource: string | null;
} {
  const user = uri.match(/^mongodb(?:\+srv)?:\/\/([^:/?#]+):[^@]*@/)?.[1] ?? null;
  const host = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?([^/?#:]+)/)?.[1] ?? null;
  const authSource = uri.match(/[?&]authSource=([^&]+)/)?.[1] ?? null;

  // Strip scheme and credentials, then take everything after the host's "/".
  const rest = uri.replace(/^mongodb(?:\+srv)?:\/\/(?:[^@]*@)?/, "");
  const slash = rest.indexOf("/");
  const path = slash === -1 ? "" : rest.slice(slash + 1).split("?")[0];
  const database = path && path !== "/" ? decodeURIComponent(path) : null;

  return { redacted: redactMongoUri(uri), user, host, database, authSource };
}

/**
 * Plain-language notes for the most common startup failures, so a deploy log
 * says what to fix instead of only "authentication failed".
 */
export function explainMongoError(err: unknown): string[] {
  const message = err instanceof Error ? err.message : String(err);
  const notes: string[] = [];

  if (/authentication failed|bad auth/i.test(message)) {
    notes.push(
      "The cluster rejected the username or password in MONGODB_URI.",
      'Check the username under Atlas -> Database & Network Access -> Database Access.',
      "If the password contains @ : / ? # %, it must be percent-encoded in the URI."
    );
  } else if (/ECONNREFUSED|server selection|topology/i.test(message)) {
    notes.push(
      "Could not reach the cluster. Check MONGODB_URI, and that Network Access allows the caller."
    );
  }

  return notes;
}