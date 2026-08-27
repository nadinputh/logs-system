---
target: the email send process and working with external SMTP service config
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-27T07-37-26Z
slug: lib-email-send-ts
---
Method: dual-agent (A: design review, isolated · B: detector + runtime evidence, isolated)

# Critique: Email send process & external SMTP configuration (run 2)

**Target:** `lib/email/send.ts` + five call sites + the SMTP config contract · **Mode:** Operate

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | No boot-time warning when production runs unconfigured. `register` and `resend-verification` discard the delivery boolean, so both still assert a send that may not have happened. |
| 2 | Match System / Real World | 3 | `ROLE_CLAUSE` translating enums into consequences is exemplary. Undercut by `formatExpiry` stating a UTC calendar day in hardcoded `en-GB` for a link that dies at a time of day. |
| 3 | User Control and Freedom | 3 | The set-password lockout is closed from both ends — mount validation with a resend, and a login branch for passwordless accounts. Recipient still has no decline and no reply-to. |
| 4 | Consistency and Standards | 3 | All five call sites now wrap the send; the two token pages now both validate on mount. Plaintext body shape and the two "email a person" buttons still differ. |
| 5 | Error Prevention | 3 | `smtpConfigured()` matching `getTransport()`'s needs, and the deliberately-commented env block, are unusually far-sighted. Still no boot validation. |
| 6 | Recognition Rather Than Recall | 1 | No mark, no wordmark, receiving address never restated, `from()` falls back to a bare `SMTP_USER`. Deliberately out of scope this round. |
| 7 | Flexibility and Efficiency | 1 | No test-send, no preview, no per-team From; `en-GB`/`UTC` hardcoded in the one place the message makes a factual claim. |
| 8 | Aesthetic and Minimalist Design | 2 | Nothing superfluous, but a 20px h1 over 16px body is a 1.25x step — the loudest object in the card is still the raw fallback URL. |
| 9 | Error Recovery | 3 | Two real doors now exist where there were none. `register` still reports nothing, and "unconfigured" vs "relay refused" remain one message. |
| 10 | Help and Documentation | 3 | `.env.local.example` and `CLAUDE.md` both agree with the code exactly. No first-deploy runbook; README still silent on email. |
| **Total** | | **24/40** | **Fair** — inside the 20–32 band |

Assessment A independently scored 20/40 against the pre-repair tree. This 24 reflects four defects repaired after that assessment returned (see Repairs below).

## Design Specificity Verdict

**Still generically excellent, specifically anonymous.** Delete four instances of "Kamnotheat" and nothing identifies the product.

The shell is not colour-naive: `#0e7490` is the live light-mode `--accent`, `#57575e` the live `--muted`, `#0f0f1e` is Ink Vault, and the 800/600/400 ladder observes the Two-Weight Rule with no 500 or 700 anywhere. Someone consulted the token file. Assessment B computed why `#0e7490` is right rather than drift: every documented brand cyan fails 4.5:1 as text on the white card (`#06b6d4` 2.43, `#0891b2` 3.68, `#0284c7` 4.10, `#0ea5e9` 2.77, `#0d9488` 3.74) and `#0e7490` is the nearest in-family value that passes at 5.36. The fix is to document it, not change it.

But three hex values are not an identity. The signal is a 135° sky→cyan→teal gradient plus a shield mark, and neither appears. Also absent: the uppercase 0.12em micro-label DESIGN.md calls "a signature," and the Split-Clause Headline Rule — **which the app already wrote for these exact three moments**: "One address, / confirmed once." (`verify/[token]/page.tsx:55-58`), "Your account is waiting. / Give it a password." (`set-password/[token]/page.tsx:59-63`), "Join the team, / keep the ledger whole." (`invite/[token]/page.tsx:93-96`). The emails say "Verify your email," "Set your password," "Join Acme HQ." The voice switches off for the message and back on the instant the recipient lands.

Defensible absences: glass/`backdrop-filter` (impossible in mail), the particle field (barred from dense surfaces anyway). Not defensible: the shield (`components/Logo.tsx:22-35` is already `currentColor` on a 24px viewBox), the gradient (a `bgcolor` fallback covers Outlook), the micro-label (pure inline text styling).

**Deterministic scan:** exit 2, **10 findings, all in `lib/email/send.ts`** — up from 6, entirely because the dark-mode block I added introduces four new literals. One of them, `#22d3ee`, is the app's real dark `--accent` (`globals.css:97`). Zero findings across `app/settings/team`, `app/verify`, `app/set-password`, `app/invite`, `app/register`, `app/login`.

The `overused-font` warning on `font-family:'Inter'` is a **false positive**: `DESIGN.md:152` names Inter Variable as the house family and `:240` forbids a second one. The detector is scoring a generic slop heuristic against an explicit house decision. B also found a detector gap: `#f6f7f9` and `#57575e` are equally undocumented and were not reported.

**Visual overlays: unavailable.** Playwright is declared in `package.json:54` and resolved in the lockfile but absent from `node_modules` — the same incomplete install as nodemailer. B substituted a stronger method: transpiling the real module with the project's own TypeScript and executing the genuine send path against a stubbed transport, capturing 13 messages.

