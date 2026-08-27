---
target: the email send process and working with external SMTP service config
total_score: 16
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-08-27T02-55-38Z
slug: lib-email-send-ts
---
Method: dual-agent (A: design review, isolated · B: detector + runtime evidence, isolated)

# Critique: Email send process & external SMTP configuration

**Target:** `lib/email/send.ts` + its four call sites + the SMTP config contract
**Mode:** Operate — two audiences: the *recipient* (whose inbox is the surface) and the *operator* (whose surface is the env contract)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Nothing can answer "did that email send?" No `transport.verify()`, no health check. `AddUserDirect.tsx:39` asserts "a set-password email was sent" on a path where nothing was sent. |
| 2 | Match System / Real World | 2 | `send.ts:198` drops a raw DB enum into prose ("as auditor"). `send.ts:195` says "expires soon" for a 7-day window (`invites/route.ts:118`). Set-password mail never names who created the account. |
| 3 | User Control and Freedom | 1 | No forgot-password route exists. No way to reissue a set-password link. No "this wasn't me." |
| 4 | Consistency and Standards | 1 | Four call sites, four failure behaviours — and CLAUDE.md asserts all four behave alike. The email matches nothing in the app. |
| 5 | Error Prevention | 1 | `.env.local.example:19` actively misinstructs; its placeholders break the documented first run. No startup validation of the SMTP triple. |
| 6 | Recognition Rather Than Recall | 1 | The all-three-vars rule lives only in CLAUDE.md and the code. The file an operator opens says the opposite. |
| 7 | Flexibility and Efficiency | 2 | One `shell()` for three messages of different stakes; no test-send; no set-password resend. Credit: the invite copy-link is a real alternate path. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely clean: title → paragraph → CTA → fallback. Nothing extraneous. |
| 9 | Error Recovery | 2 | `send.ts:79-81` / `:63-66` are exemplary operator copy, then swallowed into `console.error`. |
| 10 | Help and Documentation | 2 | CLAUDE.md's SMTP section is good on *why*. README has zero email content. `.env.local.example` is wrong. |
| **Total** | | **16/40** | **Poor** — below the 20–32 band |

Heuristic 7 scored one point above Assessment A's independent 1; the invite copy-link is a genuine efficiency path. All other scores matched A.

## Design Specificity Verdict

**Generic. Any unrelated SaaS could ship this email unchanged after a find-and-replace on "Kamnotheat."**

Strip that string from three subject lines and one sentence, and nothing in `shell()` (`send.ts:141-154`) identifies the product. No shield mark, no gradient, no uppercase micro-label, no Inter, no glass, no cyan glow.

Of ten brand commitments checked, **seven have no email-client excuse**: font stack, shield mark, uppercase micro-label ("a signature", DESIGN.md:162), card radius (16px vs committed 24px), button shape (10px rect vs pill), and the `<h1>` carrying no `font-weight` so it renders at UA default **700** — the exact weight the Two-Weight Rule says to skip. Only cyan-shadow, see-through-at-rest and split-clause are genuinely unavailable in mail.

The near-miss is the tell: CTA fill `#0e7490` equals `--accent` (`globals.css:41`) — Kamnotheat's **link** colour. The app's real CTA is `.gradient-cta` (`globals.css:206`). The email's most prominent object is styled as a link inflated into a box.

`app/verify/[token]/page.tsx:60` says "The link is single-use and expires an hour after it was sent." The email carrying that link says "This link expires in 1 hour" and nothing about single-use. The most on-brand sentence in the flow is on the landing page, not in the message.

**Deterministic scan:** `detect.mjs` exit 2, **5 advisory findings, all in `lib/email/send.ts`** — `design-system-font-size` `:149`; `design-system-color` `:150`, `:151`, `:152`; `design-system-radius` `:151`. Zero in `app/verify`, `app/set-password`, `app/invite`, `app/register`. The rule framing is a false positive (email cannot use tokens; DESIGN.md never claims to govern email) but the observation is real — `#0e7490` is in none of DESIGN.md's 14 documented hexes. Brand drift misreported as a token violation.

**Visual overlays: not available.** `playwright` absent from `node_modules`; injection skipped, not attempted-and-failed. Assessment B substituted a stronger method: transpiled the real module with the project's TypeScript and executed the genuine send path against a stubbed transport, rendering 8 messages.

## Overall Impression

