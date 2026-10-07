# PROJECT_AUDIT.md

Full-stack audit and remediation log for **Dangro** (Discord-inspired app: React 19 + Express + Socket.IO + PostgreSQL/Prisma).

**Status:** all critical and major findings fixed in this session. Drafted as a reference for future maintainers; not a confession of current defects.

---

## 1. Critical: stale compiled Vite artifacts shadowed the real config (Bug 1)

**Finding**
`client/vite.config.js` and `client/vite.config.d.ts` (compiled output of `vite.config.ts`) were committed to git. Vite resolves `vite.config.js` **before** `vite.config.ts`, so the compiled, stale copy silently won over the source file. The server URL / API proxy changes did nothing until the `.js` copy was also changed. `*.tsbuildinfo` files were committed too.

**Root cause**
`tsconfig.node.json` used `"composite": true` + `"emitDeclarationOnly": true` and the build ran `tsc -b`, which **regenerated** `vite.config.d.ts` (and with the old build `vite.config.js`) on every build.

**Fix**
- Deleted the committed artifacts: `client/vite.config.js`, `client/vite.config.d.ts`, `client/tsconfig.tsbuildinfo`, `client/tsconfig.node.tsbuildinfo`.
- `tsconfig.node.json` is now `"noEmit": true`; dropped `composite`/`emitDeclarationOnly`; removed the `references` entry from `tsconfig.json`.
- Client scripts no longer use `tsc -b`:
  - `typecheck` → `tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json`
  - `build` → `npm run typecheck && vite build`
- `.gitignore` blocks any future recreation of `vite.config.js` / `.js.map` / `.d.ts` and both `*.tsbuildinfo` files.
- `client/scripts/check-hooks.mjs` (the client `test` script) fails the build if any `vite.config.js` / `*.tsbuildinfo` reappears, and it also guards all `useState`/`useEffect`/… imports (see §7).

## 2. Critical: there was no React ErrorBoundary and the app could white-screen

**Finding**
A single runtime error (e.g. `server.name[0]` on a server with an empty name, a degraded WebSocket payload, a persisted-settings shape regression) crashed the whole dashboard with a blank page and no recovery path.

**Fix**
- `client/src/components/ErrorBoundary.tsx` (class component) with a "Reload the app" action.
- Mounted at the top of `main.tsx` (wraps the router) **and** around the application layout in `App.tsx`.
- `client/src/pages/NotFoundPage.tsx` for unmatched routes + `Routes` `*` fallback.
- Persisted settings are now sanitized/validated before use: `settingsStore.ts` versioned (`version: 1`), `sanitize()` on every persisted key, `migrate()` + `merge()` on load, typed `partialize()` on save — closes the ThemeProvider-crash vector.

## 3. Critical: deployment would not have applied the schema and had no real health check

**Finding**
- `render.yaml` never ran `prisma migrate deploy` — a fresh Neon database would boot with **zero tables** and every query crash.
- Build used `npx ... --prefix` (npx does not support `--prefix`) and `npm install` instead of reproducible installs.
- No health check path; `app.get("*")` was registered **before** the error handler, and uploads on Docker, trust proxy, etc. were unconfigured.

**Fix**
- `render.yaml`: `preDeployCommand: npm run db:deploy` (which is `npm --prefix server run db:deploy` → `prisma migrate deploy`), `healthCheckPath: /api/health`, resilient build commands, `JWT_SECRET`/`JWT_REFRESH_SECRET` from Render `generateValue`, `DATABASE_URL` marked `sync: false` (set in dashboard).
- `prisma` CLI moved from `devDependencies` → `dependencies` in `server/package.json` so `migrate deploy` still works when Node/prune drops dev deps.
- `server/src/index.ts` rewired in the correct order: helmet → CORS/per-request origin → JSON parsers → rate limiters → `/api/health` → routes → JSON `/api/*` 404 → `/uploads` static → client SPA (only if `client/dist/index.html` exists) → **errorHandler last**.
- Added `trust proxy = 1` (proxy-aware rate limiting), graceful `SIGTERM`/`SIGINT` shutdown with 10s timeout, `unhandledRejection`/`uncaughtException` handlers.
- `Dockerfile` rewritten (build → runtime stages, `npm ci`, server + client build, prisma generate) + `.dockerignore` added.

## 4. High: every API error returned HTTP 200

**Finding**
`middleware/errorHandler.ts` set the response status from `res.statusCode` for non-internal errors. When `next(err)` was called Express never touched `res.statusCode`, so **every** `AppError` (400/401/403/404/409/413/429) went out with status `200` and body `{success:false,...}`. The client’s 401-refresh logic keyed on `status === 401` therefore never fired.

**Fix**
`errorHandler` now maps the error code to its HTTP status: `err instanceof AppError ? err.statusCode : STATUS_BY_CODE[code] ?? 500` (`STATUS_BY_CODE` exported from `lib/http.ts`). Caught by the new test suite (§8). **This is the single most valuable behavioral fix in the audit.**

