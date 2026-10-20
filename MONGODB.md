# Running Dangro on MongoDB

Dangro normally runs on PostgreSQL through Prisma. It can also run on MongoDB,
including for images and videos. No route file changes: both backends expose the
same client surface, and `server/src/prisma.ts` picks one at startup.

---

## 1. Run a MongoDB server

Pick whichever is easiest. Nothing here is required by the app beyond a running
`mongod` on a reachable URI.

**Docker (recommended)**

```bash
docker run -d --name dangro-mongo -p 27017:27017 mongo:7
```

**Homebrew (macOS)**

```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Linux package** — see `https://www.mongodb.com/docs/manual/installation/` for
your distro, then `sudo systemctl start mongod`.

**Atlas (no install)** — create a free M0 cluster and use its
`mongodb+srv://...` URI. GridFS uploads work fine there; note that free and
shared tiers do **not** support multi-document transactions, so `$transaction`
stays sequential on Atlas M0 too. M0 also has a small shared storage limit
(500 MB), which uploads will eventually fill.

## 2. Point the server at MongoDB

In `server/.env`, **one variable per line**:

```
DATABASE_PROVIDER=mongo
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB_NAME=dangro
JWT_SECRET=your-long-random-secret
PORT=3001
NODE_ENV=development
CLIENT_URL=http://localhost:5173
```

`DATABASE_URL` is no longer required in this mode — the server only demands it
when `DATABASE_PROVIDER=postgres`.

> Put each variable on one line. `dotenv` reads one assignment per line, so two
> variables on one line produce a corrupted `DATABASE_URL` and an undefined
> `JWT_SECRET`.

### If MongoDB is on a different machine

`mongod` listens on `127.0.0.1` only, so a MongoDB on another machine is
unreachable until you change three things **on the machine running MongoDB**:

1. **Bind to the network.** `/etc/mongod.conf` (Linux) or
   `/etc/mongod.conf` (macOS Homebrew):

   ```yaml
   net:
     port: 27017
     bindIp: 0.0.0.0     # was 127.0.0.1
   ```

   Restart it: `sudo systemctl restart mongod` or `brew services restart mongodb-community`.

2. **Allow the port through the firewall** on that machine.

3. **Turn on authentication.** This is the important one — a `mongod` reachable
   from the network with authorization disabled lets anyone on that network read
   or delete your whole database. In `/etc/mongod.conf`:

   ```yaml
   security:
     authorization: enabled
   ```

   Create a user, then connect with credentials:

   ```js
   use admin
   db.createUser({ user: "dangro", pwd: "<long random password>", roles: [{ role: "readWrite", db: "dangro" }] })
   ```

   ```bash
   mongod --config /etc/mongod.conf --auth
   ```

Then point the server at it:

```
MONGODB_URI=mongodb://dangro:<password>@<mongo-host-ip>:27017/?authSource=dangro
```

On the machine running Dangro, `mongodb://127.0.0.1:27017` still works when
MongoDB is local — no configuration difference beyond the URI.

### Media follows the database

Because uploads live in GridFS rather than on disk, any machine running Dangro
against the same MongoDB serves the same images and videos. The second machine
needs no shared folder and no copied uploads — `/uploads/<uuid>.<ext>` is read
from the database on each request. (With the PostgreSQL backend, by contrast,
each machine only sees the files in its own `server/uploads` directory.)

## 3. Run it

```bash
npm run setup     # once, installs server + client
npm run dev
```

The startup line confirms the backend:

```
Connected to database (MongoDB dangro @ mongodb://127.0.0.1:27017)
Server running on port 3001
```

Collections are created on first write — there is no migration step, which is
the main practical difference from Prisma.

## 4. Verify

```bash
mongosh                                   # then:
use dangro
db.getCollectionNames()                   # after signing up: users, ...
```

Through the API:

```bash
curl -s http://localhost:3001/api/health
# {"success":true,"data":{"status":"ok","uptime":12.3}}

curl -s -X POST http://localhost:3001/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"mongotest","email":"mongotest@example.com","password":"password123"}'
# -> 201, and NO tokens: the account is unverified until the emailed link is
#    clicked. Needs the SMTP_* variables in EMAIL.md.
```

