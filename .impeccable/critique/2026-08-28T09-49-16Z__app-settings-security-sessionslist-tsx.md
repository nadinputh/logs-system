---
target: session management and validation, redirecting, and active sessions list
total_score: 38
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-28T09-49-16Z
slug: app-settings-security-sessionslist-tsx
---
⚠️ DEGRADED: single-context (subagent 429 at session rate limit; inline synthesis)

# Re-Critique — Session Management, Redirects, and Active Sessions List

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | `middleware.ts:44-51` appends `?reason=session_expired` when a cookie exists but the token has no `id`; `LoginForm.tsx` renders three distinct notices; SessionsList shows live lastSeenAt, IP, and "This device" chip. |
| 2 | Match System / Real World | 4 | Button relabeled from lying ("Sign out other devices") to honest ("End every session"). Copy names sessionsVersion + jti. |
| 3 | User Control & Freedom | 4 | Per-row Revoke via Dialog; Cancel on both destructive dialogs; API refuses to revoke the current session. |
| 4 | Consistency & Standards | 4 | Both dialogs use the same compound API as PasskeyManager; onPress unified in PasskeyManager (5/5 sites); FormNotice reused. |
| 5 | Error Prevention | 4 | No persistent armed state — confirmation inside the Dialog. Rate-limits: 30/min row-revoke, 5/min nuclear. |
| 6 | Recognition Rather Than Recall | 4 | Full inventory: browser + OS + IP + provider (passkey/password) + created + last-seen + device icon per row. |
| 7 | Flexibility & Efficiency | 3 | Per-row + bulk end-all + keyboard-nav via focus-trapped Dialog. No bulk-select-multiple. |
| 8 | Aesthetic & Minimalist | 3 | Deliberate mechanism-naming copy is verbose — three paragraphs across page intro, card header, and nuclear block. Trade acceptable given "grow the voice." |
| 9 | Error Recovery | 4 | Dialog dismiss preserves state; nuclear success redirects to `/login?reason=signed_out_others` where FormNotice closes the loop. |
| 10 | Help & Documentation | 4 | Every mechanism named in copy — sessionsVersion, jti, "usually within a minute", "14-day sign-in". Best-in-class for the project. |
| **Total** | | **38/40** | **Excellent** — delta +20 from prior 18/40. |

## Design Specificity Verdict

**LLM assessment.** The surface is unmistakably Kamnotheat. `security/page.tsx:32-34` says "The ledger that Kamnotheat keeps for every check-in — IP, device, when — now runs for your own sessions too" — the philosophical inversion the prior critique flagged is closed and named in copy. `SessionsList.tsx:157-160` describes the nuclear as "bumps sessionsVersion and drops every inventory row" and `page.tsx:74-77` frames the two revocation gates. No generic template would carry this vocabulary. The prior single honest sentence has been relocated and multiplied, not lost.

**Deterministic scan.** `detect.mjs` returned `[]` (exit 0) on the six changed TSX targets after the polish pass. The five `text-[11px]` advisories I introduced were normalized to `text-xs` (on-ramp) before final.

**Structural evidence.**
- `SessionsList.tsx`: 322 lines · 5 buttons · 1 aria-label (icon-only Revoke) · 1 aria-live region · 2 Dialogs.
- `security/page.tsx`: 84 lines · 0 raw hex · 0 hardcoded gray-* · semantic bg-accent/10, var(--status-warning).
- `middleware.ts`: 91 lines · hand-rolled getToken() gate (dropped withAuth) · cookie-vs-no-cookie distinction at L47-51.
- `PasskeyManager.tsx`: 203 lines · 5 buttons · onPress on all 5 (was 0/5, mixed with onClick).

**Redirect signal audit.** middleware.ts:51 sets reason='session_expired'. LoginForm.tsx:14-42 maps all three codes to FormNotice copy. SessionsList.tsx:114 uses signOut({ callbackUrl: '/login?reason=signed_out_others' }). Live smoke test confirms all three notices render.

**Rate-limit audit.** signout-others: 5/60_000. sessions/[id]/revoke: 30/60_000. Both via clientKey(req, scope).

**Test suite.** npm test — 12 files, 124 tests passed, 972ms.
**Type-check.** Zero new errors from these changes.
**App boot.** next dev Ready in 1593ms. /login 200, /dashboard unauth → 307 → /login?next=/dashboard, /settings/security unauth → 307 → /login?next=/settings/security.

## Overall Impression

Every P0 and P1 from the prior report is closed. The "vault that couldn't enumerate its own sessions" now enumerates them with the same IP/UA metadata the Log model records for visitor punts; the blank-form redirect carries three distinct explanations; the persistent-armed landmine is gone; the receipt survives the redirect. The single meaningful trade is verbose copy on /settings/security — deliberate given "grow the honest voice," will need trimming if the surface grows more sections.

## What's Working

1. **Two-gate revocation model named in copy.** page.tsx:74-77 teaches the reader that sessions die from either sessionsVersion OR jti.
2. **?reason= channel with three distinct tones.** Every redirect teaches something.
3. **Dialog symmetry with PasskeyManager.** Same interaction across both destructive settings.
4. **Rate-limited destructive endpoints.** A compromised cookie can't walk the inventory in a loop.

## Priority Issues (Residual)

### [P2] lastSeenAt throttled to 5-min intervals but UI shows exact "3m ago"
- **What.** lib/auth.ts:120 sets JTI_TOUCH_MIN_INTERVAL_MS = 5 * 60_000; a timestamp shown as "3m ago" could be 8m ago.
- **Why it matters.** The surface's brand is honest-mechanism copy; a per-row timestamp overstating freshness undercuts the voice.
- **Fix.** Name the throttle in copy ("Last seen ≈3m ago") or drop the throttle to 60s.
- **Command:** /impeccable clarify

### [P3] Current-row "Sign out from the menu" hint is subtle
- **What.** SessionsList.tsx:317 renders that string in text-xs text-muted where other rows show a Revoke button.
- **Why.** First-timers might miss the difference between "no action" and "action lives elsewhere."
- **Fix.** Link the hint to the account menu, or add a mini "Sign out this device" button that calls signOut() without the nuclear.
- **Command:** /impeccable clarify

## Persona Red Flags — resolved
- **Alex.** Has per-row revoke. Only friction: no bulk-select. Not a red flag.
- **Jordan.** "This device" chip disambiguates; icons distinguish phones/desktops; plain language.
- **Sam.** aria-live region mounted before content; Dialog focus-trapped; Revoke has aria-label.
- **Riley.** Rate-limits gate mutations; race on double-revoke → 404; malformed IP → "unknown"; UA truncated to 512 chars.

## Regression Notes
- The single honest paragraph from passkeys/page.tsx:107-111 was relocated and expanded, not lost.
- Middleware dropped withAuth for hand-rolled getToken. Team-context redirect preserved verbatim.
- bumpSessionsVersion now also deletes SessionInventory rows. No external callers rely on rows staying.

## Minor Observations
- passkeys page section headers bumped text-sm → text-base per prior recommendation.
- signout-others still returns { ok, sessionsVersion }; client doesn't read it, but the field is cheap.
- SessionInventory indexed { userId: 1, createdAt: -1 } + unique jti + userId.
- Mobile menu now surfaces Security alongside Passkeys.
- 14-day maxAge honestly named in the session_expired copy.
