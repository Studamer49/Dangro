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
```

Sign up in the browser, create a server and a channel, post a message, then
confirm it landed in Mongo:

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

| | PostgreSQL | MongoDB |
|---|---|---|
| Where bytes live | `server/uploads/` on disk | GridFS in the database |
| Served by | `express.static` | `GET /uploads/:name` → GridFS stream |
| Public URL | `/uploads/<uuid>.<ext>` | `/uploads/<uuid>.<ext>` (identical) |

The URL shape is identical on both backends, so no stored `attachmentUrl`,
`mediaUrl` or `icon` value changes meaning when you switch providers. Magic-byte
validation still runs before anything is written, on both backends — the temp
file is validated first and only then streamed into GridFS.

## Behaviour differences from the PostgreSQL backend

- **No migrations.** Schemas come from `server/src/db/mongoSchema.ts`, which
  mirrors `prisma/schema.prisma`. Changing a model means editing that file.
- **`$transaction` is sequential, not atomic.** Only `friends.ts` uses it
  (accepting a friend request). MongoDB multi-document transactions require a
  replica set; a plain local `mongod` is a standalone node and cannot do it. To
  get real atomicity, run a replica set (e.g. `mongod --replSet rs0` plus
  `rs.initiate()`) and switch `$transaction` to `session.withTransaction`.
- **Relations are loaded with batched extra queries**, one per relation per
  page, rather than SQL joins. This is invisible at API level but produces more
  round trips than Postgres does.
- **Unique constraints are not enforced by the database.** `mongoSchema.ts`
  declares them so `findUnique` can build a compound filter, but a duplicate
  insert will not be rejected. The routes already check for existing records
  before creating, which covers the current call sites.
- **Unsupported query shapes throw loudly** instead of silently returning the
  wrong rows: relation filters other than `some` (`every`, `none`), nested
  writes, `createMany`, `aggregate`, and any field missing from
  `mongoSchema.ts`. That last one is deliberate — it catches drift between the
  two schema files at the first request that touches the new field.

## Switching back

Set `DATABASE_PROVIDER=postgres` (or delete the line, since Postgres is the
default). Note that data is **not** shared between backends: MongoDB and
Postgres hold separate copies, and switching back does not migrate anything.