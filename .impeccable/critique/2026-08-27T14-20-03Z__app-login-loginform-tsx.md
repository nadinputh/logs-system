---
target: login + forgot-password + registration workflow
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
timestamp: 2026-08-27T14-20-03Z
slug: app-login-loginform-tsx
---
Method: dual-agent (A: design review, isolated · B: detector + runtime evidence, isolated)

# Critique: Auth workflow — login + forgot-password + registration (run 1)

**Target:** register + login flows + all token pages (verify / set-password / invite) + `lib/auth.ts` + `lib/rateLimit.ts`
**Mode:** Operate

## Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Live regions and "Checking your link…" states present; a verified user who fails sign-in has no next-step because no recovery exists. |
| 2 | Match System / Real World | 3 | Copy is human ("Someone created this account for you"). |
| 3 | User Control and Freedom | 1 | **No forgot-password route.** `resend-verification` only helps `!emailVerified \|\| !passwordHash`. Verified user + forgotten password = zero exits. |
| 4 | Consistency and Standards | 2 | 36-vs-48px submit buttons, onClick/onPress mixed, "Back to sign in" arrow-vs-plain inconsistent. |
| 5 | Error Prevention | 2 | set-password validates on mount; "try a different address" on register does not clear form state, silently orphans first account. |
| 6 | Recognition Rather Than Recall | 3 | Email echoed in confirmation card and every resend notice. |
| 7 | Flexibility and Efficiency | 3 | autoComplete correct; passkey button requires typing email first — negates efficiency win. |
| 8 | Aesthetic and Minimalist | 3 | Glass card, particle field, one signal color. |
| 9 | Error Recovery | 1 | Wrong password on verified account returns generic "email and password do not match" with no next step. |
| 10 | Help and Documentation | 2 | No FAQ, no "contact your admin", no support email surfaced. |
| **Total** | | **23/40** | Fair |

## Priority Issues

### [P0] No forgot-password path for verified accounts
Verified account, forgotten password = silent lockout. Register 409s. No `/forgot-password` page, no API route, no link on login. Fix: `/forgot-password` → `POST /api/auth/forgot-password` → `password_reset` token → `/reset-password/[token]` (reuse set-password shape). Add link on `/login`.

### [P0] Credentials login has NO rate limit
`POST /api/auth/callback/credentials` bypasses `lib/rateLimit.ts` — unlimited password guessing. Fix: `CredentialsProvider.authorize(credentials, req)` in v4 receives req; add per-IP + per-email limits inside, throw `TOO_MANY_ATTEMPTS`.

### [P1] Login/register submit buttons at 40px on mobile
Below Apple 44pt/Material 48dp. `size="touch"` (48px) exists and used elsewhere. Fix: add to both submit buttons and passkey button.

### [P1] Register "try a different address" silently orphans first workspace
`setDone(false)` doesn't clear form state. Changing only email creates second user + second team; original workspace is stranded. Fix: replace with resend to same address, or fully clear and warn.

### [P2] Cross-flow inconsistency
Arrow icons, onClick/onPress mixed, back-link styling drift. Passkey requires email first.

## What's Working
1. `set-password/[token]/page.tsx:20-47` validates the token on mount before rendering the form.
2. `lib/auth.ts:25-33` + `LoginForm.tsx:107-115` — `PASSWORD_NOT_SET` state named at auth boundary; login form offers "Email me a link" in same failure moment.
3. `RegisterForm.tsx:22-25, 49-99` — confirmation branches on `delivered` with different icon/color/copy; "try a different address" suppressed in failure branch.

## Deterministic Scan
Detector: exit 0, zero findings across the auth surface.

## Persona Red Flags
- **Casey (mobile):** 40px submit target; no forgot-password link; trust anchors hidden below `lg`.
- **Jordan (first-timer):** two mental models on one register screen ("Create your workspace" vs display headline).
- **Sam (screen reader):** "or" divider without `role="separator"`; login password missing `aria-describedby` hint pattern that register has.

## Minor Observations
- Token-in-URL exposure on /verify, /set-password, /invite — bearer credentials in browser history.
- `http://localhost:3000` fallback in every passkey route while dev runs on `:4242`.
- Verify success is a dead-end "Go to sign in" button.