## 5. High: upload security

**Finding**
Uploads used the client-supplied `originalname` (extension forgery like `shell.png` with a `.sh` payload under an allowlisted MIME list), and no content magic-byte verification.

**Fix**
`server/src/routes/uploads.ts`:
- Allowlisted MIME set + `MIME_TO_EXT` map; multer `filename` is a bare `uuid()` so **no extension is ever taken from `originalname`**.
- After write, the file is magic-byte sniffed (`sniffMatches` for jpeg/png/gif/webp/mp4/mov/webm/wav/mp3/ogg/pdf); only then renamed `<uuid>.<ext>` — otherwise unlinked + 400.
- `safeDisplayName()` strips paths and control characters.
- Limiter error → `PAYLOAD_TOO_LARGE` (413) instead of a crash or silent 500.

## 6. High: server routes had inconsistent validation / no envelope / missing security checks

**Fix (all in Phase 3–5)**
- Central `server/src/lib/http.ts`: `ok` / `fail` / `AppError` / `asyncHandler` / `parseOrThrow` / `toErrorBody` mapping Zod → `VALIDATION_ERROR`, Prisma `P2002` → `CONFLICT`, `P2025` → `NOT_FOUND`, `entity.parse.failed` → `BAD_REQUEST`, `entity.too.large` → `PAYLOAD_TOO_LARGE`.
- `server/src/lib/access.ts`: `isUuid`, `paramId` (all path params validated as UUIDs before hitting Prisma), `findServerOr404`, `assertServerMember`, `assertChannelMember`, `assertConversationMember`, `assertChannelReply`, `assertDirectMessageReply`.
- Every one of the 11 route files converted to the envelope; added missing endpoints — friends `reject`/`cancel`/`requests/sent`, servers `join/:inviteCode`/`explore`/GET/:id/PATCH/leave/invite-rotate, posts like/comments/delete/user-posts, stories delete, follows toggles, notifications `GET`/`read`/`read-all`.
- `server/src/lib/notifications.ts`: best-effort `createNotification` + live socket emit with fresh unread count.
- Socket layer (`server/src/socket/index.ts`): JWT auth, zod-validated payloads, membership checks on every join/typing/message/voice event, replies validated to the same channel, user status updates wrapped in `.catch()`.

## 7. Medium: unguarded client crash vectors & hook-import drift

**Fix**
- All `server.name[0]`-style indexing replaced with `server.name?.[0]?.toUpperCase() ?? "?"` (ServerSidebar, ChannelSidebar, ExplorePage, DashboardPage).
- `client/scripts/check-hooks.mjs` (wired as `client` `test`, part of root `verify`): verifies every React Hooks import (`useState`, `useEffect`, …) in every file and fails if stale vite artifacts re-register. Catches the class of bug in §1 and unguarded-name crashes behaviorally.
- Client `api.ts` interceptor now auto-unwraps the envelope and attaches `code`/`apiMessage`; `apiErrorMessage()` returns server messages everywhere; 401 refresh flow works now that servers return real status codes.
- `socket.ts`: same-origin URL resolution, stable singleton (disconnect keeps the instance), freshest token in handshake auth.

## 8. Verification gates

- **Root:** `npm run verify` = lint + typecheck + build + test for both apps.
- **Server today:** `eslint src` 0 errors/warnings · `tsc --noEmit` 0 · `npm run build` OK · `vitest run` **9/9 pass** (health envelope, JSON 404s, 401 envelopes, validation 400s, payload-too-large 413, `ok()` helper) · `prisma validate` OK · `prisma migrate status` → schema up to date (2 migrations).
- **Client today:** `eslint .` 0 errors, 0 warnings · `npm run typecheck` 0 · `vite build` OK · `node scripts/check-hooks.mjs` → "44 files scanned" pass.
- **Dependencies:** `npm audit --prefix server` → 3 remaining **high** advisories; all three are the same dev/CLI-only chain (`prisma` → `@prisma/config` → `deepmerge-ts`, versions `6.13.0-dev.1` – `8.1.0-dev.4`). There is no stable release containing a fix, so we intentionally keep `prisma@6.19.3`. The `prisma` package itself only runs `migrate`/`generate`/`studio`; it is not part of the runtime request path on the deployed image (Render prunes dev deps; `prisma` is a runtime dependency here precisely so `migrate deploy` still works). Re-check after any future `prisma` upgrade.

## 9. Housekeeping / operational notes

- `server/.env` on this machine contains **real Neon credentials** and stays untracked. **Rotate the Neon DB password after this handover**, then update `server/.env` and the Render `DATABASE_URL` var.
- The app intentionally has **no analytics and no ads**; features not ready for the MVP are documented rather than faked.
- Known product gaps (not defects): no moderation tooling (role-based channel creation + owner delete only), no media CDN (files are stored on the service disk and are served via `/uploads` with day-long cache), no end-to-end encryption for DMs, single-replica deployment on Render Free.