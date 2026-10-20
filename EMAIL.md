# Email — verification, password reset and address changes

Dangro sends three kinds of email, all over the same SMTP connection:

| Email | Sent when | Link opens |
|---|---|---|
| Verification | Signup, "send a new link" in Settings, or an address change | `/verify-email?token=…` |
| Password reset | `/forgot-password` | `/reset-password?token=…` |
| Address-change alert | The old address, after an address change | `/reset-password` |

Everything runs on the server. No mail credential ever reaches the browser.

---

## 1. Which provider

Any SMTP server works. Pick one of these:

| Provider | Free tier | Good for |
|---|---|---|
| **Resend** | 3,000 emails/month, 100/day | Production. Needs a verified sending domain; gives you DKIM/SPF records to paste into DNS. |
| **Brevo (Sendinblue)** | 300 emails/day | Production, same DNS-verification model as Resend. |
| **Mailtrap** | 1,000 emails/month | Staging. Catches everything in a web inbox instead of a real mailbox. |
| **Gmail / Google Workspace** | 500/day | Small sites. Restricted to `gmail.com` / Workspace addresses and heavily rate-limited. |
| **MailHog / Mailpit** (Docker) | unlimited, local only | Local development. Nothing leaves your machine. |

Resend's and Brevo's free tiers are real limits, not unlimited quotas — Resend's
is 3,000 messages/month and 100/day, Brevo's is 300/day. Plenty for a hobby
deployment; both require payment details before they will send to arbitrary
recipients, and both stop sending if you stay anonymous for too long.

**Do not use your personal Gmail password for a deployed app.** If the account
is ever compromised, an attacker gets your mail too, and Google's terms forbid
automated sending from consumer accounts.

---

## 2. Environment variables

Add these to `server/.env` locally, and as Worker secrets on Cloudflare
(`npx wrangler secret put <NAME>`). Copy `server/.env.example` — it already has
the placeholders. `worker/index.ts` forwards them into the container.

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_XXXXXXXXXXXXXXXXXXXXXXXX
EMAIL_FROM=Dangro <no-reply@yourdomain.com>
EMAIL_FROM_NAME=Dangro
APP_BASE_URL=https://dangro.<subdomain>.workers.dev
```

| Variable | Required | Meaning |
|---|---|---|
| `SMTP_HOST` | yes | Mail server hostname. |
| `SMTP_PORT` | no (`587`) | `465` = implicit TLS, `587` = STARTTLS. `SMTP_SECURE=true` forces TLS on any port. |
| `SMTP_USER` | with `SMTP_PASS` | The login your provider issued. |
| `SMTP_PASS` | with `SMTP_USER` | Its password or API key. Omit **both** for an unauthenticated local relay. |
| `EMAIL_FROM` | yes | The `From:` address. Defaults to `SMTP_USER`. |
| `EMAIL_FROM_NAME` | no (`Dangro`) | The display name. |
| `APP_BASE_URL` | in production | The public origin every link is built from. Defaults to the first `CLIENT_URL`, which is right for both the single-origin Cloudflare layout and the Vite dev server. |
| `EMAIL_TRANSPORT` | no (`smtp`) | `json` records that a message was produced in the server log instead of sending it — the body, and therefore the token, is **not** logged. For local UI work only; see §5. |
| `EMAIL_TIMEOUT_MS` | no (`10000`) | Hard deadline for one send. |
| `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` | no (`30`) | Verification link lifetime. Clamped to 5–1440. |
| `PASSWORD_RESET_TOKEN_TTL_MINUTES` | no (`30`) | Reset link lifetime. Clamped to 5–1440. |
| `EMAIL_VERIFY_RATE_LIMIT` | no (`20`) | Requests per IP per 15 min for `/verify-email` and `/reset-password`. |
| `EMAIL_RESEND_RATE_LIMIT` | no (`5`) | Requests per IP per 15 min for `/resend-verification` and `/forgot-password`. |

Every one of these is server-only. **Never give any of them a `VITE_` prefix** —
Vite inlines those into the browser bundle, which would publish your SMTP
password. `server/src/lib/credentialExposure.test.ts` fails the build if you do.

### Getting the credentials

**Resend** — [resend.com](https://resend.com) → *API Keys* → *Create API Key*.
The key is the `SMTP_PASS`. `SMTP_USER` is the literal string `resend`, and
`SMTP_HOST` is `smtp.resend.com`.

**Brevo** — [brevo.com](https://www.brevo.com) → *SMTP & API* → *SMTP* shows a
generated login and password. `SMTP_HOST` is `smtp-relay.brevo.com`, port `587`.

**Google Workspace** — Admin console → *Google Workspace* → *Email* → *SMTP &
POP*. Use `smtp.gmail.com`, port `587`, `SMTP_USER` = the full address,
`SMTP_PASS` = a Google **App Password** (not the account password; 2FA must be
on).

**Mailpit (Docker)** — `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`
then `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, no user or password,
`EMAIL_FROM=dangro@localhost.test`. The inbox is at <http://localhost:8025>.

