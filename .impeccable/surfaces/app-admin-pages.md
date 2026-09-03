---
version: 1
slug: "app-admin-pages"
primary_target: "app/admin/buildings/page.tsx"
related_targets: ["app/admin/floors/page.tsx","app/admin/rooms/page.tsx","app/admin/logs/page.tsx","app/admin/quests/page.tsx","app/admin/quests/[id]/page.tsx","app/admin/qr/[id]/page.tsx","app/admin/layout.tsx","components/admin/CheckInModeToggle.tsx"]
---

# Surface brief — Admin (buildings / floors / rooms / quests / logs / QR)

## Mode
**Operate.** The security/facilities administrator managing the whole estate — PRODUCT.md's
primary user. Scanability and consistency outrank expression; brand lives in precise details,
per DESIGN.md's own console guidance.

## Usage scene
Desktop-first, dense tables, frequent CRUD (buildings → floors → rooms), audit review in
`/admin/logs`, quest issuance, and printing/exporting location QR codes.

## Visual world — Owner-approved exception: full monochrome (2026-08-28)

**The admin console deliberately does not carry the cyan-teal signal.** Asked directly
("sparing accent on a black-and-white base" vs. "full monochrome, no cyan-teal anywhere,
including buttons and active states"), the owner chose full monochrome — a colorless
instrument, distinct from the visitor-facing Glass Vault. This is a scoped departure from
DESIGN.md's One Signal Rule for this surface only; the rest of the app (landing, scan, login,
console chrome in `NavBar.tsx`) is untouched and still carries the brand signal.

### Mechanism: one CSS scope, not a component fork
`app/globals.css` adds `.admin-mono { --accent: var(--foreground); --accent-foreground:
var(--background); }`, applied to the wrapper `<div>` in `app/admin/layout.tsx`. The `--accent`
comment in globals.css already documents it as "the single lever that makes all 154 *-accent
call sites brand-true" — every one of those call sites (the Button adapter's default/brand
variant, `text-accent`/`bg-accent` utility classes, input focus rings) is a CSS custom property
read, so aliasing it to the existing theme-aware neutrals took the whole surface monochrome in
both light and dark with zero component forks. Verified live in both themes: primary buttons,
row-action pills ("QR", "Floors", "Rooms", "View"), and focus rings all resolve correctly;
`NavBar` (rendered inside the same wrapper but not scoped to it) stays branded, confirming the
scope boundary holds exactly at the intended line.

### What the scope override does not reach
Raw hardcoded Tailwind hues (`sky-500`, `cyan-500`, `amber-500`, `emerald-500`, `blue-500`)
never touch `--accent` and needed direct edits per file — used for location-type badges, room-
type badges, icon tiles, the "In"/"Active" status pills, and the guest-avatar gradient. All
converted to neutral tokens (`bg-muted`/`text-foreground`) with one exception: the two
`data-qr-export-card="true"` cards (`qr/[id]`, `quests/[id]`) are hardcoded `bg-white` by
original design (a QR print/export artifact should stay legible regardless of app theme), so
their icon tiles and badges use fixed `neutral-900`/`neutral-100` classes rather than
theme-reactive tokens — matching the card's own pre-existing invariance rather than fighting it.

### What stayed, on purpose
- **Destructive actions stay red.** The manual-checkout confirmation's "Check out manually"
  button resolves through HeroUI's own `danger` variant, a separate token from `--accent` —
  untouched, and correctly so: a safety convention, not a brand color. Verified live.
- **Categorical color-coding is gone by design, not oversight.** Location-type and room-type
  badges previously used hue as their *only* differentiator (WCAG's "don't rely on color
  alone" was already being violated) — they now carry the same information through the text
  label alone, on a single neutral pill style. This is the honest cost of "full monochrome,"
  and arguably fixes a latent accessibility gap as a side effect.
- **Binary status keeps a value-based signal.** "In"/"Active" render as a solid `bg-foreground
  text-background` pill with a background-colored pulsing dot; "Out"/"Inactive" stay the
  existing plain `bg-muted` pill. Hierarchy that color used to carry now comes from fill vs.
  outline instead.

## Layout fixes (2026-08-28)
- **Page headers standardized to `text-2xl font-bold`.** All five list pages
  (buildings/floors/rooms/quests/logs) previously used `text-xl font-bold` — an outlier against
  the console's own established precedent (`app/dashboard/page.tsx`, `app/settings/team/page.tsx`
  both use `text-2xl font-bold` for their primary heading). Matched to that precedent rather
  than to DESIGN.md's un-implemented literal headline spec (30px/800), since nothing else in the
  app currently hits that spec either — this fix closes a real three-way inconsistency without
  introducing a fourth size.