Sign up in the browser, click the emailed verification link (signup returns no
session until you do — see [`EMAIL.md`](./EMAIL.md)), then create a server and a
channel, post a message, and confirm it landed in Mongo:

```bash
mongosh
use dangro
db.users.findOne({ username: "mongotest" })
db.messages.find().sort({ createdAt: -1 }).limit(5)
```

---

## How images and videos are stored

BSON documents are capped at **16 MB**, and Dangro accepts uploads up to 50 MB,
so media cannot live in a normal field. MongoDB's answer is **GridFS**, which
splits a file into 255 KB chunks across two collections (`media.files` and
`media.chunks`) and streams it back on read.

Media storage is chosen independently of the database via `MEDIA_PROVIDER`, so
you can keep a MongoDB database and still store media elsewhere:

| `MEDIA_PROVIDER` | Bytes live in | Served by |
|---|---|---|
| `disk` (default for postgres) | `server/uploads` on disk | `express.static` |
| `gridfs` (default for mongo) | GridFS in the database | `GET /uploads/:name` |
| `remote` | a separate media host | `302` redirect to that host |

The public URL is `/uploads/<uuid>.<ext>` in all three cases, so no stored
`attachmentUrl`, `mediaUrl` or `icon` value changes meaning. Magic-byte
validation runs before anything is written, on every backend. See
[MEDIA.md](./MEDIA.md) for the remote host setup.

## Deploying to production with MongoDB

**Do not run `mongod` inside the container.** Container disk is *ephemeral*, so
the database would be wiped every time the instance sleeps, restarts or is
replaced. Keep the API on Cloudflare and put the database on **MongoDB Atlas**,
which is separate infrastructure and always on.

This works cleanly because Dangro keeps no durable state on the API host:
uploads live in GridFS, so the ephemeral disk holds nothing that matters.

### 1. Create the cluster