## Repairs made after the assessments returned

Assessment A found four defects in work delivered earlier this session. Three verified; one did not.

- **Verified — the resend I added was unreachable.** `lib/auth.ts` returned `null` for a passwordless account *before* the `EMAIL_NOT_VERIFIED` throw, so the login page's recovery branch never rendered and the user was told their email and password "do not match an account" for an account that provably exists. Now throws `PASSWORD_NOT_SET`, and `LoginForm` offers "Email me a link".
- **Verified — set-password never validated on mount.** The invite page has done so all along; the higher-stakes flow let someone type a password twice before revealing the link was dead. Added `GET /api/auth/set-password` (validates without consuming) plus an expired state with a resend.
- **Verified — `color-scheme: light dark` was declared without dark styles.** I introduced that meta. In Apple Mail the declaration suppresses auto-inversion, so a dark-mode reader got a glaring white card. Now implemented against the `#0f0f1e` vault.
- **Not verified — A claimed `CLAUDE.md` contradicts the code.** It does not; line 310 states the dev/production split correctly, and B independently confirmed exact agreement. A was reading stale text. But B found the real version: the gate tested `!== "production"`, so `NODE_ENV=test` **and unset** also printed the token — the default for any process importing the module outside Next. Now whitelisted to `=== "development"`.

## What's Working

**1. `smtpConfigured()` and the commented-out env block are one idea thought two moves ahead.** The function tests the same three variables `getTransport()` requires, so a half-configured environment takes the safe path instead of throwing after the caller has committed writes. Then `.env.local.example` keeps the block commented *specifically because* uncommenting placeholders would satisfy that check, build a transport to a host that never answers, and stall every signup for ten seconds.

**2. `ROLE_CLAUSE`.** The invite is the one email asking the recipient to accept a *capability*, and it says what the capability is — "an auditor — read-only access to logs and reports" — with a safe fallback for a role nobody wrote copy for. The most Kamnotheat-specific thing in the module: it treats the recipient as someone entering an access-control system.

**3. Refusing to log the link outside development, and defending it with tests.** B executed the module under four `NODE_ENV` values and captured output verbatim: production and test and unset all emit only the config error naming the three variables; development prints the link. A comment claiming a security property is worth nothing; a test asserting it is worth a lot.

**4. Injection is contained, and B proved it by parsing rather than grepping.** Against a payload carrying `"`, `<script>`, `<img onerror>` and `onmouseover=` as both team name and inviter: document-wide real `on*` attributes NONE, `<script>/<img>/<iframe>` elements `[]`, anchor attributes exactly `["href","style"]`. Href injection is contained twice over — `encodeURI` turns `"` into `%22` so the attribute never terminates, and `escapeHtml` turns `'` into `&#39;`.

## Priority Issues

### [P1] Both public paths still assert a delivery that may not have happened

`register/route.ts:45` and `resend-verification` both `await` the send and discard the boolean. Register then returns "Check your email to verify your account." and `RegisterForm.tsx:67-72` renders "a verification link is on its way to jane@acme.test." unconditionally. With nodemailer absent and SMTP unconfigured — the current live state — that sentence is false every time.

The neutrality exists to avoid revealing whether an address maps to an account. **A send failure is a server-side infrastructure condition, entirely independent of the address, so reporting it leaks nothing.** The account, team and membership are already committed, so the person owns an unverifiable workspace and the app's own advice ("try a different address") orphans a second account.

**Fix:** return `{ ok: true, delivered: boolean }`, keeping the account-level message identical in every branch; when false, say the workspace is ready but the mail could not be sent, and show the resend control instead of hiding it. Add one boot-time check: `NODE_ENV === 'production' && !smtpConfigured()` → startup error.
**Suggested command:** `/impeccable harden`

### [P1] The operator cannot verify the configuration, and two failures produce one message

No test-send, no health check, no mail status anywhere in the console. The only way to learn whether SMTP works is to create a real user and read a toast. Worse, `emailDelivered:false` conflates "SMTP was never configured" (returns false) with "the relay refused the credentials" (throws, caught) into the identical banner. A third case hides behind `true`: `sendMail` resolves as soon as the relay accepts, so a message accepted and then bounced for SPF reports "Invite sent" with no banner and — for invites — the plaintext token gone forever.

**Fix:** `POST /api/admin/email/test` sending the verification template to the calling admin, returning a discriminated outcome (`unconfigured` | `transport_error` | `accepted`); widen the return type from `boolean` to that union so the banners can differ; rename the success copy from "sent" to "handed to your mail server."
**Suggested command:** `/impeccable harden`

### [P1] The email is brand-anonymous at the moment trust is being asked for

Deliberately out of scope this round — the chosen scope was the accessibility and trust floor only, and that floor is now met. Recording it because it remains the largest gap: no logo, no wordmark, no footer, no organisation identity, the receiving address never restated, and `from()` may resolve to a bare `apikey@sendgrid.net`. The `/invite/[token]` page shows the recipient their own email — the app knows this is a trust signal and the email declines to use it.
**Suggested command:** `/impeccable polish`

