# Media storage

Dangro has three interchangeable media backends, chosen by `MEDIA_PROVIDER`:

| `MEDIA_PROVIDER` | Bytes live in | Served by | Cost |
|---|---|---|---|
| `gridfs` (default for MongoDB) | GridFS in the database | `GET /uploads/:name` | free, Atlas M0 |
| `disk` (default for PostgreSQL) | `server/uploads` | `express.static` | free |
| `remote` | a separate media host | `302` redirect to that host | free, but see below |

**Use `gridfs` or `disk`.** Both serve media from the app's own origin, so the
browser makes an ordinary same-origin request: no permission prompt, no
cross-origin redirect, and nothing of yours is exposed to your LAN.

---

## Why `remote` is not recommended

`remote` keeps files on a separate machine and answers `/uploads/:name` with a
**302 redirect** to that host:

```
browser ──GET /uploads/x.png──▶ API ──302──▶ http://192.168.1.50:8081/media/x.png
```

If that host is on a LAN address — a home machine, a `*.local` name, `localhost`
— the browser treats the image as a **local-network request** and stops to ask
the visitor to allow it:

> dangro.onrender.com wants to see devices on your local network

That prompt is the bug. It is unrelated to what the page is doing, it trains
people to approve local-network access out of habit, and if they decline, no
image ever loads. A public page has no legitimate reason to pull media from a
visitor's own network.

Two consequences, both now prevented in code:

- **`config.ts` refuses to boot** when `MEDIA_PUBLIC_URL` is not a public
  `https://` origin. Loopback, RFC 1918 (`10/8`, `172.16/12`, `192.168/16`),
  `169.254/16`, CGNAT, `*.local`, `*.internal` and bare hostnames are all
  rejected, as is plain `http://`. See `server/src/lib/publicHost.ts`.
- **The CSP will not whitelist it.** `img-src`/`media-src` are only widened to
  an origin that passes the same check, so a private host cannot be authorised
  even if one is reached some other way.

If you still need `remote`, it works — but the media host must be a **public
HTTPS** endpoint, and the sections below explain how to set one up.

---

## Setting up the separate host (only if you need `remote`)

The API stores nothing itself: it pushes each upload to a small media service
and replies to browsers with a **302 redirect** to that service.

Two things this buys you:

- **Video never passes through the API.** Only a 302 crosses Render, so your
  home uplink — not the API host — is the limit for large files.
- **The API stays stateless.** Its ephemeral disk holds nothing that matters,
  which is what makes the Render free tier viable.

The client needs no changes: `<img src="/uploads/…">` and the URL shape stored
in `attachmentUrl` / `mediaUrl` / `icon` are identical on every backend.

---

## 1. Start the media service

On the machine that will hold the files, create the key file once:

```bash
cd ~/Documents/Dangro
bash scripts/setup-media-env.sh
```

That writes `~/.dangro-media.env` (mode 0600) with a fresh random `MEDIA_KEY`,
and prints it once so you can copy it into the API host as
`MEDIA_INGEST_KEY`. Re-run with `--force` to rotate; that invalidates whatever
is currently set on the API.

Start the service in its own terminal — the port has to exist before you
expose it:

```bash
bash scripts/run-media-service.sh --foreground
```

It logs `[media] serving … on 127.0.0.1:8081` and refuses to start without
`MEDIA_KEY`. Once it is working, `bash scripts/run-media-service.sh` (no flag)
starts it detached instead, logging to `~/dangro-media.log`, so closing the
terminal or dropping an SSH session does not take uploads down.

Verify:

```bash
curl -s http://127.0.0.1:8081/health
tail -f ~/dangro-media.log    # when running detached
```

`server/media.env.example` documents the three variables if you'd rather write
the file by hand.

## 2. Expose it with Tailscale Funnel

Tailscale Funnel publishes the local port over HTTPS on a stable
`*.ts.net` hostname — no port forwarding, no public IP, no domain purchase,
and it works behind CGNAT.

**Start the media service first**, so the port exists when you expose it:

```bash
cd ~/Documents/Dangro/server
set -a; . ~/.dangro-media.env; set +a
npm run media:start          # leave this running
```