The security engineering is careful and the *design* of it is absent — the gap between those two facts is where every finding lives.

Tokens are SHA-256 hashed at rest with a written argument why. The lazy-load indirection contains a missing package to the send path, and B proved that design correct by executing it. `escapeHtml` covers all five entities, and B disproved both suspected injection paths empirically: a hostile team name with `onmouseover` and `<script>` came out fully neutralised, and the `encodeURI`→`escapeHtml`→parse round-trip preserved five test URLs byte-exact.

Then the same module logs live account-takeover links to stdout with no `NODE_ENV` guard, and the config file guarantees an operator will trigger it.

**Biggest opportunity:** this email is the only Kamnotheat surface that leaves the building, reaching people with no account and no reason to trust you — and it looks exactly like a credential-harvesting phish.

## What's Working

**1. Operator-facing error copy is better than most production settings screens.** `send.ts:78-82` names the three variables to set. `send.ts:63-66` names the package, the remedy, and appends the original error. `next.config.mjs:22-27` explains *why* nodemailer is external in terms of what broke. Its only flaw is that no human can reach it.

**2. Escaping discipline is correct for a written-down reason.** `escapeHtml` (`:132-139`) escapes the title once while the body arrives pre-escaped from each caller — no double-escape, no gap. B tried a 200-char team name with `"`, `onmouseover=`, `<img onerror>` and `<script>`; every byte came out inert.

**3. `RegisterForm.tsx:58-93` is a textbook success state.** Honest under a security constraint (neutral phrasing mirrors the non-enumerating server response), states a true TTL, pre-empts the spam-folder failure, offers a non-destructive way back.

## Priority Issues

### [P0] `POST /api/admin/users` commits its writes, then 500s on mail failure — and lies in both directions

`app/api/admin/users/route.ts:66` calls `await sendSetPasswordEmail(...)` with **no try/catch** — the only one of four sites without one. B confirmed mechanically: `try-blocks=0`. CLAUDE.md claims "Callers now log a send failure and continue." False for this caller.

| Call site | Wrapped? | Status on failure | Writes committed |
|---|---|---|---|
| `auth/register/route.ts:45` | yes | 201 neutral | User, Team, TeamMember, Token |
| `auth/resend-verification/route.ts:40` | yes | 200 neutral | VerificationToken |
| **`admin/users/route.ts:66`** | **NO** | **500 unhandled** | **User `:48`, TeamMember `:56`, Token `:64`** |
| `teams/[id]/invites/route.ts:130` | yes | 201 + copy-link | TeamInvite |

Failure path: writes commit → send throws → 500 → `AddUserDirect.tsx:33` finds no `payload.error` → toasts "Failed to create user." Admin retries → `route.ts:42-46` → **409 "A user with this email already exists. Invite them instead."** Contradictory messages; the account is a zombie with no password, no delivered link, no admin lever. Exactly the trap `register/route.ts:37-42` documents escaping — the fix was applied to three sites and missed on the fourth.

Success path is worse: with SMTP unconfigured `sendMail` returns cleanly at `:120` having printed to stdout, and `AddUserDirect.tsx:39` toasts "User created — a set-password email was sent."

Not rare: B proved `nodemailer` is unresolvable from the project root (in `package.json:35` and the lockfile, absent from `node_modules`), so all three senders throw immediately in any SMTP-configured environment. This throws on the **first** attempt.

**Fix:** wrap like the other three; return `{ user, emailDelivered, setPasswordUrl }`; branch the toast, with a persistent Copy-link notice on failure — the pattern already shipping at `team/page.tsx:1174`.
**Suggested command:** `/impeccable harden`

### [P0] The dev fallback writes live account-takeover links into the production log — and `.env.local.example` is why it fires

`send.ts:118-121` logs `opts.text` (containing the plaintext bearer-token URL) with no `NODE_ENV` guard. `lib/verification.ts:12-18` argues these tokens must never be persisted anywhere readable because "a backup, **a log**, an analytics connector" would hold live account-takeover links. The email module does what the verification module forbids.

Contract disagreement, both sides quoted:
- `.env.local.example:19` — "If SMTP_HOST is unset, emails are logged to the server console (dev mode)."
- `send.ts:17-21` — `Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)`

One variable named, three required. An operator who sets HOST and fumbles PASS believes they left dev mode. CLAUDE.md:305-307 states the rule correctly; the defect is isolated to the file the operator opens.

