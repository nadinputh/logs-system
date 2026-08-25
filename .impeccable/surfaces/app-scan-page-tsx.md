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
