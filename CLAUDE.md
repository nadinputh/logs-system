# CLAUDE.md — Check-In/Out Logging Engine

## Project Overview

An enterprise-grade, high-throughput, and immutable Check-In/Out logging system. The engine balances zero-friction user experiences (Passkeys, QR, BLE) with strict cryptographic security, compliance tracking, and automated edge-case resolution.

**Stack:** Next.js 14 (App Router, TypeScript) · MongoDB (Mongoose v9) · NextAuth v4 · shadcn v4 (@base-ui/react) · Tailwind v3 · Vercel + MongoDB Atlas

---

## Implementation Status

### ✅ Fully Implemented

| Feature                                                                      | Location                                                                                  |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Building / Floor / Room CRUD (admin)                                         | `app/admin/buildings\|floors\|rooms/`                                                     |
| Static QR code generation + print page                                       | `lib/qr.ts`, `app/admin/qr/[id]/`                                                         |
| Check-in/out flow: visitor identity, open-log detection, selfie (Cloudinary) | `components/location/CheckInOut.tsx`                                                      |
| In-app QR scanner (html5-qrcode, iOS-safe)                                   | `components/scanner/QRScanner.tsx`                                                        |
| Dashboard stats (today/live/total)                                           | `app/dashboard/`                                                                          |
| Logs pages (staff own, admin all)                                            | `app/logs/`, `app/admin/logs/`                                                            |
| Quest cards: location_chain + custom, bulk issuance, per-card QR             | `app/admin/quests/`, `app/quest/[token]/`                                                 |
| Quest progress API with ordered step validation                              | `app/api/quests/[token]/progress/`                                                        |
| NextAuth v4 credentials + role-based middleware guard                        | `lib/auth.ts`, `middleware.ts`                                                            |
| Nightly stale-log cron (12h, append-only, autoCheckedOut flag)               | `app/api/cron/cleanup-stale-logs/`                                                        |
| Enterprise log fields: deviceId, ipAddress, userAgent, geofenceStatus        | `lib/models/Log.ts`, `app/api/logs/`                                                      |
| Append-only checkout (OUT document with relatedLogId)                        | `app/api/logs/[id]/route.ts`                                                              |
| Predictive 4:30pm checkout hint + duration display                           | `lib/predictive.ts`, `components/location/CheckInOut.tsx`                                 |
| Idempotency engine (SHA-256 key + MongoDB TTL)                               | `lib/idempotency.ts`, `lib/models/IdempotencyKey.ts`                                      |
| Immutable audit ledger (admin corrections)                                   | `lib/models/AuditLog.ts`, `app/api/logs/[id]/correction/`                                 |
| Dynamic QR kiosk loop (15s JWT, HS256, auto-refresh)                         | `lib/jwt.ts`, `app/kiosk/[locationId]/`, `app/api/kiosk/token/`                           |
| Reverse QR scanner loop (30s personal JWT, terminal scan)                    | `app/profile/`, `app/terminal/`, `app/api/terminal/scan/`, `app/api/users/session-qr/`    |
| WebAuthn / FIDO2 passkeys + NextAuth bridge                                  | `lib/models/PasskeyCredential.ts`, `app/api/auth/passkey/`, `app/settings/passkeys/`      |
| PWA push notifications (VAPID, service worker)                               | `lib/models/PushSubscription.ts`, `app/api/push/`, `public/sw.js`, `public/manifest.json` |

---

## Architecture & Anti-Spoofing Requirements

### 1. Contextual Metadata Capture

Every log entry must capture and store the complete request context in a single transaction:

- `device_id` — unique hardware or persistent browser instance token (UUID stored in `localStorage`, sent in request body)
- `ip_address` — extracted server-side from `x-forwarded-for` or `req.socket.remoteAddress`
- `user_agent` — extracted from `request.headers.get('user-agent')`
- `geofence_status` — Boolean: did the client's reported coordinates fall within the verified polygon bounds at execution time? Client sends raw coordinates; server validates against stored geofence polygon.

