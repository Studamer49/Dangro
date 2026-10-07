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

if (failures.length > 0) {
  console.error("✗ React hook import check failed:\n");
  for (const f of failures) console.error("  - " + f);
  console.error(
    "\nThese would surface in production as: ReferenceError: <hook> is not defined"
  );
  process.exit(1);
}

console.log(`✓ React hook import check passed (${files.length} files scanned)`);