In a **second terminal**:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up            # opens a browser to authorise this machine
```

Then expose the port:

```bash
tailscale funnel --bg 8081
```

The first run opens a browser asking you to **approve enabling Funnel**. Approve
it, and Tailscale automatically provisions the HTTPS certificate and adds the
required `nodeAttrs` policy entry — you do not need to edit the tailnet policy
or toggle anything on the DNS page yourself.

It then prints something like:

```
Available on the internet:
|-- proxy https://ab-macbook.xxxxxxxxx.ts.net
```

That HTTPS URL (public port 443) forwards to your local 8081, and is your
`MEDIA_PUBLIC_URL`. Confirm it works:

```bash
curl -I https://ab-macbook.xxxxxxxxx.ts.net/health
```

> **`MEDIA_PUBLIC_URL` must be the full `https://….ts.net` URL above.**
> Never put your LAN IP, your `.local` name, or `http://127.0.0.1:8081` there.
> The media service binds `127.0.0.1` only, so a LAN address cannot reach it
> from Render anyway — but before the guard below existed it was still accepted
> and sent to the browser, which is exactly what produced the "wants to see
> devices on your local network" prompt on every image.

> **DNS can take up to 10 minutes** to propagate the first time, so a failure
> straight after setup does not necessarily mean it is misconfigured.

> **Bandwidth:** Funnel applies non-configurable bandwidth limits and relays
> traffic through Tailscale infrastructure. Fine for images; large video may be
> slow. If that proves a problem, the alternatives are Cloudflare R2 (10 GB
> free) or a DuckDNS + Caddy setup with port forwarding — both are pure
> configuration changes because the media backend is selected by
> `MEDIA_PROVIDER`.

## 3. Point the API at it

On the API host, in `server/.env` (or Render's Environment tab):

```
MEDIA_PROVIDER=remote
MEDIA_PUBLIC_URL=https://ab-macbook.xxxxxxxxx.ts.net
MEDIA_INGEST_URL=https://ab-macbook.xxxxxxxxx.ts.net
MEDIA_INGEST_KEY=<the same value as MEDIA_KEY>
```

The API refuses to boot without `MEDIA_PUBLIC_URL` and `MEDIA_INGEST_KEY`
when `MEDIA_PROVIDER=remote`, rather than failing later on the first upload.

Restart the API and confirm:

```bash
curl -s http://localhost:3001/api/health
```

## 4. Run it permanently

`npm run media:start` runs through `tsx`, which is fine for a foreground
session but is a development path. For the systemd service, compile once
(`npm run build` in `server/`) so it can run plain JavaScript from `dist/`.

With a UPS the machine survives outages, but a reboot still stops the service.
A systemd unit on the laptop:

```ini
# /etc/systemd/system/dangro-media.service
[Unit]
Description=Dangro media service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/Dangro/server
Environment=MEDIA_DIR=/home/YOUR_USER/dangro-media
Environment=MEDIA_PORT=8081
EnvironmentFile=/home/YOUR_USER/.dangro-media.env   # contains MEDIA_KEY
ExecStart=/usr/bin/node dist/media-service/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now dangro-media
systemctl status dangro-media
```

Keep `tailscaled` enabled too (`sudo systemctl enable tailscaled`) so the funnel
comes back after a reboot.

---

## Security notes

- `GET /media/:name` is public — that is inherent to media being viewable in a
  chat app. Uploads are served under random UUID filenames.
- `PUT /media/:name` requires `x-media-key`, compared with
  `crypto.timingSafeEqual` so the secret cannot be recovered from response
  timing. Filenames are restricted to `<uuid>.<ext>`, blocking traversal.
- The ingest endpoint is rate limited so a leaked URL cannot be used to fill
  your disk.
- Funnel exposes the media service publicly. Nothing else should listen on that
  port, and the service serves only the media directory.

## Backups

Once media lives on your laptop, that directory is the **only** copy. Nothing
replicates it to Render, Atlas or anywhere else. Keep it on a drive that is
backed up, or snapshot it:

```bash
rsync -a --delete ~/dangro-media/ /path/to/backup/dangro-media/
```

If the laptop is unavailable, uploads 404 and the rest of the site keeps
working.

## Switching back

Set `MEDIA_PROVIDER=gridfs` (or `disk` for the PostgreSQL backend) and restart.
Stored `/uploads/...` values are unchanged, but any media that only exists on
the media host becomes unreachable until it is copied over.

## Choosing again, in one line

| If you want | Use |
|---|---|
| No permission prompts, nothing exposed to your LAN, zero cost | `gridfs` (MongoDB) or `disk` (PostgreSQL) |
| Video to bypass the API entirely | `remote`, with a **public https** `MEDIA_PUBLIC_URL` |