**Implementation note:** `device_id` is a persistent UUID the browser generates on first visit and stores in `localStorage` alongside `sessionToken`. It must be sent in every `POST /api/logs` request body.

### 2. Data Integrity & Network Controls

**Server-Authoritative Time:**

- Reject client-side timestamp generation entirely. `timestamp` on every log is set by `new Date()` on the server.
- For offline sync (future): compute and validate client-to-server NTP drift. If drift exceeds 5 minutes, reject the request with `400 CLOCK_DRIFT`.

**Idempotency Engine:**

- All write operations must pass a deterministic idempotency key: `sha256(sessionToken + locationId + toISODate(serverDate) + action_type)`.
- The key is generated client-side and sent in the `Idempotency-Key` request header.
- Server stores seen keys in a MongoDB `IdempotencyKey` collection with a TTL index of 24 hours.
- If the key already exists, return the original response (HTTP 200) without writing again.

### 3. "Forgot to Check Out" Auto-Resolution

- Scheduled cron runs nightly (configurable, default: every hour in production).
- Logs where `checkoutAt` is absent and `timestamp` is older than **12 hours** (not 24) must be resolved.
- Resolution writes a new correction entry (see Audit Ledger) and sets `auto_checked_out = true` on the log.
- After resolution, broadcast an event to the notification pipeline (initially: log to console + future webhook).

### 4. Immutable Audit Ledger

- The `Log` collection is **append-only**. No direct mutations (`$set`, `.save()`, `findByIdAndUpdate`) are permitted on existing log documents.
- **Check-out** is recorded as a **new Log document** with `action: 'out'` and `relatedLogId` pointing to the original check-in log.
- **Corrections** (admin overrides) write to a separate `AuditLog` collection containing:
  - `logId` (ref to the original Log)
  - `modified_by_user_id`
  - `field` (which field was corrected)
  - `original_value`
  - `new_value`
  - `reason_for_change`
  - `timestamp`

---

## Fast-Path UX & Interaction Mechanisms

### 5. Dynamic QR Validation (Kiosk Loop)

- **Flow:** A central kiosk display (`/kiosk/[locationId]`) generates a dynamic QR that refreshes every 10–15 seconds.
- **Token:** Each QR encodes a JWT payload: `{ locationId, exp: now + 15s, iat: now }`, signed with `KIOSK_SECRET` using HS256.
- **Verification:** When a user scans the dynamic QR, the backend:
  1. Verifies the JWT signature using `KIOSK_SECRET`.
  2. Checks that `exp` has not passed.
  3. Proceeds with normal check-in flow.
- **Env var required:** `KIOSK_SECRET` (32-char random secret).
- **Routes:**
  - `GET /api/kiosk/token?locationId=X` — issues a short-lived signed token (server-side refresh)
  - `/kiosk/[locationId]` — full-screen display page that polls for a new token every 12s

### 6. Reverse QR Validation (Scanner Loop)

- **Flow:** An authenticated user requests a personal session QR from the app. A fixed terminal scans it.
- **Token:** JWT payload: `{ userId or sessionToken, exp: now + 30s }`, signed with `SESSION_QR_SECRET`.
- **Verification:** Terminal POSTs the scanned token to `POST /api/terminal/scan`, which decodes it and triggers a check-in for the identified user.
- **Routes:**
  - `GET /api/users/session-qr` — generates a 30s ephemeral QR token for the authenticated user
  - `/profile` — shows the user's personal QR (refreshes every 25s)
  - `/terminal` — fixed terminal scanner page (admin-locked, uses in-app scanner)
  - `POST /api/terminal/scan` — receives scanned token, triggers check-in

### 7. Passive Proximity Tracking (BLE Beacons)

> **Note:** Full BLE requires a native app wrapper (Capacitor/React Native). The web layer provides the API surface.

