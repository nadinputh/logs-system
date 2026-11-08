# Self-hosted deployment: Docker + Cloudflare Tunnel + MongoDB Atlas

```
browser ──TLS──▶ Cloudflare edge (WAF, rate limits, TLS) ──tunnel──▶ cloudflared ──▶ app:4000 ──TLS──▶ Atlas
                                                    cron ──private network──▶ app:4000
```

The host exposes **no inbound port**. `cloudflared` dials out to Cloudflare, so the origin
cannot be reached around the WAF, and the host firewall can deny all inbound traffic.

## 1. Host

- Firewall: deny all inbound (SSH only from your IP, or use Cloudflare Access for SSH). Allow outbound.
- Give the host a **static egress IP**: Atlas allowlists it.
- Install Docker. Enable unattended OS security updates.

## 2. MongoDB Atlas

1. **Network Access**: add only the host's egress IP. Never `0.0.0.0/0`.
2. **Database user for the app**: SCRAM, 32+ char random password, scoped to the one database.
   For the strongest setup, use a custom role that enforces the append-only ledger in the
   database itself, not just in code:
   - `find`, `insert` only on `logs`, `auditlogs`, `teamauditlogs`
   - `find`, `insert`, `update`, `remove` on every other collection
   - `createIndex` on all of them (Mongoose builds indexes on boot)

   Collection-level grants mean a new model needs a role update, or it fails with
   "not authorized". The simpler fallback is `readWrite@<db>`.
3. **Separate admin user** for `npm run seed` / backfill scripts. `scripts/purge-legacy-selfies.ts`
   updates `logs` and must run as this user. Never put it in the server's env.
4. Turn on **Cloud Backup** with point-in-time restore. Turn on the **database audit log** if your tier has it.
5. TLS is on by default with `mongodb+srv://`. Leave it that way.

## 3. Cloudflare

1. Zero Trust → Networks → Tunnels → create a tunnel. Copy its token into `TUNNEL_TOKEN`.
   Public hostname: `app.example.com` → service `http://app:4000`.
2. SSL/TLS: **Always Use HTTPS** on, minimum TLS 1.2. (The app already sends HSTS.)
3. WAF custom rules:
   - **Block** `http.request.uri.path starts_with "/api/cron/"`. The `cron` container calls the app over the
     private Docker network, so nothing legitimate reaches these routes from the internet.
   - Optional: **Managed Challenge** on `/admin` and `/terminal` from outside your countries.
4. Rate-limiting rule on `/api/auth/*` (for example 20 req/min per IP). This sits in front of the app's own
   `RateBucket` limiter and does not replace it.
5. Turn on the Cloudflare Managed Ruleset and Bot Fight Mode. Do **not** cache `/api/*` (the default doesn't).
6. Optional: put `/admin*` and `/terminal` behind **Cloudflare Access** (SSO), on top of app auth.

**Client IP:** keep `TRUSTED_PROXY_HOPS=1`. Cloudflare appends the real client IP as the last
`X-Forwarded-For` entry, and `cloudflared` passes the header through unchanged. That is only trustworthy
because the tunnel is the sole way in. After deploying, check one log entry: its `ipAddress` should be
your public IP, not a Cloudflare one.

## 4. Secrets: `.env.production.local` (gitignored, `chmod 600`)

Start from `.env.local.example`, then add:

```
NODE_ENV=production
NEXTAUTH_URL=https://app.example.com
MONGODB_URI=mongodb+srv://app-user:...@cluster.mongodb.net/logs-system?retryWrites=true&w=majority
TUNNEL_TOKEN=...
# NEXTAUTH_SECRET, CRON_SECRET, KIOSK_SECRET, SESSION_QR_SECRET: each its own `openssl rand -base64 32`
# VAPID keys: npx web-push generate-vapid-keys
# SMTP_HOST / SMTP_USER / SMTP_PASS: all three, plus SPF/DKIM/DMARC on the EMAIL_FROM domain
```

The app refuses to start with a weak `NEXTAUTH_SECRET` (`instrumentation.ts`). The QR and cron endpoints
fail closed on weak secrets (`lib/secrets.ts`). `.dockerignore` keeps every `.env*` file out of the image.
Only `NEXTAUTH_URL` and the public VAPID key are build args.

## 5. Run

```bash
docker compose --env-file .env.production.local up -d --build
docker compose ps        # app should be "healthy"
```

Containers run as non-root with a read-only root filesystem, all capabilities dropped,
`no-new-privileges`, and memory/PID limits.

**Update:** `git pull && docker compose --env-file .env.production.local up -d --build`.
**Rollback:** tag images (`docker tag logs-system-app:latest logs-system-app:<sha>`) before each deploy.
To roll back, retag the previous one and run `up -d`.

## Not covered here

- Multiple app replicas: SSE stream caps and rate limits already live in MongoDB, so scaling works. Add a
  second tunnel replica (same token) for HA.
- Image scanning and signing: add `docker scout cves` / Trivy in CI when CI exists.