### [P2] Two places the words still outrun the code

**(a) The expiry day can be wrong.** `formatExpiry` renders a UTC calendar date, no time, hardcoded `en-GB`. A link minted 09:00 UTC says "expires on Thursday 3 September" but dies at 09:00 that morning; for a recipient at UTC-8 it dies Wednesday night by their calendar.

**(b) "Nothing happens until you open the link" is false for set-password.** For verification and invite it holds. For set-password it does not: `admin/users/route.ts:52-72` commits a User and a TeamMember *before* the send. A record bearing this person's name already exists inside an access-control system — in a product whose first principle is "the ledger is sacred."
**Suggested command:** `/impeccable clarify`

### [P2] The bearer credential is returned on the success branch too

`admin/users` returns `setPasswordUrl` and the invites POST returns both `inviteUrl` and `invite.token` **unconditionally**, including when `emailDelivered === true`. The plaintext reaches the admin's browser, response logs, and any proxy on every call — not only when it is needed as recovery. Return it only on the failure branch.
**Suggested command:** `/impeccable harden`

## Persona Red Flags

**Jordan (first-timer)** — receives the set-password email cold. The sender line may be a bare relay username, the card carries no mark, the body never names their own address, and the actor is "An administrator" whenever the mail came via `resend-verification` (which passes only `expiresAt`). Jordan has nothing to authenticate the request with and is being asked for a password. **Fixed since last run:** hesitating past the window no longer strands them — the page now says the link expired before they type anything and offers a new one.

**Riley (operator on deploy day)** — sets `SMTP_HOST` and `SMTP_USER`, forgets `SMTP_PASS`, deploys. Still no boot warning. Registers a test user and is told "a verification link is on its way." Nothing arrives. Fixes the password and re-tests: `global._mailer` caches the broken transport across hot reloads, so the fix appears not to work — `resetTransport()` exists but is exported for tests and named nowhere an operator would look. Then invites a real user, gets "Invite sent", the message bounces on SPF, and the token is unrecoverable because only the hash is stored.

**Sam (screen reader / low vision)** — the fallback link's accessible name is the raw URL, so a 36-character UUID is announced character by character, and two links share one destination with only one usable name. A team name in Arabic gets `dir="auto"` but no `lang`, so it is read with an English voice under `<html lang="en">`. On the operator side, `settings/team/page.tsx:1273` uses `<Label className="opacity-0">Send</Label>` — hidden by opacity, so it stays in the accessibility tree announcing a label with no `htmlFor`. **Working:** `role="presentation"` on all three layout tables, a real 48px tap target (`line-height:48px` is the declaration Outlook honours), and every text pair measured past AA — heading 18.96:1, body 7.58:1, CTA 5.36:1, fine print 7.17:1.

## Minor Observations

- **The verification TTL is restated in prose five times and imported zero times.** Change `VERIFICATION_TTL_MS` and four user-facing claims silently become lies. `sendVerificationEmail` doesn't even accept `expiresAt`, though the other two templates do.
- **`sendMail` never applies `headerSafe` to `to`** — safe today only because every call site validates through `z.string().email()`.
- **`encodeURI` double-encoding is latent, not live.** Identity on the real `uuidv4()` format; `encodeURI("%2B") → "%252B"` if the token format ever changes to base64url.
- **Subject is trimmed but never truncated** — a 200-char team name yields a 231-char subject. Brand leads, so it survives, but the team name consumes the whole visible line.
- **Two greys for body copy** where the app has one: `#475569` on the paragraph vs the real `--muted` `#57575e` on the fine print.
- **Plaintext is a second-class citizen** — the invite's text part says "as auditor" while the HTML explains what an auditor can do, and no plaintext part carries any sender identity.
- **`nodemailer` is still not installed** — in `package.json:35` and fully resolved in the lockfile, absent from `node_modules`. Also note `next-auth@4.24.14` declares peer `nodemailer: ^7.0.7` against the pinned `^9.0.1`.
- **Zero pending invites existed at migration time**, so the hashing change stranded nothing here.

## Questions to Consider

1. The app wrote three split-clause headlines for these three moments and put none of them in the email. "One address, confirmed once" is sitting in the landing page. What made the landing page worth authoring and the email that precedes it worth only "Verify your email"?
2. `smtpConfigured()` reasons carefully about the boundary between "not configured" and "configured but broken" — then collapses both into one boolean the UI renders as one sentence. Why does the module know the difference and the admin not?
3. The email says "nothing happens until you open the link" while a User and TeamMember bearing that person's name already exist. In a product whose first principle is "the ledger is sacred," is that reassurance or a small lie of convenience?
4. The subject leads with "Kamnotheat" every time, pinned by a test so truncation cannot hide it. But for an invite recipient, "Kamnotheat" is a word they have never seen and "Acme HQ" is the one they recognise. Whose recognition is the lead position for?
5. `resend-verification` reissues the correct token type for a passwordless account, and a test proved it — and until this run nothing in the UI could reach it. How many other correct, tested recoveries in this codebase have no door?
