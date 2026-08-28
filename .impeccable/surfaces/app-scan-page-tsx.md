---
version: 1
slug: "app-scan-page-tsx"
primary_target: "app/scan/page.tsx"
related_targets: ["app/landing/page.tsx","components/scanner/QRScanner.tsx"]
---

# Surface brief — Scan (`app/scan/page.tsx`)

## Mode
**Operate.** The visitor completes a task: get through the door. Success is a recorded
check-in, fast, by someone who has never seen this product and will never see it again.
Scanability and the real usage scene outrank expression.

## Usage scene
A one-time visitor standing at a reader, holding a phone, one-handed, mildly hurried,
possibly on venue wifi. The desktop case is real but secondary — usually someone who
clicked through from the landing.

## Visual world
**The Glass Vault**, shared with the landing (DESIGN.md, unchanged). Same two atmosphere
layers, same shell, same accent, same glass.

## Direction (2026-08-22)
Given the same treatment as the landing, with one deliberate divergence.

1. **Not the landing's width.** A camera viewfinder does not want 1440px. The `.shell`
   aligns the spine with the landing, but the width is spent on supporting content
   *beside* the task (`lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]`) rather than on
   stretching the viewfinder. Mobile stacks, task as high as possible.
2. **Server component.** framer-motion removed — it was rendering the page at
   `opacity: 0` until hydration, on the surface where speed matters most. `html5-qrcode`
   is imported inside the tap handler, so the scanner's idle state server-renders
   instead of hiding behind a `dynamic(ssr:false)` spinner.
3. **Kicker removed.** The "CHECK IN" chip above the h1 was the one thing the craft floor
   bans outright.
4. **Step cards → a sequence.** Three same-size icon+heading+text cards were the refused
   page scaffold; supporting content is now a numbered list with no card chrome.

## States are the deliverable here
This is where the product most often fails a stranger. Every camera refusal now has a
named cause and a recovery instruction, never the raw browser exception:
insecure context (checked *before* the tap — a LAN kiosk hits this), permission blocked,
no camera, camera busy, no rear camera, and a QR that is not a check-in code. Plus a
loading phase, a stop control, a stable-height idle placeholder, and one `aria-live`
region so a screen reader hears all of it.

## Constraints carried
- Decoded QR content is untrusted input: only same-origin URLs under `/scan/`, `/quest/`
  or `/terminal` are followed. A security product must not let any QR sticker steer a
  visitor through its own app.
- Never fabricate proof; no claims beyond what CLAUDE.md documents.
- `--status-danger` is text-only, per DESIGN.md's foreground-pairs rule.

## Related
`app/landing/page.tsx` (the other door — must stay visually consistent),
`components/scanner/QRScanner.tsx`, `app/scan/[locationId]/page.tsx` (the destination).

## Harden — dead end and fallback routes (2026-08-25)

**The disabled control is gone.** A non-retryable cause (`retryable: false`) no longer
disables the CTA — it *removes* it and lets the working routes take the space. The three
non-retryable branches were also rewritten so none of them says "try again"; that phrase
now only appears beside a button that can actually be pressed. Verified: dead-end state
renders zero buttons and the string "try again" is absent from the page.

**The idle placeholder is withdrawn on a dead end.** Promising "the camera preview appears
here once you start the scanner" is a lie once the control that would start it is gone.

**Live regions split.** Progress stays `role="status"` / polite; a task-ending failure
moved to `role="alert"`, which is always mounted so the first announcement is not
swallowed. The scanner also gained an `sr-only` `<h2>` — heading navigation previously
landed on "What happens", the explainer, because the task had no accessible name.

**The fallback is two real routes, always visible** — not revealed only after a failure,
because a screen-reader user cannot aim a camera and would never trigger the failure that
discloses an alternative: the phone's own camera app (opens the identical link, no account,
no new endpoint) and reception (the fallback a physical door already has).

### The short code does not exist — do not assume it
The critique recommended "a short-code input resolving to /scan/[locationId]". That is a
backend feature, not a design change, and it was scoped wrong:
- No `code`/slug field exists on Building, Floor or Room. The QR encodes a 24-char ObjectId.
- The printed QR page shows `location.name` and floor/building, none of it typable.
- Every location endpoint requires `requireTeamPermission("locations.read")`, so a
  logged-out visitor can reach none of them — a location *picker* is equally blocked.
