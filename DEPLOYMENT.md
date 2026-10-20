# DEPLOYMENT.md

How to run Dangro entirely on Cloudflare, with MongoDB Atlas as the database.

## Architecture

```
browser ──▶ Cloudflare Worker (dangro)
                 ├─▶ Static assets: client/dist, served from the edge
                 └─▶ Container: Express API + /uploads + Socket.IO
                          └─▶ MongoDB Atlas (data + GridFS media)
```

One Worker, one hostname, one origin:

- The React SPA is uploaded as [Workers static assets](https://developers.cloudflare.com/workers/static-assets/) and served from Cloudflare's edge. It never wakes the container.
- `/api/*`, `/uploads/*` and `/socket.io/*` are forwarded to a [Cloudflare Container](https://developers.cloudflare.com/containers/) running the existing Express server.
- Because both share the Worker hostname, `VITE_API_URL` is not needed, CORS is same-origin, cookies work normally and stored `/uploads/...` URLs resolve without a redirect.
- Uploads live in **GridFS inside MongoDB** (`MEDIA_PROVIDER=gridfs`). Container disk is ephemeral, so `disk` must not be used in production.

> **Cloudflare Containers require the Workers Paid plan** ($5/month plus container usage). The free Workers plan cannot run the container.

## Prerequisites

1. A Cloudflare account with **Workers Paid** enabled.
2. A **MongoDB Atlas** cluster (the free M0 tier works). Cloudflare hosts the compute; Atlas stores the data.
3. Node 20+ and this repository.
4. Optional, for full functionality:
   - Cloudinary credentials (image uploads).
   - An SMTP provider (signup verification, password resets).
   - A TURN relay (calls between different networks).

## 1. Public origin

Nothing to configure. When the first request reaches the Worker, it passes its
own origin (`https://dangro.<subdomain>.workers.dev`, or your custom domain) to
the container as both `APP_BASE_URL` and `CLIENT_URL`, so emailed links and
CORS are correct without editing a file.

To pin a specific origin — because several hostnames point at the same Worker
and links must always use one — set either value explicitly:

```jsonc
"vars": {
  "APP_BASE_URL": "https://dangro.example.com",
  "CLIENT_URL": "https://dangro.example.com"
}
```

`APP_BASE_URL` is what verification and password-reset emails link to;
`CLIENT_URL` is the origin CORS and Socket.IO accept.

## 2. Set secrets

Secrets are Worker secrets. `worker/index.ts` reads the allow-listed ones and
passes them to the container when it starts, so they never appear in the image
or the repository.

```bash
npx wrangler login

# Required
npx wrangler secret put MONGODB_URI          # mongodb+srv://...
npx wrangler secret put JWT_SECRET           # openssl rand -base64 48
npx wrangler secret put JWT_REFRESH_SECRET   # a different long random string

# Images (uploads return 503 without these)
npx wrangler secret put CLOUDINARY_CLOUD_NAME
npx wrangler secret put CLOUDINARY_API_KEY
npx wrangler secret put CLOUDINARY_API_SECRET

# Email (signup returns 503 without these)
npx wrangler secret put SMTP_HOST
npx wrangler secret put SMTP_PORT
npx wrangler secret put SMTP_USER
npx wrangler secret put SMTP_PASS
npx wrangler secret put EMAIL_FROM

# Calls across networks (optional)
npx wrangler secret put TURN_SECRET
```

`DATABASE_PROVIDER=mongo`, `MONGODB_DB_NAME`, `MEDIA_PROVIDER=gridfs`,
`NODE_ENV` and `PORT` are already set as vars in `wrangler.jsonc`.

A running container keeps the environment it started with. After changing a
secret, the new value is picked up on the next container start: it happens
automatically after 30 idle minutes, or immediately if you redeploy.

See [`EMAIL.md`](./EMAIL.md) for provider setup, [`MEDIA.md`](./MEDIA.md) for
Cloudinary and GridFS, and [`MONGODB.md`](./MONGODB.md) for Atlas.

## 3. Deploy

### From your machine

Docker must be installed and running, because Wrangler builds the container
image from `Dockerfile`.

```bash
npm ci
npm run build:client
npx wrangler deploy
```

The first deploy takes several minutes: it builds and uploads the image, then
provisions container capacity. The Worker can answer before the container is
ready; requests during that window fail with a readiness error and succeed
once provisioning finishes.

### From Git (no local Docker)

Connect the repository in **Workers & Pages → Create → Workers → Connect to
Git** and set:

| Setting | Value |
|---|---|
| Build command | `npm run build:client` |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |

Workers Builds can build Dockerfile-based containers in its own environment.
Every push to `main` then rebuilds the image, rolls out new container
instances, and updates the Worker.

## 4. Verify

```bash
curl https://dangro.<your-subdomain>.workers.dev/api/health
```

You want `"status":"ok"`, plus `"database":"mongo"`, and
`"imageStorage":"cloudinary"` / `"emailDelivery":"smtp"` once those are
configured.

Useful container commands:

```bash
npx wrangler containers list
npx wrangler containers images list
npx wrangler tail                       # Worker logs
```

Container logs (including the server's `[startup]` lines) are in the dashboard
under **Workers & Pages → Containers → dangro**.

## 5. Local development

The ordinary dev loop is unchanged and does not involve Cloudflare:

```bash
npm ci
npm ci --prefix server
npm ci --prefix client
npm run dev        # Express on 3001 + Vite on 5173
```

Create `server/.env` and `client/.env` from the examples. `npm run dev` keeps
working because Vite proxies `/api`, `/uploads` and `/socket.io` to port 3001.

To exercise the Worker and container locally, install Docker and put test
secrets in `.dev.vars` (git-ignored):

```bash
npm run dev:worker   # wrangler dev on http://localhost:8787
```

## 6. Container behaviour

- **One instance, by design.** The server keeps Socket.IO rooms, presence,
  rate-limit counters and call state in process memory. `worker/index.ts`
  always routes to the Durable Object named `main`; adding instances would
  split that state. If you ever need horizontal scale, move sockets to a
  Redis adapter and rate limits to a shared store first.
- **Idle sleep.** After 30 minutes with no traffic the container stops. The
  next request performs a cold start (typically 1-3 seconds) and then the
  readiness gate releases. Open WebSockets keep the Durable Object active.
- **Ephemeral disk.** Anything written to the filesystem is lost when the
  instance stops. GridFS and Cloudinary are unaffected; that is why
  `MEDIA_PROVIDER=gridfs` is set in `wrangler.jsonc`.
- **Outbound access** is enabled so the container can reach Atlas, Cloudinary
  and your SMTP host.
- **Size.** The container runs on the `basic` instance (1 GiB RAM, 1/4 vCPU).
  `lite` (256 MiB) is too small for Node plus the Mongo driver.

## 7. Database notes

- Dangro's MongoDB backend has no migrations. `prisma generate` runs during the
  image build only because the Prisma client types and shim are shared with the
  optional PostgreSQL path; no database connection is needed at build time.
- **Never commit `MONGODB_URI`.** It is a Worker secret.
- Atlas must accept connections from Cloudflare's container egress addresses.
  They are not a fixed list, so use `0.0.0.0/0` on the Atlas access list and rely
  on the database user's password (and Atlas's own auth) for security. A
  dedicated database user with access only to the `dangro` database is better
  than reusing an admin user.
- See [`MONGODB.md`](./MONGODB.md) for how to create the cluster and user.

## 8. Post-deployment checklist

- [ ] `curl https://<worker>/api/health` → `"status":"ok"` and `"database":"mongo"`
- [ ] Register a user — the page says "Check your inbox", and the email link
      points at the Worker origin (not localhost).
- [ ] Click the link → "Email verified", then sign in.
- [ ] Sign in before verifying → a clear "verify your email" message.
- [ ] `/forgot-password` → the reset link arrives and the new password works.
- [ ] Create a server, add a text channel, send a message from two accounts.
- [ ] Upload an avatar and an image post; confirm the image loads from the
      same origin.
- [ ] Open two browsers, send a DM, and confirm typing and read receipts
      arrive over Socket.IO.
- [ ] Check **Workers & Pages → Containers → dangro** logs for 400/401/500s;
      ignore expected 401s before login.

## 9. Migrating off Render

This repository used to deploy to Render. There is no Render configuration
left: `render.yaml` is gone and every required variable is either a
`wrangler.jsonc` var or a Worker secret. Workers statics assets replace the
Express static handler, Cloudflare Containers replace the Render web service,
and MongoDB Atlas was already external.

The old Render service can be deleted once the Cloudflare deployment passes
the checklist above.