- [cloud.mongodb.com](https://cloud.mongodb.com) → **Create** → tier **M0 (Free)**.
- Pick the region closest to most of your users. Cloudflare starts the
  container near the request, so there is no single fixed "app region" to
  match; choose based on where the users are.
- A free cluster is a replica set, so transactions are available. Note that
  free/shared tiers historically varied here; if transactions are refused, the
  server logs a warning and falls back to sequential automatically.

### 2. Create the database user

**Database Access** → *Add New Database User*:

| Field | Value |
|---|---|
| Username | `dangro` |
| Password | a long random string — this is the only thing protecting the DB once step 3 opens it to the internet |
| Database User Privileges | *Read and write to any database* |

### 3. Allow Cloudflare to connect

**Network Access** → *Add IP Address*.

Cloudflare's container egress addresses are not a fixed list, so pinning them is
not possible — the practical choice is `0.0.0.0/0`, which relies entirely on the
credentials from step 2. Make that password long and random; anyone who guesses
it gets full read/write access.

### 4. Configure Cloudflare

```bash
npx wrangler secret put MONGODB_URI
```

Paste the `mongodb+srv://...` string Atlas shows after step 3.

`DATABASE_PROVIDER=mongo`, `MONGODB_DB_NAME=dangro` and
`MEDIA_PROVIDER=gridfs` come from `wrangler.jsonc`, and `worker/index.ts`
forwards them into the container. Delete `DATABASE_URL` if it is still set —
the MongoDB backend ignores it, but leaving a stale Postgres string around
invites confusion.

Then deploy (`npx wrangler deploy`) and watch the container log for:

```
Connected to database (MongoDB dangro @ mongodb+srv://...)
MongoDB indexes verified
```

### 5. Verify before retiring the old database

```bash
curl -s https://dangro.<subdomain>.workers.dev/api/health
# {"success":true,"data":{"status":"ok","uptime":..,"database":"mongo"}}
```

Then in the browser: sign up, create a server and channel, send a message, and
**upload an image** — the last one matters, because it proves GridFS writes and
the `/uploads/...` read path work in production. Check that a second browser
sees the message arrive in realtime (Socket.IO).

Only once that all works, back up and delete the old database:

```bash
pg_dump "$NEON_URL" > dangro-backup.sql
```

Keep that dump (and the Neon project) for a week before deleting anything —
deleting a database is not reversible.

### 6. Indexes are created automatically

`server/src/db/mongoIndexes.ts` runs on every boot and creates the unique and
foreign-key indexes declared in `mongoSchema.ts`, so there is no migration step.
Note the consequence: unique constraints only exist once the server has started
at least once against that cluster.

## 7. Email verification on MongoDB

Users gained the verification columns with no migration and no backfill, which
is only safe because of one deliberate decision worth knowing about:

**A user document with no `emailVerified` field is a legacy account and is
trusted.** Only `POST /auth/register` writes an explicit `false`, and that is
the only thing that makes an account unverified. Deploying this feature
therefore does **not** sign anyone out — no `updateMany`, no data rewrite, and
nothing to roll back if you change your mind.

The same decision is expressed in `prisma/schema.prisma` as a **nullable,
defaultless** `Boolean?`, so `null` means the same thing on both backends. Do
not "tidy" either side into `NOT NULL DEFAULT false`: that single change locks
out every pre-existing account until they click a link they never received.

Two indexes back the feature, both created on boot by `ensureIndexes`:

| Index | Collection | Why |
|---|---|---|
| `email_verification_token` | `users` | `users.emailVerificationTokenHash` |
| `password_reset_token` | `users` | `users.passwordResetTokenHash` |

Without them, every link click is a collection scan — which turns "open the link
in my email" into a slow request once the user collection is large.

Verification state lives **on the user document**, not in a side collection, so
claiming a token is a single conditional write inside one document and needs no
transaction:

```js
db.users.updateMany(
  { emailVerificationTokenHash: sha256, emailVerificationUsedAt: null, emailVerified: false },
  { $set: { emailVerified: true, emailVerifiedAt: now, emailVerificationUsedAt: now } }
)
```

That is the whole single-use guarantee: the filter names the hash, the unused
marker, the verified flag and a live expiry, so exactly one concurrent request
can match. Two simultaneous clicks cannot both verify.

The existing `uniq_email` and `uniq_username` indexes already cover uniqueness.
`uniq_email` is a unique index on *normalised* addresses because the routes
lower-case and trim on every write, so `Bob@Example.com` and `bob@example.com`
cannot both exist. Usernames are stored as typed and checked case-insensitively
by the route, because MongoDB's unique indexes are byte-exact and a collation
index would change comparison semantics everywhere else.

---

## Behaviour differences from the PostgreSQL backend

- **No migrations.** Schemas come from `server/src/db/mongoSchema.ts`, which
  mirrors `prisma/schema.prisma`. Indexes (unique + foreign key) are created
  automatically at startup by `mongoIndexes.ts`.
- **`$transaction` degrades gracefully.** It runs a real MongoDB transaction
  where the deployment supports one, and falls back to running the operations in
  order when it does not (a standalone local `mongod`, or a tier that refuses
  transaction commands). The one call site is friend-request acceptance in
  `friends.ts`.
- **Relations are loaded with batched extra queries**, one per relation per
  page, rather than SQL joins. This is invisible at API level but produces more
  round trips than Postgres does.
- **Unique constraints are not enforced by the database.** `mongoSchema.ts`
  declares them so `findUnique` can build a compound filter, but a duplicate
  insert will not be rejected. The routes already check for existing records
  before creating, which covers the current call sites. (`ensureIndexes` does
  create the unique indexes, so a duplicate is normally caught as a duplicate-key
  error, which `lib/http.ts` maps to `CONFLICT` rather than a 500.)
- **Unsupported query shapes throw loudly** instead of silently returning the
  wrong rows: relation filters other than `some` (`every`, `none`), nested
  writes, `createMany`, `aggregate`, and any field missing from
  `mongoSchema.ts`. That last one is deliberate — it catches drift between the
  two schema files at the first request that touches the new field.

## Where to read more

- [MEDIA.md](./MEDIA.md) — serving images and videos from a separate host
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Cloudflare Workers + Containers deploy details

## Switching back

Set `DATABASE_PROVIDER=postgres` (or delete the line, since Postgres is the
default). Note that data is **not** shared between backends: MongoDB and
Postgres hold separate copies, and switching back does not migrate anything.