- Any public lookup would expose the estate's layout to anonymous visitors, which is a
  security decision for the owner, not a design default.
Building it needs: a code field + backfill, a public resolve endpoint with rate limiting,
and the admin QR print page to print the code under the QR.

## Clarify — capture disclosure and step 3 (2026-08-25)

**Step 3 was false.** "Confirm and you are logged" preceded a form. Now "Give your name
and confirm / Only your name is required." Verified against
`components/location/CheckInOut.tsx`: full name is the only `required` field; email/phone,
purpose and gender are each labelled optional, and the selfie step offers "Take a photo or
skip".

**The disclosure states only what the engine stores.** Checked line by line against
`lib/models/Log.ts`, the `POST /api/logs` handler and the check-in form:
- automatic — server timestamp, `locationId` (the code scanned), `ipAddress`
  (`getClientIp`), `userAgent`, `deviceId` (a random UUID in this browser's localStorage)
- typed — `visitorName` required; `visitorEmail`/`visitorPhone`, `visitPurpose`,
  `visitorGender` optional
- optional — `photo`
The QR video is decoded in-browser and never uploaded, so "the camera feed never leaves
your device" is true of the *scan*. A selfie, if taken, is uploaded — which is why the
disclosure calls the photo out separately as optional rather than lumping it in.

### geofenceStatus is documented but never captured
`navigator.geolocation` / `getCurrentPosition` appear nowhere in the codebase.
`geofenceStatus` exists on the Log schema and is read by the admin log viewer, but nothing
in the visitor flow ever sends it. The disclosure therefore makes **no location claim** —
writing one would have been a false statement about a privacy-sensitive capture.
Unresolved: CLAUDE.md lists `geofence_status` as captured, and
`components/landing/RecordPanel.tsx` shows `geofence_status: inside` under a caption
saying the capture rules are the ones the engine uses. Either the feature is unbuilt or
the docs are wrong; the owner should decide which.

## Layout — re-scoped as a fallback (2026-08-25)

The owner confirmed this is the **fallback**, not the front door: every phone since iOS 11
opens the door's QR from the native camera, so the realistic path is `/scan/[locationId]`
and this page is what you reach when that did not work.

**One centred column** (`max-w-[34rem]`) replaces the two-column split. The split existed
to fill desktop width for a front door; it gave 61% of the width to three sentences while
the task got 480px. A fallback utility does not need a marketing composition, and one
column means mobile and desktop are the same structure rather than a desktop layout
folded down.

**The header carries no staff controls.** ThemeToggle and the "Sign in" pill are gone.
Measured before: `Sign in` was the highest-contrast interactive element at load, at y=10,
on a surface whose visitor has no account. Dark mode still follows the OS via next-themes;
the staff route remains at the foot of the page. The wordmark is no longer `hidden sm:block`
— a page that asks for a camera has to name who is asking.

**The task moved above the fold.** `Start scanner` was at y=807 on a 664px viewport (below
the fold, after the disclosure landed); it is now y=480 and fully visible on iPhone 13,
iPhone SE and desktop. Achieved by cutting a lede that repeated step 1 verbatim and folding
its immutability claim into a single above-fold line carrying *both* halves — what is
permanent and what it contains.

Measured after: `Start scanner` is the largest interactive element (13,552px²) and the only
filled one; tab order is skip → logo → **Start scanner** → console, moving the task from
the 5th stop to the 3rd.

## Post-critique P1s (2026-08-25, re-critique scored 30/40, up from 23/40)

**Landscape.** The viewfinder and placeholder are capped at `min(45vh,20rem)` and collapse
to a 112px strip below 540px viewport height; short viewports also tighten top padding and
card padding. CTA now clears the fold at 844x390 (was 264px below it). Still 13px short at
740x360 — an old phone in landscape — where the page scrolls normally.

**`starting` had no exit.** `scanner.start()` is now raced against a 10s watchdog resolving
to a retryable "The camera did not open". Verified: fires at exactly 10s with an enabled
"Try again".

**Focus recovery.** Removing the control on a dead end dropped focus to `<body>`. The
failure notice now takes `tabIndex={-1}` and receives focus. Verified.

### A regression this pass caused and fixed
The watchdog's cleanup called `scannerRef.current?.stop().catch(...)`. `stop()` throws
*synchronously* when the scanner never started, so the trailing `.catch()` never saw it; the
exception escaped the catch block before `setFailure` ran and **silently broke every failure
path** — the alert stayed empty for all six causes. Now wrapped in try/catch. Caught only by
instrumenting the live page; typecheck and the detector both passed while it was broken.

### Blocked on facts the owner holds
- **Retention period.** Requested, but no policy number exists to write. "Never edited" with
  no expiry reads as a threat; the sentence cannot be written without the real figure.
- **Organisation name.** The page can only say "this organisation's staff". Naming the
  building's owner needs a field on Team (or equivalent) plus a public read path — a schema
  change, not copy.
- **"You do not need an account"** shipped; it needed no new facts.

## Polish — the primary CTA (2026-08-25)

The scan CTA rendered flat `#0e7490`, weight 500, 40px desktop — against DESIGN.md's
135deg sky→teal gradient, cyan Signal-glow, weight 600, 48px. The Cyan-Shadow Rule and the
Two-Weight Rule were both broken on the page's single most important control.

**Classified as a one-off implementation, not a local defect.** DESIGN.md documents a
gradient primary; the Button adapter renders HeroUI's flat accent; four surfaces were
hand-applying `.gradient-cta` plus a height utility to rebuild the treatment at each call
site. That is exactly how it drifted on the one page nobody re-checked.

**Fixed at the system level, scoped:** the adapter gained a named `variant="brand"` that
owns the treatment. `default` still maps to HeroUI's flat primary, so the console's ~26
primary buttons are untouched — a fix to `default` would have restyled surfaces outside
this request. Scan, login and register now declare `variant="brand"` instead of
reconstructing it; three hand-patches removed.

Verified identical across all three: h=48, weight 600, `linear-gradient(135deg, #0369a1,
#0f766e)`, `rgba(6,182,212,0.22) 0 18px 40px -16px`, pill radius. White label 5.93:1 on the
start stop, 5.47:1 on the end. Focus ring survives (2px solid accent, 2px offset).

The two remaining `.gradient-cta` uses on the landing page are `<Link>` elements, not
Buttons, at intentionally different sizes (h-11 nav chrome, h-12 hero). Both already match
the spec; the adapter cannot serve an anchor, so they stay as they are.

## Final polish (2026-08-25)

- **Step 3, third attempt, now verified.** The flow is `identity` -> `identity` step 2 ->
  `checkin` -> optional `selfie`. "Confirm and you are logged" skipped it; "Give your name
  and confirm" understated it. Now "Confirm over a few short screens / Your name is the only
  required field — the details and photo that follow are skippable."
- **`<ol>` double-numbering.** The manual `{i+1}` is `aria-hidden`; the list already conveys
  position, so screen readers no longer hear "list item 1 of 3 ... 1, Point your camera".
- **"Open the console" touch target: 119x17 -> 119x44**, via `py-3 -my-3` so the sentence
  does not move.
- **Detector is clean repo-wide.** The nine `text-[11px]` off-ramp sizes across
  settings/passkeys, settings/team and VisitorPasskey are on the documented 12px step.

### Flagged, not fixed: console brand-colour contrast
Raw `text-cyan-500` / `text-sky-500` on their own `/10` washes measure **2.05:1 and 2.31:1**
in light mode — failing 4.5:1 for text and 3.0:1 for icons. Ten occurrences across
`app/dashboard`, `app/logs`, `app/settings/team`, `app/settings/passkeys` and
`components/location/VisitorPasskey.tsx`. `--accent` on the same wash gives 4.52:1.
Not swapped, for two reasons: those surfaces have not been audited, and on the dashboard
sky vs cyan may be distinguishing two metrics — collapsing both to one token would remove
information. This wants its own pass.

## Routing premise resolved, and consent moved above the control (2026-08-26)

The 27/40 critique found the page's premise and the product's navigation disagreeing: three
passes had rebuilt this surface as "the fallback, not the front door", while
`app/landing/page.tsx:160` and `app/quest/[questToken]/page.tsx:124` were the only inbound
links and both presented it as the primary visitor route. **The owner chose fallback and
fixed the routing.** The landing's visitor pill is gone; the landing and the quest card now
both say to point the phone's own camera at the location QR, with `/scan` linked as the
recovery. This page's lede acknowledges that route having failed. Do not re-tune this
layout on the front-door premise again — it is settled.

### Consent now sits above the control that opens the camera
The disclosure used to put the benign three fields (time, code, name) above the CTA and the
invasive three (IP, browser, device id) below it, under the faintest heading on the page.
Both halves are now in one complete list rendered *above* the button, at zero vertical cost,
by filling the idle box that already holds the viewfinder's place. The box keeps identical
sizing classes, so the measured CTA fold position is unchanged; it loses the dashed edge,
which stops being true once the box carries real content, and scrolls rather than clips in
landscape.

`QRScanner` gained an `idlePlaceholder` slot for this. It is a slot rather than fixed copy
for a second reason: visitor consent copy must not render on `/terminal`, where the same
component is embedded and the operator is staff.

### The photo disclosure was wrong by omission
"The camera feed never leaves your device" sat three words from "a photo are optional", and
`lib/cloudinary.ts:10-13` POSTs the selfie to `https://api.cloudinary.com/v1_1/…` — an
unauthenticated upload preset on a third-party host outside the organisation. The list now
says a photo "is uploaded and stored with your entry". Verified against `uploadSelfie()`.

### `starting` was the least readable moment on the page
`isLoading` collapsed into a native `disabled` attribute at `--disabled-opacity: 0.5`,
putting the white label at roughly 1.5:1 on the brand gradient in light mode, blurring the
element so a keyboard user dropped to `<body>`, and leaving the polite region empty for up
to the full 10s watchdog. The Button adapter gained `loadingBehavior="disable" | "busy"`;
form submits keep `disable` (double-submit protection on an irreversible POST), the scanner
takes `busy`. Progress is announced in the polite region rather than left to a label change
under an already-focused element.

**Focus recovery deliberately stays gated on `deadEnd`.** The critique recommended widening
it to any failure; that is now the wrong fix. An undisabled button never loses focus, so a
retryable failure already leaves the visitor on the control they want, its label reading
"Try again" while `role="alert"` gives the cause. Sending focus to the notice would park
them on static text *after* that button in the DOM.

### A stray QR no longer ends the scan
The decode callback stopped the camera *before* validating. A wifi card, a menu or a poster
in frame therefore shut the scanner down and cost a re-tap plus a cold start — the most
likely real-world misfire, and a contradiction of step 2's "It reads itself". Validation now
runs first; a code this product does not own posts a deduped "still looking" notice and the
camera stays live. Deduped by content because the same sticker decodes ten times a second.

### Decode logic is now testable
`resolveDecoded` and `describeFailure` moved to `lib/scanner/decode.ts` — no React, no
`window` (origin is a parameter). `__tests__/scanner-decode.test.ts` covers 18 cases
including protocol-relative `//evil/scan/x`, a `javascript:` payload, same-origin routes the
scanner does not own, the html5-qrcode plain-string rejection path, and an assertion that no
non-retryable cause contains the words "try again".

## The destination, and the final polish (2026-08-26)

### `/scan/[locationId]` no longer collapses the visual world
The three ways arriving at a check-in code can fail — an expired kiosk token, a token signed
for another location, and a code matching no location — were a bare centred sentence in raw
`text-red-500` / `text-amber-600`, with no header, no branding and **no route forward**. They
are now one shared `components/location/ScanNotice.tsx`: the page's own ambient ground, the
wordmark, a foreground heading with a status-coloured icon (status is text and icon only,
never a fill), and the same two routes the scanner offers. Copy for all three now also says
plainly that nothing has been recorded.

`CheckInOut` lost its hardcoded `bg-gradient-to-br from-slate-50 via-cyan-50/30
to-teal-50/20`, which was light-only: a visitor whose phone is in dark mode crossed from the
dark vault straight onto a white page, mid-flow, on the screen that takes their name and
photo. It now stands on `.ambient-wash` over `bg-background` and carries the wordmark.

**`--status-success` was a missing token, not a local defect.** DESIGN.md documents Success —
"Occupied Green" — with both foregrounds (`#047857` / `#6ee7b7`), but no CSS variable existed,
which is why every success state in the flow hardcoded emerald and none had a dark value. The
token now exists and carries them. All 15 hardcoded palette utilities in `CheckInOut` are
gone: status *text* moved onto `--status-success` / `--status-warning` / `--status-danger`;
washes and dots keep the raw `-500` hue, which DESIGN.md reserves for graphic fills. The
location-type chip keeps its three hues, because they carry information, but each now ships
the light and dark foreground pair the system requires.

Not verified here: `KIOSK_SECRET` is unset in this environment, so the expired and mismatch
branches cannot be exercised. They share the component and props with the third, which was
verified rendering.

### Polish
- **The CTA gradient is theme-aware.** `--brand-sky-deep` / `--brand-teal-deep` held the same
  deep stops in both themes, leaving the primary control at **3.20:1 against the `#0f0f1e`
  vault** — the dimmest branded object on the page, while the headline and logo tile both
  brighten. Renamed to `--cta-from` / `--cta-to`; dark mode now takes `#38bdf8 → #2dd4bf`, the
  same stops `--headline-from/to` use, so the mark, the headline and the CTA rhyme. The label
  follows `--accent-foreground`, which the theme already defines as dark-on-brand. Measured:
  label **8.79:1 / 10.11:1** (was 5.93 / 5.47) and presence **8.85:1 / 10.19:1** (was 3.20 /
  3.46). Light mode is untouched. All three `.gradient-cta` call sites updated together.
- **`Stop scanner` was 40px on desktop.** `size="lg"` resolves to HeroUI's `.button--lg`,
  which is `h-11` but `md:h-10` — under the touch-target floor, and an 8px shrink from
  `Start scanner` the moment scanning began. Dropping the size prop leaves `.button--md`,
  which carries no height rule, so `h-12` wins uncontested exactly as `variant="brand"`
  already does. Start and Stop are now the same object.
- **One page, one spine.** The header sat on the 1440px `.shell` while the content sat in a
  34rem column, so the wordmark started ~383px left of everything beneath it. The header now
  shares the content column on `/scan`, `ScanNotice` and `CheckInOut`.
- **The particle field is masked.** `/scan` used a bare `absolute inset-0`, so the dot grid
  ran behind the consent text to the page foot. It now fades out like the landing's, bounded
  to the viewport because this page is far shorter.
- **`font-bold` (700) on the wordmark** — the only off-scale weight in the file, on the
  brand's own name — is now 600.

### Verification
Detector clean (exit 0) across all eight changed UI files. 79/79 tests pass (18 new).
Typecheck holds at the 36 pre-existing errors — generated route types, test files, and a
missing `nodemailer` — with zero in any touched file. `/scan`, `/landing`, `/login`,
`/register`, and `/scan/[locationId]` for a real room, floor and building all render 200.

### Still open, deliberately
- **Console brand-colour contrast.** Raw `text-cyan-500` / `text-sky-500` on their own `/10`
  washes across `app/dashboard`, `app/logs`, `app/settings/*` and `VisitorPasskey`. Untouched
  here; those surfaces have not been audited and on the dashboard the two hues may be
  distinguishing two metrics.
- **No return path to a live scanner** after `router.push`, so a five-stop quest card still
  costs five camera cold starts. Needs a flow decision, not a copy change.
- **Retention period and organisation name** still cannot be written: no policy figure exists
  and naming the building's owner needs a field on Team plus a public read path.
- **`geofenceStatus`** is claimed as captured in CLAUDE.md and rendered as
  `geofence_status: inside` on the landing's `RecordPanel`, but no code path sends it. Either
  the feature is unbuilt or two surfaces are lying — an owner decision.

## Audit remediation — check-in to check-out (2026-08-26)

An audit of the full workflow scored **11/20**; after three remediation passes it scores
**17/20**, with all 17 original findings closed. The workflow's two halves were effectively
two products meeting at `/scan/[locationId]`.

**Idempotency parity.** `POST /api/logs` had read the `Idempotency-Key` header since the
engine shipped, and `VisitorPasskey` had always sent one — but it built the key in a private
function, so the ordinary click path reached an append-only ledger with no replay protection
at all, and `PATCH /api/logs/[id]` had none server-side either. The builder now lives in
`lib/idempotency-key.ts`; both writes send the header, both refuse re-entry, and the checkout
route checks and commits like `POST` does. Both endpoints' `existing`/`already` lookups are
read-then-write and not atomic — the key is what closes that window.

**The flow had no accessibility infrastructure.** No `<main>`, no `<h1>`, no live region, no
focus management across seven step transitions. It now has a skip link, one `<main>`, one
`h1`, five focusable `h2` step headings, one polite live region announcing each step, focus
that follows the step, and `aria-busy` on the loading skeleton.

**Control system unified.** HeroUI's base `.button` is `h-10 md:h-9`, so every control in the
flow was 40px on a phone and **36px on desktop** while `/scan` shipped 48px. The adapter
gained `size="touch"` (48px) — a named size, not a change to `default`, because the console
is a dense desktop surface where 36px is deliberate. 17/17 controls now meet 44px (14 at 48,
the inline Edit at 44; it had been 32px, the only way to correct a name before an
irreversible write).

**Resource leaks and cost.** `SelfieCapture` never released the camera on unmount, on the one
flow whose disclosure promises the feed never leaves the device. It now stops tracks and
revokes its object URL from refs (a cleanup registered at mount closes over empty state).
`toDataURL` → `fetch` → `blob` held two full copies of a camera frame; `toBlob` produces the
upload payload directly. The 1s tick that re-rendered the whole 860-line component moved into
a `LiveDuration` leaf; the parent ticks once a minute for the 16:30 threshold.

**One icon system, one brand tile.** Five hand-inlined heroicon paths at stroke 2 (none
`aria-hidden`) became lucide at the project's weight. `.gradient-primary` was built on
`--brand-sky`/`--brand-cyan`, which brighten in dark — so the icon tiles matched `LogoTile` in
light and drifted away from it in dark, taking the white mark to 1.81:1. Fixed at the token
layer with theme-invariant `--mark-*`, and `LogoTile` now uses the same class, so the brand
tile has exactly one definition. It also gained its missing teal stop; two stops had been
violating the Gradient-Direction Rule.

**Reduced motion.** Tailwind's `animate-pulse` / `animate-spin` sat outside the project's own
policy. Following its stated rule — movement goes, meaning stays — the skeletons freeze and
the spinner slows to 2s rather than stopping, since stopping it would delete the only
in-flight signal.

### The geofence claim is retired from user-facing surfaces
`geofenceStatus` is a Boolean on the Log schema, read by the admin log viewer, and set by
nothing — `navigator.geolocation` appears nowhere in the repo. `RecordPanel` was showing
`geofence_status: inside · verified against polygon` under a caption asserting "field names
and capture rules are the ones the engine uses", which is a fabricated claim in PRODUCT.md's
own terms, and the value shape was wrong for a Boolean besides. It is replaced by `user_agent`
— genuinely captured on every write, and the third leg of the anti-spoofing set CLAUDE.md
names. The source comments in `ParticleField` and `app/landing/page.tsx` that asserted "the
geofence check the engine runs on every write" — the origin of the claim — are corrected. The
locating motif itself stays (owner call, 2026-08-22); only the claim went.

**Still the owner's call:** whether to build geofence capture or drop the field from the
schema and the admin log viewer. Nothing user-facing now asserts it either way.

### Verified, not assumed
Detector exit 0 across eleven UI files. 79/79 tests. Zero source errors in any touched file
(the `.next/types` count fluctuates with which routes the dev server has compiled — it moved
42 → 12 → 14 with no source change, which is what identifies it as generated noise). All of
`/scan`, `/landing`, `/login`, `/register` and `/scan/[locationId]` for a real room, floor,
building and an unknown id render 200.

**Verified as a non-issue:** the width difference between `/scan` (544px) and the flow
(384px). On a phone the two are 350px and 358px — the 8px came from a flat `p-4` against
`.shell`'s clamped gutter, and the flow now uses `.shell`, so they match. On desktop a form
column is deliberately narrower than a reading column; that is not drift and was left alone.

## Delight — the seal, for real (2026-08-28)

**Thesis:** the moment this product does something clever on a visitor's behalf — remembers
them, writes their record, or closes out their visit — it says so plainly and shows its work,
instead of staying silent or generic. Three touches, all reusing mechanism the product already
has, none inventing new visual language:

**The seal, played for real.** `components/landing/RecordPanel.tsx` has always dramatized "a
record being written, then sealed" (`animate-seal-sweep` then `animate-seal-lock`) as a
marketing illustration — an *example* record, captioned as such. `CheckInOutClient` never
played that motion for an actual visitor's actual write. It now does: the location card gets
the sweep, and the "Checked In" chip locks into place after it passes, at the exact moment a
check-in is genuinely written — `handleCheckIn` success, a passkey `onAuthenticated`, and a
live `useLogRealtime` `'in'` event. A new `justCheckedIn` flag gates it and is deliberately
**not** set on session-restore (`checkOpenLog` finding an already-open log on mount), so
reloading an already-checked-in page never replays it — the animation depicts a write, and
only fires for one. Reduced motion collapses both classes to their existing 0.2s fade-only
fallback (`app/globals.css`'s established policy); nothing new was added there.

**Welcome back.** The `checkin` step had no `<h2>` at all — a real gap, since focus management
sends `stepHeadingRef` there on every other step. It now reads "Welcome back, {first name}" for
a visitor whose session was already on file at mount (identity skipped entirely), or "Ready to
check in" for a first-timer, with a matching one-line sub-copy. Closes the heading gap and
gives the frictionless-recognition mechanism ("Zero-friction check-ins") a visible moment
instead of silently skipping the form. `stepAnnouncement`'s sr-only text carries the same
distinction for screen-reader users.

**A receipt on the way out.** "All done!" previously stated only the location, never the
duration — despite the flow already computing it live via `formatDuration` for the in-progress
ticker. `lastStayDuration` is captured from `openLog.timestamp` at each of the three checkout
paths (button, passkey, realtime) right before the log is cleared, and rendered as "You were
here for {duration}." Omitted below one minute, where `formatDuration`'s `"0m"` would read as
broken rather than true. The icon circle gets `animate-notice` (the project's existing "state
change the reader must not miss" fade), reused rather than invented.

### Verified
Typecheck: zero errors in `CheckInOut.tsx` (pre-existing generated-route and test-file error
count unchanged at 32). Detector: clean (`[]`) on the changed file. Tests: 124/124 pass
(`npm test`, vitest). Live: first-time visitor flow confirmed end-to-end in a real browser
against seeded data — "Ready to check in" renders correctly, screenshot matches DESIGN.md
(pill radii, gradient tile, typography scale). The sweep-then-lock sequencing was confirmed by
pausing the Web Animations API mid-timeline (`t=700ms`): the sweep is mid-crossing and the chip
has not yet appeared, matching `RecordPanel`'s own sequencing exactly.

**Not exercised live:** an actual `POST /api/logs` write, and therefore the returning-visitor
and checked-out receipt branches. This dev environment's `.env.local` sets
`NEXTAUTH_URL=http://localhost:$PORT` — dotenv does not expand `$PORT`, so `lib/csrf.ts`'s
`assertSameOrigin` compares the browser's real `Origin` against the literal string
`http://localhost:$PORT` and 403s every state-changing request on this port. Pre-existing,
unrelated to this pass — flagged rather than fixed, since silently rewriting a teammate's local
env file as a side effect of a design task is out of scope. A second `next dev` on a scratch
port to work around it was tried and abandoned: two dev servers sharing one project's `.next`
directory fed each other's file-watchers into a rebuild loop (continuous "Fast Refresh
rebuilding," 404s on hot-update chunks, an "Invalid or unexpected token" page). The
returning-visitor heading and receipt line are otherwise identical in shape to the
already-verified first-timer heading — same component, same conditional-render pattern — and
share its confirmation.