Second trigger, same file: CLAUDE.md's Seed section says `cp .env.local.example .env.local`, and the example ships all three SMTP values **truthy**. `smtpConfigured()` returns true, the safe fallback is skipped, a transport is built to `smtp.example.com`, and `connectionTimeout: 10_000` hangs registration ten seconds before the error is swallowed.

**Fix:** gate the log on `NODE_ENV !== "production"`; in production `console.error` naming the three variables and never the token; rewrite `:19` with the all-three rule; comment the four SMTP lines out by default.
**Suggested command:** `/impeccable harden`

### [P1] Zero brand in the message — and three of those gaps are accessibility failures

B counted the rendered output: `<head>:0 <title>:0 <meta>:0 charset:0 lang=:0 prefers-color-scheme:0 @media:0 alt=:0 preheader:0`.

- **Dark mode unhandled.** No `<meta name="color-scheme">`. The `<h1>` has explicit `font-size` and **no `color`** while its ancestor has explicit `background:#fff` — the Gmail-iOS partial-invert signature. White heading on a white card.
- **Recovery text is 2.56:1.** `#94a3b8` at 12px on white (`:152`), computed. Bare text, not an `<a>`, so it can't be clicked and Gmail's auto-linker breaks at UUID hyphens. The recovery path is the least legible element in the message.
- **Tap target ~43px**, under the 44px floor, while every auth button uses `size="touch"`.
- **Subject truncation kills the brand.** `:194` front-loads the team name; at the 100-char cap "Kamnotheat" never appears in the visible subject.
- **No `<html lang>`, no `dir`.** Emoji and Arabic render as UTF-8 but get LTR direction; a 200-char team name meets zero `overflow-wrap` declarations in a 480px card.

Arrives before the recipient has any account or trust. The plaintext verification body doesn't contain "Kamnotheat" at all.

**Fix:** `role="presentation"` table with `bgcolor` fallbacks and a real `<head>` (charset, viewport, `color-scheme: light dark`); hidden preheader; shield mark as inline base64 on a gradient cell with `bgcolor`; uppercase 12px/0.12em/600 micro-label; explicit `color:#0f0f1e;font-weight:800` on h1; CTA at `--cta-from` `#0369a1`, `border-radius:9999px`, `min-height:48px`; fine print to `#57575e` (7:1); wrap the fallback URL in an `<a>`; reorder the invite subject.
**Suggested command:** `/impeccable polish`

### [P1] Set-password is a one-way door with no key — a missed 1-hour window is a permanent lockout

`VERIFICATION_TTL_MS` is 1 hour (`verification.ts:10`) and applies to `set_password` identically; `admin/users/route.ts:64` issues one with no override. All four exits verified sealed:

- **Sign in** → `lib/auth.ts:24` (`!user.passwordHash` → `return null`) → "That email and password do not match an account" for an account that provably exists. No forgot-password link, and no such route exists.
- **"Resend the verification email"** → `resend-verification/route.ts:38` issues `email_verify`, never `set_password`. The user verifies their email and still has no password — the one visible recovery button appears to work and leaves them further from access.
- **Accept an invite** → 409 ACCOUNT_EXISTS.
- **Admin re-creates** → 409 "Invite them instead" — the path that just 409'd.

The recipient is least likely to be watching their inbox, because they never asked for the account.

**Fix:** give `set_password` a 7-day TTL (it verifies email by possession anyway); branch `resend-verification/route.ts:37` on `!user.passwordHash` to issue a `set_password` token — one `if`; add "Resend set-password link" to the member row in team settings.
**Suggested command:** `/impeccable harden`

### [P1] Copy makes claims the code doesn't honour, and omits the one line a security product must have

1. **The invite is vague where the system is precise.** `:195` "link expires soon"; the HTML body says nothing about expiry. Real TTL is **7 days** (`invites/route.ts:118`). Both verification emails are accurate — "1 hour" matches `VERIFICATION_TTL_MS`.
2. **No unexpected-recipient line in any of the three.** On a set-password mail sent to someone who did not ask for an account, that is the most important sentence that could be there.
3. **No actor.** `invites/route.ts:115` captures `invitedByUserId`; `admin/users/route.ts:22` knows the acting admin. Neither reaches the message. "An account was created for you on Acme HQ" — by whom?
4. **The role is a raw enum.** "as auditor" — a lowercase DB value from a five-member enum no copy was written for.

