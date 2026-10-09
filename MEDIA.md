# Media storage on a separate host

Dangro can keep uploaded images and videos on a machine other than the API
host. The API stores nothing itself: it pushes each upload to a small media
service and replies to browsers with a **302 redirect** to that service.

```
browser ──POST /api/uploads──▶ API (Render) ──PUT──▶ media service (your laptop)
        ◀──── /uploads/<id>.png ────                    │
        ───────GET /uploads/<id>.png──▶ 302 ──────────▶ GET /media/<id>.png
```

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