#!/usr/bin/env node
/**
 * Guards against the production "ReferenceError: useState is not defined" class of bug.
 *
 * Scans every source file for React hook calls that are NOT imported from "react"
 * (or otherwise made available). Fails the build if any are found.
 *
 * Usage: node scripts/check-hooks.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = [
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useCallback",
  "useRef",
  "useContext",
  "useReducer",
  "useImperativeHandle",
  "useDebugValue",
  "useId",
  "useTransition",
  "useDeferredValue",
  "useSyncExternalStore",
  "useOptimistic",
  "useActionState",
  "use",
];

const SRC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "src");
const EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (EXT.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function stripCommentsAndStrings(src) {
  // Remove block/line comments and string/template literal contents so that
  // hook names mentioned inside comments or strings are not counted.
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

const files = walk(SRC);
const failures = [];

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const code = stripCommentsAndStrings(raw);

  // Collect identifiers bound by import statements from "react".
  const imported = new Set();
  for (const m of code.matchAll(/import\s+([^;]+?)\s+from\s+["']react["']/g)) {
    const clause = m[1];
    const named = clause.match(/\{([^}]*)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) imported.add(name);
      }
    }
    const defaultName = clause.replace(/\{[^}]*\}/g, "").split(",")[0].trim();
    if (defaultName && !defaultName.startsWith("*")) imported.add(defaultName);
  }
  // `import React, { useState } from "react"` and `import * as React from "react"`
  const namespace = [...code.matchAll(/import\s+\*\s+as\s+(\w+)\s+from\s+["']react["']/g)].map((m) => m[1]);

  // Detect hook usage: identifier followed by `(` not preceded by `.` or another identifier char.
  for (const hook of HOOKS) {
    const usage = new RegExp(`(^|[^A-Za-z0-9_$.])${hook}\\s*\\(`, "m");
    if (!usage.test(code)) continue;

    if (imported.has(hook)) continue;
    if (namespace.some((ns) => code.includes(`${ns}.${hook}`))) continue;
    // Hooks re-exported by this project's own modules (none today, but be safe):
    if (new RegExp(`import\\s*\\{[^}]*\\b${hook}\\b[^}]*\\}\\s*from`).test(code)) continue;

    failures.push(`${relative(process.cwd(), file)}: ${hook}() is called but not imported from "react"`);
  }
}

/**
 * Route-context guard.
 *
 * `useParams()` reads the params of the nearest matched <Route>. A component
 * rendered OUTSIDE <Routes> gets `{}` — not an error, just empty. That is how
 * ChannelSidebar sat on "Select a server" forever: it is a sibling of
 * <Routes> in DashboardPage, so its useParams() always returned `{}`, while
 * ChatArea next to it — rendered as a <Route> element — worked fine.
 *
 * There is no way to prove this statically in general, but the mistake is
 * always the same shape: a component that calls useParams() but is never
 * mounted as a <Route element={...}>. So check exactly that.
 */
function checkRouteContext(files) {
  const problems = [];

  // Which component names are ever mounted as a <Route> element?
  const routeElements = new Set();
  for (const file of files) {
    const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
    for (const m of code.matchAll(/<Route\b[^>]*element=\{<\s*([A-Z]\w*)/g)) {
      routeElements.add(m[1]);
    }
  }

  for (const file of files) {
    const code = stripCommentsAndStrings(readFileSync(file, "utf8"));
    if (!/(^|[^A-Za-z0-9_$.])useParams\s*\(/.test(code)) continue;

    // The default export of a file that IS a route element is fine.
    const exportName = code.match(/export\s+default\s+function\s+([A-Z]\w*)/)?.[1]
      ?? code.match(/export\s+default\s+([A-Z]\w*)/)?.[1];

    if (exportName && routeElements.has(exportName)) continue;

    problems.push(
      `${relative(process.cwd(), file)}: calls useParams() but its component is never mounted as ` +
      `<Route element={...}>. Rendered outside <Routes> it silently receives {} — use useMatch() instead.`
    );
  }

  return { problems, routeElements };
}

const { problems: routeProblems, routeElements } = checkRouteContext(files);

if (failures.length > 0 || routeProblems.length > 0) {
  if (failures.length > 0) {
    console.error("✗ React hook import check failed:\n");
    for (const f of failures) console.error("  - " + f);
    console.error(
      "\nThese would surface in production as: ReferenceError: <hook> is not defined"
    );
  }
  if (routeProblems.length > 0) {
    console.error("\n✗ Route context check failed:\n");
    for (const p of routeProblems) console.error("  - " + p);
    console.error(
      "\nuseParams() outside a matched <Route> returns {} with no error, so the component\n" +
      "just sees an undefined param. This surfaced as a sidebar stuck on its empty state."
    );
  }
  process.exit(1);
}

console.log(`✓ React hook import check passed (${files.length} files scanned)`);
console.log(`✓ Route context check passed (${routeElements.size} route components)`);