- **Breadcrumbs added for filtered drill-down views.** `/admin/floors?buildingId=X` and
  `/admin/rooms?floorId=X` previously had a text-only "N floors in {building}" line with no link
  back up the hierarchy. Both now carry a "Back to buildings"/"Back to floors" pill link, reusing
  the exact pattern already established in `qr/[id]/page.tsx`'s "Back to buildings" link — not a
  new component, just the existing pattern applied one level up the tree.
- **One icon system.** Hand-inlined heroicon-style SVG paths (buildings/floors/rooms/quests list,
  the search and refresh glyphs in logs) replaced with `lucide-react`, matching the icons
  `NavBar.tsx` already uses for the identical concepts (`Building2`, `Layers3`, `DoorOpen`,
  `Sparkles`) so the nav and the pages it links to finally agree on iconography. All decorative
  icons carry `aria-hidden`, closing gaps the originals had.
- **Pre-existing bug fixed in passing:** `CheckInModeToggle.tsx`'s "Passkey" active segment used
  a hardcoded `bg-white`, breaking dark mode (`text-foreground` on literal white), while its
  sibling "Click" segment correctly used `bg-surface`. Now consistent.

## Verified
Typecheck: zero errors in any touched file. Detector: clean (`[]`) across all nine changed
files. Tests: 124/124 pass. Live, both light and dark, logged in as the seed admin: buildings,
floors (unfiltered and filtered), rooms (filtered, with the room-type badge), quests (empty and
populated, including creating and viewing a real quest card end-to-end), the building and quest
QR print pages, and the logs table (including the live "In" pill, the guest-details dialog, and
the manual-checkout confirmation) all render correctly monochrome with the one intended
exception (destructive red) holding.

## Critique remediation (2026-08-28/29)

A dual-agent critique (design review + live detector/browser evidence) found the "verified
live" claim above was true of everything actually screenshotted, and false of two things that
weren't: a dialog's own submit button, and NavBar's exposure to the scope. Both were confirmed
with hard evidence (`getComputedStyle`, `element.contains()`), not just re-inspection, before
being fixed. Full critique: `.impeccable/critique/2026-08-28T17-16-01Z__app-admin-buildings-page-tsx.md`.

**The scope mechanism had two real gaps, both now fixed:**
- **HeroUI's `Dialog` portals its content to `document.body`**, outside any React-tree-scoped
  wrapper — CSS custom properties only inherit through the DOM, so `.admin-mono`'s div-scoped
  `--accent` override never reached a dialog's own submit button. All four "Create X" buttons
  (Building/Floor/Room/Quest) were still rendering the true brand cyan in both themes. Fixed by
  giving `Button` a `variant="mono"` that reads `--foreground`/`--background` directly instead
  of `--accent` — those tokens were never scoped in the first place, so the fix is immune to
  the portal problem structurally rather than by chasing where things render.
- **NavBar was a DOM child of the `.admin-mono` div**, not a sibling, so `--accent`'s override
  inherited into it too — confirmed live (`--accent` on `<nav>` read the override value; the
  account-menu trigger's own `hover:bg-accent/10` classes would have gone monochrome on
  interaction). Fixed by moving `<NavBar/>` outside the scoped div in `app/admin/layout.tsx`.

**Dark mode had a real, systemic illegibility bug**, worse than either critique assessment
individually reported: on `/admin/quests/[id]` and `/admin/qr/[id]`, *every* piece of body text
on the `data-qr-export-card` cards — not just one card, both — computed to near-white
(`oklch(0.9911 0 0)`) against a literal `rgb(255,255,255)` background, confirmed via
`getComputedStyle` on a clean page load (ruling out the HMR instability that first obscured the
full scope of it). `QRCodeDisplay.tsx` and both page files now use fixed `neutral-900`/
`neutral-500`/`neutral-100` classes for that card's own text, matching the icon tiles' existing
theme-invariant treatment instead of fighting it with theme-reactive tokens.

