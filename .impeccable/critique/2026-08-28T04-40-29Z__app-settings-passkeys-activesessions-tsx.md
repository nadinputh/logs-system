---
target: session management and validation, redirecting, and active sessions list
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-28T04-40-29Z
slug: app-settings-passkeys-activesessions-tsx
---
**Method:** dual-agent (A: session-UX design review · B: detector + structural evidence)

# Critique — Session Management, Redirects, and Active Sessions List

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Card promises "Active sessions"; body shows none. Middleware bounces expired sessions to `/login` with only `?callbackUrl=`; no `?reason=` channel to tell the user *why* they landed there. |
| 2 | Match System / Real World | 2 | "Sign out **other** devices" (`ActiveSessions.tsx:67`) also signs the caller out — because JWT-strategy revocation has no other way. Banner reconciles this in warning copy, but the button label still lies at first glance. |
| 3 | User Control & Freedom | 1 | Nuclear only. No per-device revoke, no undo, no way to name a suspicious session and end just it. |
| 4 | Consistency & Standards | 3 | `assertSameOrigin` uniformly wired (`signout-others/route.ts:20-22`); adapters and card composition mirror the passkeys card. |
| 5 | Error Prevention | 2 | Two-click arm-then-confirm exists, but armed state (`ActiveSessions.tsx:24-27`) never times out and has no Cancel — walk away, come back, one click nukes everything. `PasskeyManager` uses a modal for a *less* destructive action; inconsistent posture. |
| 6 | Recognition Rather Than Recall | 0 | User must recall every device they've ever signed in on. Zero recognition surface. Grep for `userAgent`/`ipAddress`/`lastActive`/`createdAt` in `ActiveSessions.tsx` returns 0 hits. |
| 7 | Flexibility & Efficiency | 2 | One control, one path. No bulk select, no per-session action. |
| 8 | Aesthetic & Minimalist | 3 | Card is quiet; warning-tinted icon reads as caution without shouting. |
| 9 | Error Recovery | 1 | On failure `catch` resets `busy` but leaves `confirmed=true` — user is one accidental click from re-firing. On success the toast fires immediately before `signOut()` navigates — receipt is destroyed by the redirect. |
| 10 | Help & Documentation | 3 | Preamble at `page.tsx:107-111` and helper at `ActiveSessions.tsx:43-47` name the actual mechanism honestly. Best-in-class for this project. |
| **Total** | | **18/40** | **Poor** — major UX overhaul needed before this surface earns the "cryptographic certainty" tag on the box. |

## Design Specificity Verdict

**LLM assessment.** This surface could drop into any generic NextAuth starter unchanged. Kamnotheat's differentiators — the `sessionsVersion` revocation channel (`lib/auth.ts:57-70`), the 60s propagation window (`lib/auth.ts:21`), the 14-day JWT ceiling (`lib/auth.ts:82`), passkeys as identity — are all invisible to the operator. A vault whose own `Log` model records `ip_address`, `user_agent`, `device_id`, and `geofence_status` for every visitor punt cannot even tell its own user *how many* devices they are signed into. The one authored touch is the honest mechanism copy at `page.tsx:107-111` — the only reason this reads as more than a template.

**Deterministic scan.** `detect.mjs` on the five TSX targets returned `[]` (exit 0, 0 findings). No hex colors, no hardcoded `gray-*` classes, no adapter violations. The mechanical floor is clean; every failure below is a design failure, not a lint failure.

**Structural evidence.**
- `ActiveSessions.tsx`: 71 lines · 1 button · 0 `aria-*` · 0 session-metadata fields · 0 hits for `current`/`isCurrent`.
- `middleware.ts` + `lib/auth.ts` + `app/login/`: 0 hits for `reason=` / `expired` / `invalid_session` in redirect handling.
- A prior critique (`.impeccable/critique/2026-08-27T14-21-12Z__lib-auth-ts.md`) already recommended `?reason=` codes; none of that recommendation has landed. Repeat finding.

**Visual overlays.** Skipped — no dev server was running; starting one solely for visualization would exceed the batched-pass ceiling.

## Overall Impression

The revocation *plumbing* is thoughtful — `sessionsVersion`, the 60s cache, CSRF discipline, honest "JWTs are not password-scoped" copy are all genuine security craft. But at the surface, the plumbing has been squeezed through a single red button that promises an inventory and delivers a hammer, and the redirect that catches the fallout is a blank login form. The biggest opportunity is not building more mechanism — it is *teaching the mechanism the user already has*. A session inventory + a `?reason=` channel on the login redirect would raise this from 18 to comfortably above 30 without touching a single security invariant.

## What's Working

1. **Honest mechanism copy** (`page.tsx:107-111`, `ActiveSessions.tsx:43-47`). Extend the pattern.
2. **Two-click arm-then-confirm** (`ActiveSessions.tsx:24-27`) avoids a one-click nuke. Correct instinct, wrong execution.
3. **CSRF and rate-hardening discipline** — `assertSameOrigin` uniformly wired; endpoint shape defensible without UX overhead.

## Priority Issues

### [P0] Expired-session redirect lands on a blank login form
- **What.** When `readSessionVersionCached` bumps and the `jwt` callback drops the token (`lib/auth.ts:206-211`), `middleware.ts` `withAuth` redirects to `/login` with only `?callbackUrl=`. `LoginForm.tsx:17` reads only `next`. Zero hits for any reason code across the three files.
- **Why it matters.** Both the stranger (stolen phone) and the legitimate user (whose own session got nuked when they pressed the button) hit this redirect. Both deserve a message; both currently get silence.
- **Fix.** Append `?reason=session_revoked | session_expired` in `middleware.ts` when the token is absent on a protected route. Teach `LoginForm.tsx` to read `reason` and render `FormNotice`. Reuse the `TeamAccessRedirectReason` enum pattern from `lib/server/requireTeamPageAccess.ts:12`.
- **Suggested command:** `/impeccable harden`

