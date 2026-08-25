# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary — Security / facilities administrator.** Owns and operates the estate inside the console: models buildings, floors, and rooms; generates and prints QR; manages teams and invites; audits every check-in/out log across the organization. Lives in the admin surfaces daily and is the user future design serves first when priorities conflict.

**Secondary — Staff member.** Authenticated user who checks in/out often, sees their own logs, and manages their own passkeys. Wants zero friction and speed.

**Tertiary — One-time visitor.** Scans a room QR, a dynamic kiosk QR, or presents a personal QR to a fixed terminal. Never logs into the console. Needs the check-in flow to be obvious and trustworthy.

## Product Purpose

Kamnotheat is an enterprise-grade check-in/out logging engine: a high-throughput, immutable record of who was where and when. It exists to give an organization a compliance-grade, tamper-evident presence trail while keeping the act of checking in effortless. Success is a complete, trustworthy audit ledger produced with near-zero friction at the point of entry — no missed check-outs, no spoofable entries, no manual reconciliation.

## Positioning

The meaningfully different thing is the **pairing itself: frictionless entry AND cryptographic certainty, equally weighted.** Individually, neither is unique — competitors offer fast QR check-in, and others offer audit logs. Kamnotheat's position is that the same event is both zero-friction (passkeys, dynamic/reverse QR, kiosk, BLE) and cryptographically certain (append-only immutable log, SHA-256 idempotency keys, separate correction ledger, server-authoritative time, anti-spoofing metadata). This is the framing the current hero already commits to ("Zero-friction check-ins. Cryptographic certainty.") and should be preserved.

## Operating Context

Deployed as an **internal tool for a single organization's own use** — not sold or marketed to outside customers. The console/admin experience is effectively the whole product; the public landing page is a front door that routes staff to the console and visitors to the scan flow.

Usage scenes:
- **Console (admin):** desktop-first management of buildings/floors/rooms, QR generation and print pages, dashboard stats (today / live-on-site / all-time), organization-wide log audit, team ownership, invites, and admin user management.
- **Point of entry:** in-app iOS-safe QR scanner, static room QR, dynamic kiosk QR loop (15s rotating JWT), reverse QR terminal (personal 30s QR scanned by a fixed terminal), and passkey-verified check-in.
- **Identity moments:** email-verified registration, invite-based onboarding, set-password links for admin-created accounts, and optional Cloudinary selfie capture at check-in.

## Capabilities and Constraints

Confirmed functionality (see CLAUDE.md for the authoritative implementation map): location hierarchy CRUD; static, dynamic, and reverse QR; iOS-safe in-app scanner; append-only check-in/out with `relatedLogId`; immutable `Log` collection with separate `AuditLog` correction ledger; SHA-256 idempotency engine with 24h TTL; nightly stale-log auto-checkout at 12h; enterprise anti-spoofing fields (`device_id`, `ip_address`, `user_agent`, `geofence_status`); server-authoritative timestamps; WebAuthn/FIDO2 passkeys; PWA web push; quest cards; role-based access (`admin`, `staff`); team ownership; email verification, invites, and set-password onboarding.

Constraints and terminology:
- Roles are exactly `admin` and `staff`.
- Logs are append-only — check-out is a new `action: 'out'` document, corrections write to `AuditLog`; never mutate an existing log.
- Time is server-authoritative; client-supplied timestamps are rejected.
- Full BLE beacon detection requires a native wrapper; the web layer only provides the API surface and push notifications.
- HeroUI v3 + Tailwind v4 conventions and the Mongoose v9 / App Router quirks in CLAUDE.md are binding technical constraints.

## Brand Commitments

- **Name:** Kamnotheat (confirmed in code — `components/Logo.tsx`, landing, footer).
- **Logo mark:** a security shield with a verification check (`LogoMark` / `LogoTile`), rendered on a sky→cyan→teal gradient tile.
- **Voice (current, incumbent):** confident, technical, enterprise-grade; leans on precise mechanism language ("append-only", "idempotency", "cryptographic certainty") rather than soft marketing.
- **Hero commitment:** "Zero-friction check-ins. Cryptographic certainty." — the dual promise that encodes the positioning above.

## Evidence on Hand

- Real, working product implementation across all five CLAUDE.md sprints (auth, idempotency, audit ledger, dynamic/reverse QR, passkeys, push).
- Landing-page stat strip uses **real technical facts** (12h auto-checkout window, 15s kiosk rotation, 256-bit idempotency keys, 100% append-only) — not fabricated customer metrics.
- **No real customers, testimonials, logos, deployment references, or usage/scale numbers exist.** As an internal tool, future work must not fabricate external social proof, customer names, or adoption claims.
- Seed account for development: `admin@example.com` / `admin123` (`scripts/seed.ts`).

## Product Principles

1. **The ledger is sacred.** Every design decision must respect append-only immutability — surface corrections through the audit trail, never as silent edits.
2. **Friction is the enemy at the edge; certainty is the point at the record.** Optimize the point of entry for speed and obviousness; optimize the console for trust, auditability, and completeness.
3. **Admin-first.** When priorities conflict, serve the facilities/security administrator managing the whole estate.
4. **Never fabricate proof.** This is an internal tool with no external customers; do not invent testimonials, logos, or adoption metrics.
5. **The mechanism is the message.** The differentiator is the pairing of frictionless capture and cryptographic certainty — keep both visible, never trade one away for the other.
