---
target: login + forgot-password + registration workflow
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-27T14-20-05Z
slug: app-login-loginform-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + runtime evidence, isolated)

# Critique: Auth workflow — login + forgot-password + registration (run 2)

**Target:** register + login flows + new forgot-password flow + all token pages + `lib/auth.ts` + `lib/rateLimit.ts` + `lib/csrf.ts`

## Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | `checking` states are text-only — slow network looks stalled. |
| 2 | Match System / Real World | 3 | Forgot-password done subhead exposes the security invariant literally — reads like a spec footnote. |
| 3 | User Control and Freedom | 3 | Forgot-password flow closes the P0 gap. Verify error page still has no self-serve recovery. |
| 4 | Consistency and Standards | 2 | onClick/onPress drift on Button across four new/edited files; "Back to sign in" arrow-vs-plain inconsistent. |
| 5 | Error Prevention | 3 | Pre-validation on reset-password. Password/confirm mismatch only caught client-side after submit. |
| 6 | Recognition Rather Than Recall | 3 | Verify success never names which address was verified. |
| 7 | Flexibility and Efficiency | 3 | Passkey button still gated on typed email. |
| 8 | Aesthetic and Minimalist | 3 | Reset-password subhead is two long sentences; forgot-password entry subhead repeats what body copy says. |
| 9 | Error Recovery | 3 | TOO_MANY_ATTEMPTS renders alongside PASSWORD_NOT_SET / EMAIL_NOT_VERIFIED cleanly. Invite-invalid page has no next step. |
| 10 | Help and Documentation | 2 | Inline hints only; nothing explains what a passkey is or why "we answer the same way for every address". |
| **Total** | | **28/40** | Fair (up from 23) |

## Priority Issues Remaining

### [P1] Button interaction primitive drift
onClick/onPress mixed across the four newest/edited files. CLAUDE.md's HeroUI v3 note names `onPress` as the convention. Fix: normalize to onPress.

### [P1] Back-to-sign-in treatment inconsistent
Only register success card uses ArrowLeft + text; forgot/reset/set-password/verify/invite use plain text. Fix: pick one variant (icon+text preferred) and apply everywhere.

### [P1] Forgot-password done subhead leaks the invariant
"For accounts that exist and are already signed in once, a reset link arrives at the address on file." tells anyone landing on the confirmation page that unverified addresses are silently excluded. Say less.

### [P2] Verify and invite invalid-token cards are dead ends
Both show reason and offer only "Back to sign in". Set-password and reset-password offer in-page resend; verify should too.

### [P2] Password confirm has no live-match signal
Reset-password and set-password mismatch only surfaces after submit round-trip.

## What Improved Since Run 1
- **Forgot-password flow shipped end-to-end** — new page, API route, `password_reset` token type (1h TTL), reset-password landing.
- **Credentials rate-limited** in `authorize` on per-IP (10/15m) + per-email (5/15m); `TOO_MANY_ATTEMPTS` branch in LoginForm.
- **Mobile tap targets fixed** — `size="touch"` (48px) on every primary auth CTA.
- **"Try a different address" replaced with resend** — no more orphaned second workspaces.
- **CSRF Origin check via `lib/csrf.ts`** wired into every mutating route.

## Detector
Exit 0, zero findings across the auth surface.

## Live Verification
- `/forgot-password`, `/reset-password/x` → 200
- `POST /api/auth/forgot-password` cross-origin → 403
- `POST /api/auth/forgot-password` valid → 200 `{ok, message, mailConfigured}`
- `GET /api/auth/reset-password?token=deadbeef` → 404 `{valid:false, code:'INVALID_TOKEN'}`
- Credentials rate limit trips on attempt 6 (per-email 5/15min): `?error=TOO_MANY_ATTEMPTS`

## Minor Observations
- `app/forgot-password/page.tsx` skips metadata (no page title / robots).
- `app/reset-password/[token]/page.tsx:82` stringifies Zod flattened error to `[object Object]` — same regression register learned from. **[fixed post-critique]**
- `handleResend` in LoginForm ignores 429 — flips UI to "sent" even on rate-limit rejection. **[fixed post-critique]**
- Password placeholders drift ("Choose a password" / "Your password" / "At least 8 characters").
