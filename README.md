# Dangro

A modern communication platform inspired by Discord — real-time chat, voice channels, direct messages, a social feed with stories, and friends. Built with React 19, Express, Socket.IO, Prisma and PostgreSQL.

## Highlights

- **Single-origin deploy:** the Express server serves the built React app, the `/api` REST API **and** Socket.IO from one URL — no CORS or static-host juggling.
- **Uniform API envelope:** every response is `{ success: true, data }` or `{ success: false, error: { code, message } }`; the client unwraps it automatically, so components read `const { data } = await api.get(...)`.
- **Resilient by default:** ErrorBoundary + toast system, sanitized persisted settings, guarded `server.name?.[0]`-style access, and a test suite that catches envelope/status regressions.
- See [`PROJECT_AUDIT.md`](./PROJECT_AUDIT.md) for the engineering audit and [`DEPLOYMENT.md`](./DEPLOYMENT.md) for run instructions.

## Tech stack

**Frontend:** React 19 · Vite · Tailwind CSS · react-router-dom · Zustand · Socket.IO client · React Hook Form + Zod · Framer Motion

**Backend:** Node.js · Express · Socket.IO · Prisma ORM · PostgreSQL (Neon) · JWT refresh/access · bcrypt

## Quick start

Prerequisites: Node.js ≥ 20, a PostgreSQL database (Neon works).

```bash
npm ci --prefix server
npm ci --prefix client

# configure env — see the .env.example files
# server/.env  → DATABASE_URL, JWT_SECRET (JWT_REFRESH_SECRET, CLIENT_URL, PORT)
# client/.env  → VITE_API_URL=/api, VITE_WS_URL=

npm run dev                 # server on :3001, client on :5173 (Vite proxies /api, /uploads, /socket.io)
```

Apply the schema: `npm run db:migrate` (dev, creates migration files) or `npm run db:deploy` (applies committed migrations).

## Scripts (run from repo root)

| Command | What it does |
|---|---|
| `npm run dev` | Runs server + client together |
| `npm run build` | Builds the client bundle and compiles the server |
| `npm run start` | Starts the compiled server (serves API + client) |
| `npm run lint` | ESLint for both apps |
| `npm run typecheck` | `tsc --noEmit` for both apps |
| `npm test` | Server vitest suite + client hook-guard script |
| `npm run verify` | lint + typecheck + build + test in one command |
| `npm run db:deploy` | `prisma migrate deploy` against `DATABASE_URL` |

## Folder structure

```
├── client/            React app
│   ├── src/
│   │   ├── components/  UI (chat, feed, notifications, onboarding rails…)
│   │   ├── hooks/       useWebRTC
│   │   ├── lib/         api (envelope interceptor) + socket + helpers
│   │   ├── pages/       route pages (feed, explore, friends, channels, dms…)
│   │   ├── stores/      Zustand: auth, settings, call, toasts
│   │   ├── styles/      tailwind + custom tokens
│   │   └── types/       shared TypeScript types
│   └── vite.config.ts
├── server/            Express + Socket.IO
│   ├── prisma/          schema.prisma + migrations
│   └── src/
│       ├── lib/         envelope helpers, access checks, notifications
│       ├── middleware/  auth, error handler
│       ├── routes/      auth, users, friends, servers, channels, messages,
│       │                dms, uploads, posts, stories, follows, notifications
│       └── socket/      Socket.IO auth + validation + rooms
├── render.yaml        one-click Render deployment
├── Dockerfile
└── PROJECT_AUDIT.md / DEPLOYMENT.md
```

## Feature surface

- Server channels (text + voice/WebRTC), permissions on create/rename/delete channels
- Direct messages with typing indicators, read receipts and replies
- Friends: requests, accept/reject, sent/cancel, presence via Socket.IO
- Social: posts (media up to 10 attachments), likes, comments, 24-hour stories
- Notifications: bell with live socket updates and read/unread state
- Profile editing (avatar upload + link), follow/unfollow, user + server search, invite links (`/invite/:code`)

## API status codes

All errors carry `error.code`: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `CONFLICT` (409), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

## Deployment

Follow [`DEPLOYMENT.md`](./DEPLOYMENT.md). Short version: create a Render Web Service from `render.yaml`, preview a Neon `DATABASE_URL`, let Render generate `JWT_SECRET`/`JWT_REFRESH_SECRET`, set `CLIENT_URL` to your `.onrender.com` URL, deploy — `prisma migrate deploy` runs automatically before each release.

## Security notes

- Passwords hashed with bcrypt (cost 12); refresh tokens live in an `httpOnly`, `sameSite=lax`, production-`secure` cookie.
- Uploaded files are magic-byte sniffed and stored with generated names — never the client filename/extension.
- Server validates membership/reply ownership on every path; `DATABASE_URL`/secrets never leave `.env` (git-ignored).
- No analytics, no ads. Ever.

## License

MIT