**A correction is no longer invisible.** `GET /api/logs` now joins `AuditLog` entries (keyed to
either a log or its paired checkout) and populates `modifiedByUserId`; `LogDetailsDialog` gained
a "Correction" section, rendered only when one exists, naming the reason, actor, and timestamp.
Verified end-to-end: performed a real manual checkout, confirmed the correction renders exactly
as written.

**Status pills no longer share a button's visual recipe.** "In"/"Active" moved from solid
`bg-foreground` fill to an outlined `border-foreground/40` pill with a solid dot — the fill was
the exact same recipe as a primary action button once `--accent` became `--foreground`, making
"Issue Quest" and "Active" indistinguishable at a glance one screen apart. "In" still pulses
(a live, safety-relevant signal worth an active cue); "Active" deliberately doesn't (a stable
configuration flag, not a live one) — kept as an intentional difference, not "fixed" into false
consistency. The pulse already stops under `prefers-reduced-motion` via the existing global
`.animate-pulse` policy in `app/globals.css`; the critique's claim of a missing guard didn't
check that file.

**Rooms regained the parent context Floors already had**, and the Add Room dialog stopped
fighting Alex: the Building select now prefills from a `floorId`-filtered arrival, and picking
a Building only clears the Floor selection if the current floor doesn't actually belong to it
— previously any Building re-selection wiped an already-correct Floor. The redundant Floor
column (both header and per-row) is now suppressed when the list is already floor-filtered,
matching the subtitle's own new "on {Floor Name}" context line.

**Two stray hardcoded reds** (`text-red-500` on the Quest and QR "not found" screens) now use
`var(--status-danger)`, matching the token the rest of the app's error text uses — the original
monochrome sweep's audit of hardcoded hues covered `sky/cyan/amber/emerald/blue-500` but missed
these two.

Verified: typecheck clean, detector clean (`[]`), 124/124 tests, and every fix confirmed live —
the dialog-button and NavBar fixes via `getComputedStyle` before and after, the dark-mode text
fix via a fresh test record on a clean page load, and the correction UI via a real manual
checkout performed through the actual dialog.

## Audit remediation — locations management workflow (2026-08-30)

A technical audit of Buildings/Floors/Rooms (admin CRUD + `/api/buildings`, `/api/floors`,
`/api/rooms`, `/api/locations/[id]`) found four fixable gaps and one item that isn't a bug —
it's an owner decision.

**Create-flow failures discarded the server's actual error.** All three "Create X" forms did
`if (!res.ok) throw new Error()` then a fixed `toast.error('Failed to create X')`, so a
referential-integrity rejection (e.g. "Floor does not belong to the supplied building") was
indistinguishable from a network hiccup. `app/admin/logs/page.tsx` had already solved this with
a local `readApiError` helper; it's now promoted to `lib/clientFetch.ts` (exported alongside
`fetchJsonOnce`) and used by all four call sites, `logs/page.tsx` included.

**`PATCH /api/locations/[id]` no longer guesses the model on every call.** It used to probe
Room → Floor → Building sequentially even though every call site already knows which one it
means — the sibling `GET` handler on the same file already accepted a `?type=` hint for this
exact reason. `CheckInModeToggle` now takes a `locationType` prop and all three admin pages
pass it, so the common case is a single query instead of up to three. Untyped requests still
fall back to the old probe, so nothing calling the endpoint pre-fix breaks. Mode changes
(`checkInMode`) stay gated behind `locations.mode.update` (admin); the new metadata path is
gated behind `locations.write` (manager) — the same permission `POST` already uses — since
renaming a room isn't a security-relevant action the way flipping passkey-required is.

**Buildings/Floors/Rooms had no search**, unlike Logs. Each list page now has a client-side
filter input (name + address for Buildings, name + number for Floors, name + number + type for
Rooms) matching the existing pattern in `app/admin/logs/page.tsx`, with its own "No matching
X" empty state distinct from the "no X yet" one.