`set-password/[token]/page.tsx:65` already says "Someone created this account for you." It arrives one click after the decision it was needed for — a placement failure, not a writing failure.

**Fix:** "This invite expires on Thursday 3 September." · "If you weren't expecting this, you can ignore this email — nothing happens until you open the link." · "Priya Raman added you to Acme HQ on Kamnotheat." · map roles to a clause.
**Suggested command:** `/impeccable clarify`

## Persona Red Flags

**Jordan (first-timer — the invited stranger):** the set-password message has no logo, no sender name, no reason for arriving, no "ignore this if it wasn't you," and asks him to click an unfamiliar URL and type a password. On the invite path the subject truncates before "Kamnotheat" appears, and the body says he'll be an "auditor" — a word granting no idea what he's agreeing to. Wait 90 minutes and he's locked out permanently, with the one visible recovery button making it worse while appearing to succeed.

**Sam (screen reader / low vision):** the fallback link is 2.56:1 at 12px and isn't an `<a>`, so it's not in his link rota — and he's exactly who needs it when the button doesn't activate. No `<html lang>` and no `<meta charset>`, so no language hint; "Réception & Sécurité" gets no `dir` or `lang`. The `<h1>` is the only heading. The in-app pages get this right (`verify/[token]/page.tsx:64` mounts an `aria-live` region before its content), making the email a regression against the team's own standard.

**Riley (stress tester — the operator on deploy day):** reads `.env.local.example:19`, sets `SMTP_HOST`, forgets `SMTP_PASS`, ships. Every link streams to the production log as a plaintext bearer credential while the API returns 201. He creates a user, sees "a set-password email was sent," and cannot discover it wasn't. When he fixes `SMTP_PASS` and hot-reloads, `global._mailer` (`:8,71`) is never invalidated — the broken transport persists until a full restart, so his fix appears not to work. Then a real send fails in `admin/users`: "Failed to create user" for a user that exists, retry, "invite them instead," 409. Five untruths.

## Minor Observations

- **Two token systems, two security postures.** `TeamInvite.token` is stored plaintext (`TeamInvite.ts:32`) and returned by `GET /api/teams/[id]/invites`, contradicting the argument at `verification.ts:12-18`. A 7-day bearer credential in the clear.
- **`teamName` reaches the subject header unescaped** (`:194`); `z.string().max(100)` doesn't strip newlines. B built a CRLF proof-of-concept but **could not confirm exploitability because nodemailer isn't installed to test against**. Nodemailer does sanitise headers, so likely contained. Unverified, not a defect.
- **`encodeURI` double-encoding is real but not live.** `encodeURI("%20") → "%2520"` confirmed, but the token generator is `uuidv4()` (hex + dashes) and real links survive byte-identical. Only exposure is a `NEXTAUTH_URL` containing `%` or a space.
- **No `List-Unsubscribe`, no SPF/DKIM/DMARC guidance in any doc.** That makes the "check your spam folder" hint load-bearing infrastructure.
- **`baseUrl()` falls through to `http://localhost:4000`** (`verification.ts:51-54`) with no production guard.
- **Zero test coverage on the email surface.** 79/79 tests pass; none touch mail, including the unwrapped call site.
- **Button and toast disagree** — `team/page.tsx:1143` "Send Invite"/"Sending…" vs `:506` "Invite created." The toast is honest.
- `AddUserDirect.tsx:86` uses `disabled` where the HeroUI v3 convention is `isDisabled`, and is the one auth-surface primary that isn't the brand CTA.

## Questions to Consider

1. `verification.ts:12-18` argues a plaintext token must never touch a log. `send.ts:119` logs one, in production, unguarded. Which file states the system's actual position?
2. `send.ts:41` calls mail "an optional capability." It is the only route into an admin-created account. Optional capabilities don't gate the front door — is the architecture wrong, or the comment?
3. Three emails share one `shell()`. Is one shape right for a formality the user just triggered, an unsolicited password request from an unknown party, and an invitation from a specific person? The highest-stakes gets the least: no actor, no reassurance, no recovery, shortest TTL.
4. PRODUCT.md commits to "the mechanism is the message." Why is the only message that leaves the product the one surface with no mechanism in it?
5. Four call sites, four failure behaviours, one of which 500s after committing its writes — and CLAUDE.md asserts all four behave the same. When the docs, the example env file, and the code each state a different rule, which one is the design?
