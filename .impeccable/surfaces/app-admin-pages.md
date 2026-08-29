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