---

## 3. Why the sender domain has to be verified

Providers will not let you send as `@gmail.com` from your own server — that is
how phishing works. So you use a domain you control, and the provider proves you
control it before letting mail out of it.

1. Add a domain in the provider (Resend → *Domains* → *Add Domain*).
2. The provider gives you a set of DNS records — usually SPF (`TXT`), DKIM
   (`TXT` or `CNAME`), and sometimes a custom `DMARC` record.
3. Add them to wherever your DNS is hosted (Cloudflare, Route 53, whatever).
4. Wait for propagation, then click *Verify*. Minutes, occasionally hours.

Until verification completes the provider either refuses to send or drops the
message silently, which is the single most common cause of "signup works but no
email arrives".

`EMAIL_FROM` must then be on that verified domain —
`no-reply@yourdomain.com`, not `you@gmail.com`.

---

## 4. Testing delivery locally

Three options, cheapest first.

### a. `EMAIL_TRANSPORT=json` — nothing leaves the machine

```env
EMAIL_TRANSPORT=json
```

Register a throwaway account and the server log records one line per message:

```
[email] EMAIL_TRANSPORT=json — rendered but NOT delivered to ***@example.com ("Verify your Dangro email address"). Use a real SMTP host, or keep this mode for local UI work only.
```

**The message body is not logged**, by design — it contains the one-time
verification token, and a deploy log is the last place a working login link
should end up. That means this mode shows you *that* mail was produced, not
*what* it said: use Mailpit below when you need to actually read the message.

### b. Mailpit — a real inbox on localhost

```bash
docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit
```

```env
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
EMAIL_FROM=dangro@localhost.test
APP_BASE_URL=http://localhost:5173
```

Click the link in <http://localhost:8025>. This is the best local check,
because it exercises the SMTP path, the URL building and the token.

### c. A real provider's test domain

Resend and Brevo both let you send to your own address before a domain is
verified. Use that to confirm the credentials themselves work, then finish the
domain verification for everyone else.

### End-to-end checklist

```bash
npm run dev

# 1. sign up at http://localhost:5173/register
# 2. the page must switch to "Check your inbox"
# 3. open the link -> "Email verified"
# 4. /login with the same password must now work
# 5. signing in before step 3 must fail with EMAIL_NOT_VERIFIED
```

Automated tests never send real mail: `server/src/routes/emailVerification.test.ts`
replaces the transport with a recorder.

---

## 5. What happens when email is not configured

The server **starts anyway** — a missing mail server must not take chat and
messages down for everyone. What it will not do is quietly skip verification.

`/register`, `/resend-verification`, `/forgot-password` and an address change all
check the mail server **before writing anything**, and return:

```
503 SERVICE_UNAVAILABLE
Email is not configured on this server (missing SMTP_HOST, EMAIL_FROM),
so no message could be sent. Nothing has been changed — please try again
once an administrator has set it up.
```

Because that happens before the insert, **no account is created** — a user never
loses their email address to a server misconfiguration. And at boot you get one
line:

```
[startup] Email is DISABLED — signup, resend and password reset will return 503 (missing SMTP_HOST, EMAIL_FROM).
```

`GET /api/health` reports `"emailDelivery": "unconfigured"` (or `"smtp"` /
`"json"`), which is the quickest thing to check after a deploy.

### When the server IS configured but the provider is down

Resend and forgot-password probe the mail server before looking an address up.
If it is not answering, **every caller** gets the same `503`, naming the reason:

```
503 SERVICE_UNAVAILABLE
Email is configured but the mail server is not answering: the mail server could
not be reached. No message was sent — please try again in a few minutes.
```

The verdict is cached for 10 seconds, so a burst of requests costs one SMTP
round trip rather than one each.

## 5b. The one deliberate trade-off

`/resend-verification` and `/forgot-password` are unauthenticated, so their
responses are a potential account-existence oracle. They answer in three ways:

| Situation | Response | Leaks that an account exists? |
|---|---|---|
| Mail server unusable | `503`, identical for every address | **No** — decided before the address is even looked up |
| Provider refused this specific message | `502 UPSTREAM_ERROR` | **Yes** |
| Send accepted, or there was nothing to send | `200` with the same generic message for every address | **No** |

The middle row is a knowing trade. Answering "a link is on its way" when no
link was sent is how people lose accounts — they wait for mail that was never
produced and conclude the product is broken. The alternative (staying silent
about the failure) trades a real reliability problem for a narrow privacy leak
that only materialises in the window where the provider is reachable but
rejecting messages for a specific recipient.

If you would rather have the leak closed, the change is one `catch` block in
`server/src/routes/auth.ts` — return the generic `200` and log the failure
instead of rethrowing.

---

## 6. Production

1. Verify the sending domain (§3).
2. Set the variables above as Worker secrets. `APP_BASE_URL` must be your
   public Worker origin — a `localhost` link is the classic "it works on my
   machine" for this feature.
3. `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`EMAIL_FROM` are all
   `wrangler secret put` values; never put them in `wrangler.jsonc` or Git.
4. Deploy and read the container boot log:
   ```
   [startup] Email: SMTP smtp.resend.com:465 — links use https://dangro.<subdomain>.workers.dev
   ```
   A `CONFIGURED BUT NOT WORKING` line means the server answered and the
   credentials were wrong — the deploy did not fail, so this line is the only
   way you will find out.
5. Sign up with a real address and click the link.

---

## 7. Troubleshooting

**Nothing arrives.**
Check the boot log and `/api/health` first — `unconfigured` means the app never
tried. Then:

- **Spam / promotions.** Ask the provider to check its suppression list, and
  look for a bounce log on their dashboard. Gmail and Outlook both filter
  unfamiliar senders aggressively until you have SPF + DKIM + DMARC.
- **Rejected as spam by the receiving server.** The provider's dashboard will
  show the bounce with a reason code. Missing SPF/DKIM is the usual cause.
- **Nothing, no bounce.** The provider accepted it and it went nowhere. Almost
  always an unverified domain, or an `EMAIL_FROM` on a domain you do not own.
- **Links point at `localhost`.** `APP_BASE_URL` is unset or wrong.

**SMTP authentication fails (535 / "authentication failed").**

- `SMTP_USER` is the login your provider issued, not always the from-address.
  Resend's is literally `resend`.
- For Gmail you need an **App Password**, not the account password, and 2FA
  enabled on the account.
- Half a credential pair is refused at boot with a named variable. Both, or
  neither for a local relay.
- Port 465 needs `SMTP_SECURE=true`; the port default already implies it. Port
  587 must *not* be secure.

**Timeouts.** `EMAIL_TIMEOUT_MS` defaults to 10s. Raise it only for a genuinely
slow relay — a hung send holds the signup request open for that long.

**Links expire too fast.** Raise `EMAIL_VERIFICATION_TOKEN_TTL_MINUTES` (up to
1440). The email tells the user the real number, so what is shown and what is
enforced cannot drift apart.

**`RATE_LIMITED` on resend.** `EMAIL_RESEND_RATE_LIMIT` defaults to 5 per IP per
15 minutes, because these two endpoints can otherwise be used to mail-bomb
somebody else's inbox. Raise it with care.

**`503 … the mail server is not answering`.** The credentials or the host are
wrong, or the provider is down. Check the boot line — it prints the same
classification — and run the provider's own SMTP test.

**Verification succeeds but login still says unverified.** You are talking to
two different deployments or two different databases. Confirm `MONGODB_URI` /
`DATABASE_URL` match on every instance.

---

## 8. How it works

- Signup normalises the address (trim + lowercase), hashes the password with
  bcrypt, and creates the account with `emailVerified: false`. **No session is
  issued.**
- The verification token is 32 bytes from the OS CSPRNG, base64url-encoded. Only
  `sha256(token)` is stored, so a database dump cannot be replayed. The raw
  token exists only inside the emailed URL.
- Clicking the link claims the token with one conditional write whose filter
  includes the hash, an unused marker and a live expiry. Exactly one concurrent
  request can match — a double-click, or a mail scanner that pre-fetched the
  link, cannot verify twice.
- Login, `/auth/refresh` and `/auth/me` all read the flag from the database. A
  client-supplied `emailVerified` is never consulted.
- Changing the address or password bumps `authSessionVersion`, which every
  issued token carries, so outstanding sessions stop working.
- Accounts that predate this feature have no `emailVerified` field at all. They
  read back as trusted and are never locked out. See the comment in
  `server/src/db/mongoSchema.ts`.