- **Flow:** A background process detects entry into a BLE beacon's range and triggers a check-in prompt.
- **Web Push:** The app must be a PWA with Web Push API (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`).
- **Lock-screen notification:** On beacon entry, send a push notification with action buttons: "Check In" / "Dismiss".
- **Routes:**
  - `POST /api/push/subscribe` — stores push subscription for a user
  - `POST /api/push/send` — internal: triggers notification to a specific user

### 8. Predictive State Logic

- After detecting an open check-in, the UI must evaluate:
  1. **Time-of-day rule:** If current time is past 16:30 (4:30 PM), default the primary CTA to "Check Out" with a "Suggested" badge.
  2. **Historical pattern (future):** Fetch last 7 days of logs; if the user typically checks out between 16:00–17:30, show the same suggestion before that window.
- Implementation: Add `getPredictedAction(openLog, currentTime)` utility in `lib/predictive.ts`.

---

## Passkey (WebAuthn / FIDO2) Specification

Every check-in/out event must support cryptographic validation via the device's native Secure Enclave or TPM.

### Database Schema

```typescript
// lib/models/PasskeyCredential.ts
{
  userId:           ObjectId,       // ref: User
  credentialId:     string,         // base64url-encoded credential ID
  publicKey:        string,         // COSE-encoded public key (base64url)
  counter:          number,         // replay-attack prevention
  deviceType:       string,         // 'singleDevice' | 'multiDevice'
  backedUp:         boolean,
  transports:       string[],       // ['internal', 'hybrid', ...]
  createdAt:        Date,
  lastUsedAt:       Date,
}
```

### Implementation Notes

- Use `@simplewebauthn/server` (Node) and `@simplewebauthn/browser` (client).
- Registration: `POST /api/auth/passkey/register/options` → `POST /api/auth/passkey/register/verify`
- Authentication: `POST /api/auth/passkey/authenticate/options` → `POST /api/auth/passkey/authenticate/verify`
- Passkey auth replaces the `POST /api/logs` password check but co-exists with credential auth for backwards compatibility.
- Every passkey-verified check-in must set `passkeyVerified: true` on the Log document.

---

## Implementation Roadmap

### Sprint 1 — Enterprise Field Fixes (Current Sprint, affects existing code)

**Changes to existing files:**

1. `lib/models/Log.ts` — add fields: `ip_address`, `user_agent`, `device_id`, `geofence_status`, `auto_checked_out`, `relatedLogId`, `passkeyVerified`
2. `app/api/logs/route.ts` — extract IP + user-agent from request headers; accept `deviceId` + `geofenceStatus` in body; change checkout to append-only (create new `action: 'out'` document instead of mutating)
3. `app/api/logs/[id]/route.ts` — convert PATCH to write a new log document, not mutate the existing one
4. `app/api/cron/cleanup-stale-logs/route.ts` — change 24h → 12h, add `auto_checked_out: true`
5. `components/location/CheckInOut.tsx` — add `deviceId` from localStorage, send with check-in; add predictive 4:30pm hint
6. `lib/validations/log.ts` — add `deviceId`, `geofenceStatus`, `idempotencyKey` to `CreateLogSchema`

**New files:**

- `lib/predictive.ts` — `getPredictedAction(openLog, now)` utility

### Sprint 2 — Idempotency + Audit Ledger (new collections)

**New files:**

- `lib/models/IdempotencyKey.ts` — `{ key, response, createdAt }` with TTL index 24h
- `lib/models/AuditLog.ts` — correction ledger schema
- `app/api/logs/[id]/correction/route.ts` — admin endpoint to correct a log entry
- `lib/idempotency.ts` — `checkIdempotency(key)` / `saveIdempotency(key, response)` helpers

**Changes to existing files:**

- `app/api/logs/route.ts` — add idempotency key check before write

### Sprint 3 — Dynamic QR + Reverse QR

**New env vars:** `KIOSK_SECRET`, `SESSION_QR_SECRET`

**New files:**

- `app/kiosk/[locationId]/page.tsx` — full-screen auto-refreshing QR display
- `app/terminal/page.tsx` — terminal scanner page
- `app/profile/page.tsx` — authenticated user personal QR
- `app/api/kiosk/token/route.ts`
- `app/api/users/session-qr/route.ts`
- `app/api/terminal/scan/route.ts`

**Changes to existing files:**

- `app/scan/[locationId]/page.tsx` — handle `?token=` signed JWT param for dynamic QR path

### Sprint 4 — WebAuthn / FIDO2 Passkeys

**New deps:** `@simplewebauthn/server`, `@simplewebauthn/browser`

**New files:**

- `lib/models/PasskeyCredential.ts`
- `app/api/auth/passkey/register/options/route.ts`
- `app/api/auth/passkey/register/verify/route.ts`
- `app/api/auth/passkey/authenticate/options/route.ts`
- `app/api/auth/passkey/authenticate/verify/route.ts`
- `app/settings/passkeys/page.tsx` — manage passkeys for authenticated user

**Changes to existing files:**

- `lib/models/User.ts` — add `passkeys: PasskeyCredential[]` virtual
- `lib/auth.ts` — add passkey as an alternative auth method alongside credentials
- `lib/models/Log.ts` — add `passkeyVerified: boolean` field

### Sprint 5 — BLE + PWA Push Notifications

**New deps:** `web-push`

**New env vars:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

**New files:**

- `lib/models/PushSubscription.ts`
- `app/api/push/subscribe/route.ts`
- `app/api/push/send/route.ts` (internal)
- `public/sw.js` — service worker for background push
- `public/manifest.json` — PWA manifest

**Note:** Full BLE beacon detection requires Capacitor or React Native wrapper.

---

## Known Quirks & Rules

### shadcn v4 / @base-ui/react patterns

- **No `asChild` prop** — use `<Button render={<Link href="..." />}>` or `<Link className={cn(buttonVariants(...))}>` directly
- **Select `onValueChange`** returns `string | null` — always coerce: `v => setState(v ?? '')`
- `DialogTrigger` wraps children via `render` prop: `<DialogTrigger render={<Button />}>Label</DialogTrigger>`

### Tailwind v3 (not v4)

- Do not use `@import "shadcn/tailwind.css"` or `@import "tw-animate-css"` — these are Tailwind v4 syntax
- All CSS token classes (`border-border`, `bg-background`, etc.) must be registered in `tailwind.config.ts` under `theme.extend.colors`
- Use standard `@tailwind base; @tailwind components; @tailwind utilities;` directives

### Mongoose v9 / Next.js App Router

- Every route handler that imports Mongoose **must** export `export const runtime = 'nodejs'`
- Use the singleton pattern in `lib/db.ts` with `global._mongoose` to prevent hot-reload connection leaks
- `html5-qrcode` must be a dynamic import with `ssr: false`; initialize only inside a user gesture (button click) for iOS Safari

### Seed

```bash
cp .env.local.example .env.local   # fill in MONGODB_URI, NEXTAUTH_SECRET
npm run seed                        # creates admin@example.com / admin123
npm run dev
```

### Environment Variables

| Variable                               | Used by                | Required |
| -------------------------------------- | ---------------------- | -------- |
| `MONGODB_URI`                          | All API routes         | ✅       |
| `NEXTAUTH_SECRET`                      | NextAuth               | ✅       |
| `NEXTAUTH_URL`                         | NextAuth, QR URLs      | ✅       |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`    | Selfie upload (client) | Optional |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Selfie upload (client) | Optional |
| `CRON_SECRET`                          | `/api/cron/*` guard    | ✅       |
| `KIOSK_SECRET`                         | Dynamic QR signing     | Sprint 3 |
| `SESSION_QR_SECRET`                    | Reverse QR signing     | Sprint 3 |
| `VAPID_PUBLIC_KEY`                     | Web Push               | Sprint 5 |
| `VAPID_PRIVATE_KEY`                    | Web Push               | Sprint 5 |
| `VAPID_SUBJECT`                        | Web Push               | Sprint 5 |

"""