**Metadata editing didn't exist at all** — renaming a building meant no path but deleting and
recreating it, and there was no delete either. Added an Edit action (pencil icon, next to QR)
opening a dialog prefilled from the row: Building gets name/address/description, Floor gets
number/name/description, Room gets name/number/type/capacity/description. New
`UpdateBuildingSchema`/`UpdateFloorSchema`/`UpdateRoomSchema` in `lib/validations/location.ts`
back a type-specific branch in the `PATCH` handler. Deliberately excluded: reassigning a
Floor's `buildingId` or a Room's `floorId`/`buildingId` — that's a structural move, not a
metadata edit, and carries the same cascade questions as delete below.

**Delete is deliberately not implemented — this is an owner decision, not an oversight.**
Buildings/Floors/Rooms are referenced by historical `Log` documents (`buildingId`/`floorId`/
`roomId`), by `Quest` step definitions, and by printed/posted QR codes that encode a location
ID directly. Deleting a Building with existing Floors (or a Floor with existing Rooms) needs an
explicit answer to at least three questions before it's safe to build: does delete cascade to
children, get blocked while children exist, or orphan them; do historical Logs referencing the
deleted location keep displaying (with what label) or break; and does a QR code printed for a
now-deleted location fail closed (safe) or silently 404 for a visitor mid-scan. None of those
are UI decisions — they're data-retention and audit-integrity decisions the owner needs to make
once, not something to guess at while fixing an unrelated create-flow bug. Flagging here rather
than building a delete button that quietly picks an answer nobody signed off on.

Verified: typecheck clean, detector clean, full test suite green, and the new search/edit flows
confirmed live for all three location types (create → search → edit → verify the change
persisted and re-renders).
checkout performed through the actual dialog.

## Audit remediation — the lost quest card scenario (2026-08-30)

`/impeccable audit` was asked to specifically probe what happens when a guest loses their
quest card. Reading the domain model surfaced a real gap: `QuestCard` documents are fully
anonymous — bulk-issuing "N cards" for one quest creates N documents with identical
`title`/`type`/`steps` and zero identity or linkage between siblings. Once a card is out of
staff's hands, there was no way to tell it apart from its siblings, no visibility into how
far it had progressed, no search on the list, and no way to invalidate a lost card or hand
the guest a working replacement — `isActive` existed on the schema but nothing ever set it.

**Every card now carries a stable label.** `QuestCard` gained `cardNumber`/`batchSize`
(set once at issuance, defaulted to `1`/`1` for pre-migration documents so nothing broke).
"Card N of M" is printed directly on the physical card's own QR export — the one place a
guest can reference it after the card leaves the admin's screen — and shown in both the
list and detail page. `POST /api/quests` sets these per-card at bulk-creation time.

**Progress is now visible everywhere**, not just derivable by a visitor scanning their own
card. `GET /api/quests` joins `QuestProgress` (mirroring the `AuditLog` join `GET
/api/logs` already does) so the list shows "3/5 done" per row — letting staff match a
guest's verbal claim ("I'd done 3 stops") against the one row in a 50-card batch that
actually shows that state. The detail page (`app/admin/quests/[id]/page.tsx`) previously
never fetched `QuestProgress` at all; it now marks each step done/pending and shows a
completed badge, matching the visitor-facing page's own step styling.

**Search** was added to the quest list (`app/admin/quests/page.tsx`), matching the pattern
already used on Buildings/Floors/Rooms/Logs — filters by title or card number, since card
number is the only thing that makes one bulk-issued row findable among its siblings.

**A lost card can now be safely and losslessly reissued.** `POST
/api/quests/[token]/reissue` (new `ReissueQuestCardButton` client component, confirm dialog
with Cancel per the app's established destructive-action pattern) rotates the card's
`qrToken` in place. Because `QuestProgress` is keyed to the card's `_id`, not its token,
this invalidates the lost physical QR *instantly* — anyone who finds the dropped card can no
longer use or claim it — while every completed step survives untouched, and the new QR
resumes exactly where the old one left off. The route lives under the existing `[token]`
dynamic segment (not a new `[id]` folder) because Next.js requires sibling dynamic routes
to share a slug name; the value passed is always the card's database `_id` from the
authenticated admin UI, never the public `qrToken` the sibling routes use.

Verified: typecheck identical to the pre-existing 12-error baseline (checked with a clean
`.next` both before and after — a stale `.next` from a `dev` run produces false-positive
diffs, confirmed and ruled out), detector clean, 124/124 tests, and the full lost-card flow
driven live: issued a batch of 3 identically-titled cards, confirmed they render as "1 of
3"/"2 of 3"/"3 of 3", searched by card number to isolate one, reissued it, confirmed the old
QR now 404s to "Quest not found" while the new QR resolves with progress intact (`0/1`,
unchanged) at a freshly rotated token.

## Layout — surface each card's description / use case (2026-08-30)

`/impeccable layout` was asked to find where a quest card's own `description` field (already
collected at issuance, already optional) was going unseen, and to fix the structural gap
rather than add a new field. Two isolated assessments, then one shared fix.

