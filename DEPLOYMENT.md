# DEPLOYMENT.md

How to stand Dangro up on Render with a Neon PostgreSQL database.

## Architecture

```
GitHub  →  Render Web Service (single instance)  →  Neon PostgreSQL
```

- Render builds the frontend **into** the service, and the Express server serves the SPA, the `/api` routes and Socket.IO all from **one origin** (`CLIENT_URL` = your Render service URL).
- No separate static host, no GitHub Pages, no CORS gymnastics (origin == host is allowed; `VITE_*` variables are not required in production).
- Uploads land on the service disk (`server/uploads`) because Render Free has no persistent disk — treat them as ephemeral. Backups / CDN are documented future work.

## Prerequisites

1. A **Neon** project (https://neon.tech) — copy the pooled/unpooled connection string.
2. A GitHub repo containing this project.
3. A Render account.

## 1. Render service

1. **New → Web Service → Connect** your GitHub repo.
2. Template: use **`render.yaml`** (Blueprint) **or** create the service manually with:
   - **Build Command**
     ```bash
     npm install --prefix server
     npm install --prefix client
     npm run build --prefix client
     npm --prefix server run db:generate
     npm run build --prefix server
     ```
   - **Pre-Deploy Command** (runs migrations against the DB before the new version starts)
     ```bash
     npm run db:deploy
     ```
   - **Start Command**
     ```bash
     npm start
     ```
   - **Health Check Path**: `/api/health`

3. **Environment variables** (Dashboard → Environment):

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `PORT` | `3001` (Render overrides the actual port; keep this as a fallback) |
   | `CLIENT_URL` | `https://<your-service>.onrender.com` |
   | `DATABASE_URL` | your Neon connection string |
   | `JWT_SECRET` | long random string (≥32 chars) — use Render’s *Generate* |
   | `JWT_REFRESH_SECRET` | another long random string — use Render’s *Generate* |

   `JWT_REFRESH_SECRET` is optional — it defaults to `JWT_SECRET + "_refresh"` if unset, but a separate value is safer.

4. Deploy. The first deploy runs `prisma migrate deploy`, then boots the service and serves everything from `https://<your-service>.onrender.com`.

## 2. Local development

```bash
npm ci --prefix server
npm ci --prefix client
```

Create `server/.env` (see `server/.env.example`):

```env
DATABASE_URL=postgresql://...
JWT_SECRET=a-long-random-string
JWT_REFRESH_SECRET=another-long-random-string
PORT=3001
CLIENT_URL=http://localhost:5173
```

Create `client/.env` (all `VITE_*` values are public — never put secrets here):

```env
VITE_API_URL=/api
VITE_WS_URL=
```

Then, from the repo root:

```bash
npm run dev            # server (3001) + client (5173), Vite proxies /api, /uploads, /socket.io
```

To apply schema changes locally: `npm run db:migrate`. To deploy DB schema: `npm run db:deploy`.

## 3. Database (Neon) notes

- The schema lives in `server/prisma/schema.prisma`; there are 2 committed migrations. Freestyle edits to the DB are discouraged — change the schema and run `prisma migrate dev`.
- **Never commit `DATABASE_URL`.** Both `.env` files are git-ignored (`!.env.example` allows the templates).
- Uploaded files and long-lived content are on the service disk. For any real user base, add object storage (S3/R2) before scaling beyond a hobby deployment.

## 4. Health, logs, redeploys

- `GET /api/health` returns `{ success: true, data: { status: "ok", uptime } }` — used by Render’s health checks and as the canary endpoint for curl/uptime tools.
- Promote/rollback: any push to the connected branch triggers a new deploy. Use a staging branch + a second Web Service if you want preview deploys.
- If a migration fails during pre-deploy, the old release stays live — fix the migration and redeploy.

## 5. Docker (alternative packaging)

```bash
docker build -t dangro .
docker run --rm -p 3001:3001 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://... \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e CLIENT_URL=http://localhost:3001 \
  dangro
# open http://localhost:3001
```

The image builds from `Dockerfile` (base → build → runtime), installs with `npm ci`, generates the Prisma client, and exposes `3001`.

## 6. Post-deployment checklist

- [ ] `curl https://<service>.onrender.com/api/health` → `{"success":true,...}`
- [ ] Register a user, confirm the email free inbox isn’t required (no email verification yet).
- [ ] Create a server → it appears in the left rail → add a channel → both users can chat.
- [ ] Upload a profile avatar and an image post; confirm `/uploads/...` URLs load.
- [ ] Open two browsers, send a DM, see typing + read receipts over Socket.IO.
- [ ] Look for 400/401/500s in the Render build/runtime logs; ignore expected auth 401s before login.