### [P0] "Active sessions" card shows zero sessions
- **What.** `page.tsx:106` promises an inventory. `ActiveSessions.tsx:41-70` renders one button and no list. Zero hits for `userAgent`/`ipAddress`/`lastActive`/`createdAt`.
- **Why it matters.** Kamnotheat's brand is a cryptographic-certainty vault; a "sessions" card that cannot enumerate sessions signals the vault doesn't know what's inside. The `Log` model captures IP + UA + device_id per visitor punt — auditing visitors more strictly than users is a philosophical inversion.
- **Fix.** (a) Rename card to "Sign out everywhere" and drop the plural — cheap and honest, ships today. (b) Persist JWT metadata on issuance in a `SessionInventory` store, list `{ createdAt, lastSeenAt, ipAddress, userAgent, current }`, mark current row, offer per-row Revoke. (b) is the durable answer.
- **Suggested command:** `/impeccable shape`

### [P1] Armed confirm state has no Cancel and no timeout
- **What.** `confirmed=true` at `ActiveSessions.tsx:24-27` never expires, has no Cancel, survives interruption. Distracted user returns, taps once, nukes everything with no second warning.
- **Why it matters.** For a destructive irreversible action, confirmation must be present at commitment. Persistent armed state is a landmine. `PasskeyManager.tsx:122-152` uses a modal for the *less* destructive per-passkey delete — inversion.
- **Fix.** Convert to `<Dialog>` matching PasskeyManager's pattern; or keep inline but add a Cancel and auto-reset `confirmed` after 10s.
- **Suggested command:** `/impeccable harden`

### [P1] Post-action receipt is destroyed by the redirect
- **What.** `ActiveSessions.tsx:32-34` fires toast then immediately `signOut({ callbackUrl: '/login' })`. Toast lives on a page that unmounts a beat later; `/login` shows nothing.
- **Why it matters.** The moment the user most needs confirmation is the moment we destroy it. A user who did this in fear ("my phone was stolen") never gets closure.
- **Fix.** `signOut({ callbackUrl: '/login?reason=signed_out_others' })`. Have `LoginForm` render a success-tone `FormNotice`. Closes half of [P0#1] in the same change.
- **Suggested command:** `/impeccable clarify`

### [P1] Session revocation lives under `/settings/passkeys`
- **What.** Users who never registered a passkey have no reason to visit `/settings/passkeys` — yet the only session-revocation control is buried there. Prior R2 critique flagged the same.
- **Why it matters.** Users search for "Security", "Sessions", "Devices" — none exist in the nav.
- **Fix.** Create `/settings/security`; move the ActiveSessions card there. Optionally mirror on `/settings/passkeys` for power users.
- **Suggested command:** `/impeccable shape`

### [P2] Silent about the 60-second propagation window
- **What.** `lib/auth.ts:21` sets `SV_CACHE_TTL_MS = 60_000`; a stale token may still be accepted for up to a minute. Copy says "every other browser and phone will land on the login page too on its next request" — nearly true.
- **Why it matters.** The vault's honesty-in-copy is its brand differentiator. A one-minute lie is a lie.
- **Fix.** Amend to "…on its next request — usually within a minute of you pressing this button."
- **Suggested command:** `/impeccable clarify`

## Persona Red Flags

- **Alex (power user).** No per-device revoke — must nuke and re-sign-in on phone and iPad to kill one sketchy laptop session. Trains him not to use the button for small correct reasons.
- **Jordan (first-timer).** "Active sessions" card promises inventory, delivers one button. Concludes the app is half-built and stops looking for security controls.
- **Sam (accessibility).** Warning `FormNotice` at `ActiveSessions.tsx:49-56` is not in an `aria-live` region — 0 `aria-*` attrs in the file. `LoginForm.tsx:188-225` does wrap notices in `aria-live="polite"`. Most safety-critical state change in the app is silent for screen readers.

## Minor Observations

- `ActiveSessions.tsx:66` — icon is `LogOut`; operation is *log-out-from-everywhere*. Consider `ShieldOff` or `Users` + `X` slash.
- `signout-others/route.ts:32` returns `{ ok, sessionsVersion }`; client doesn't read the payload. Use it as an audit receipt or drop.
- `signout-others/route.ts` — endpoint unbounded; add `rateLimit` from `lib/rateLimit.ts`.
- `PasskeyManager.tsx` uses `onClick=` on 5 button sites (L83, L114, L137, L145, L198); `ActiveSessions.tsx` uses `onPress=`. Adapters accept both, but the split is inconsistent.
- `page.tsx:86,106` section headings are `text-sm`, subordinate to their body copy. Consider `text-base` for Operate-mode scanability.

## Questions to Consider

1. If Kamnotheat's product promise is a ledger with cryptographic certainty for every check-in, why does the same product not maintain a ledger of its own sessions?
2. Why is the "nuclear" the *only* option? Per-session revocation on JWT strategy is a ~30-line change (a `revoked_jti` set on the User doc). What is the current UI training doing to the platform's actual security posture?
3. What's the smallest change that would turn `/settings/passkeys` into a *security posture dashboard*? One API call — "3 sessions · 2 passkeys · last sign-in from Bangkok, 4h ago" — turns a control page into a truth surface.