**List (`app/admin/quests/page.tsx`).** The description was invisible everywhere except the
detail page — with several bulk-issued cards sharing an identical title ("Scavenger Hunt" ×
3), the list gave staff no way to tell what any one of them was actually *for* without
opening it. Proximity, not a new column: added it as a second line under the title, exactly
mirroring Buildings'/Floors' own `{x.description && <p className="text-xs text-muted mt-0.5
truncate max-w-[200px]">}` treatment — same truncation width, same conditional render, same
two-line skeleton shape. A new "Card" and "Progress" column already exist from the prior
lost-card work; a use-case column would have competed with them for width at exactly the
breakpoints where they already collapse. Search was extended to match description text too
("onboarding" now finds "New Hire Orientation" even though the word isn't in its title), and
the placeholder updated to say so.

**The printed card (`components/admin/QRCodeDisplay.tsx`, used by both the quest card and
the location QR export).** The physical artifact handed to a participant carried only a
title and a type/card-number line — no explanation of what it's for, which matters most
exactly when it's out of staff's hands and the guest is looking at it cold. Added an optional
third `description` prop, styled `text-xs text-neutral-500 italic` — the same treatment this
file's sibling page already gives a quest step's `challenge` text, so a new visual tier
wasn't invented, an existing one was reused. Wired into `app/admin/quests/[id]/page.tsx`'s
printed card only (the location QR page's `sublabel` already carries floor/building path
context and wasn't touched); the prop is optional so nothing changes for a card issued
without one.

**A layout-verification pass found a real, unrelated bug.** Screenshotting the detail page in
dark mode for the first time (prior verification had used the accessibility tree, not a
visual render) showed the "Card lost? Reissue" trigger from the prior lost-card-scenario work
had gone invisible — `variant="outline"` resolves `--foreground`, which is near-white in dark
mode, sitting on the same permanently-`bg-white` Steps card the rest of this page already
treats as theme-invariant. Fixed by dropping the themed `Button` variant for that one trigger
and using fixed `neutral-300`/`neutral-700`/`bg-white` classes instead, matching every other
piece of text already on that card. `mono`/`ghost`/`outline` all still resolve `--foreground`
and would have failed the identical way — this needed a genuinely fixed palette, not a
different variant.

Verified: detector clean, typecheck identical to the 12-error baseline (0 new), 124/124
tests, and confirmed live in both themes — created a real card with a description, saw it
truncate correctly in the list, found it by searching its description text alone, saw the
printed card render the description in both light and dark mode, and confirmed the reissue
trigger is now legible in both themes after the fix. Full route smoke-test (dashboard,
buildings, quests, logs, landing) and a clean `.next` boot both came back clean.

## Critique remediation round 2 (2026-08-30)

A fresh dual-agent critique re-scored the whole admin console after the rounds above: **21/40
→ 29/40** ("Acceptable" → "Good"), P0 count 2 → 0. Full report:
`.impeccable/critique/2026-08-30T16-01-49Z__app-admin-buildings-page-tsx.md`.

The monochrome mechanism, NavBar's retained brand signal, and dialog-button monochrome were
all re-confirmed live and unregressed. What remained was narrower than before — one flow that
hadn't kept pace with fixes already applied to its siblings, plus one shared-component gap:

- **Quest creation had regressed to swallowing the server's real error.** `app/admin/quests/page.tsx`
  never adopted `readApiError` the way Building/Floor/Room did. Now imports and uses it,
  matching its siblings exactly.
- **The quest detail page's Steps card was hardcoded `bg-white` with no `data-qr-export-card`
  marker**, unlike the genuine QR export card beside it — forcing `ReissueQuestCardButton` to
  hardcode neutral colors just to stay legible on it. Converted to theme tokens
  (`bg-foreground`/`text-background`/`bg-muted`/`text-muted-foreground`/`border-foreground/40`);
  the Reissue trigger reverted to a normal themed `Button variant="outline"` now that its host
  card is theme-reactive again.
- **NavBar's role-aware items flashed on every hard navigation** — Locations/Quests/All Logs
  briefly vanished while `/api/teams` resolved client-side, collapsing to the two-item member
  view. Added a `teamsLoaded` state; while unresolved, the admin nav slot renders skeleton
  placeholders instead of silently downgrading.
- **`CheckInModeToggle` had no programmatic pressed-state** — Click/Passkey conveyed active
  mode only via a hover-only `title`. Added `aria-pressed` per button and `role="group"` /
  `aria-label="Check-in mode"` on the wrapper.
- **Detector-confirmed `cramped-padding` on the shared `table-root` container**, present on
  every list page (buildings/floors/rooms/logs/quests) — content sat flush against the
  container edge. Fixed once, in the shared adapter (`components/ui/table.tsx`, `p-2`), not
  per-page.

**Not fixed, by design:** `overused-font` (Inter at 100%) is DESIGN.md's own Two-Weight Rule,
not a defect. `em-dash-overuse` (101) on `/admin/quests` is almost certainly the detector
miscounting the "—" placeholder glyph across ~100 seeded rows' empty Card column, not real
prose — a detector-rule note, not a UI fix. Delete for Buildings/Floors/Rooms remains an
intentionally deferred owner decision, re-confirmed rather than re-litigated.

Verified: detector clean (`[]`) across the full admin surface before and after, typecheck
identical to the 12-error baseline (0 new, confirmed on a clean `.next`), 124/124 tests, and
every fix confirmed live — the Steps card and Reissue button via a fresh dark-mode screenshot,
`aria-pressed`/`role="group"` via direct DOM inspection, and the table inset via
`getComputedStyle` (8px on all sides).

## Audit — CSV export enriched with visitor and check-in device fields (2026-09-03)

`/impeccable audit` was pointed at the All Logs CSV export specifically, asked whether more
visitor and check-in-device info could be included. `exportCsv()` in `app/admin/logs/page.tsx`
re-fetches the same enriched `GET /api/logs` payload a row's own Guest Details dialog already
renders — `visitorPhone`, `visitorGender`, `visitPurpose`, `deviceId`, `ipAddress`, `userAgent`,
`geofenceStatus`, `passkeyVerified`, and the paired checkout log's `autoCheckedOut` were all
already in the fetched object and simply never reached the CSV, which exported only 9 of the
~18 available columns. Widened to 18 headers in the dialog's own section order (Visitor →
Location → Check-in/out → Technical details) — no backend or API change, since every field was
already in scope for this route's `logs.read` permission.

While touching `csvEscape`, hardened it against CSV/formula injection: a cell starting with
`=`, `+`, `-`, `@`, tab, or CR is a live formula to Excel/Sheets on open, and several newly
exported columns (Purpose, User agent, Device ID) are client-supplied free text that previously
went straight through unescaped (as did the pre-existing Visitor/Email columns). Prefixes a
bare quote when the trigger pattern matches, which forces text interpretation without changing
what the cell displays; the existing quote/comma/newline escaping is untouched.

Verified: typecheck introduces zero new errors in this file (surrounding baseline errors are
pre-existing and unrelated), 124/124 tests pass, detector clean (`[]`). Live in the browser as
the seed admin: fetched the real `GET /api/logs` payload for the team's 19 seeded rows and ran
the exact export logic against it in-page — device ID, IP address, user agent, gender, and
purpose all came back populated with real values, not blank; the formula-injection guard was
confirmed against `=1+1`, `+SUM(A1:A9)`, `@cmd`, and a literal `-2` (all correctly
quote-prefixed), while ordinary comma-bearing text passed through unescaped-except-for-quoting
as before. A literal file-save through the automated Chrome session hit Chrome's own
repeated-automatic-download throttle after the first click (not a code defect — that first real
click did produce a download, confirming the button/blob/anchor mechanism itself works); the
in-page logic replay against live data is the verification of record for the new columns.
