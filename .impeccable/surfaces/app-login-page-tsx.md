---
version: 1
slug: "app-login-page-tsx"
primary_target: "app/login/page.tsx"
related_targets: ["app/register/page.tsx","components/auth/AuthLayout.tsx"]
---

# Surface brief — Auth (`app/login`, `app/register`)

## Mode
**Operate.** Someone is trying to get in. The form is the product; expression is the frame.

## Visual world
**The Glass Vault**, inherited wholesale from the landing via `components/auth/AuthLayout.tsx`:
same two atmosphere layers, same `.shell` spine, same glass panel, same `gradient-cta`
primary, same tokens. Both surfaces share one layout component so they cannot drift apart.

## Direction (2026-08-23)
1. **The saturated split-panel is gone.** The old left panel was a full-bleed
   `sky-700 → cyan-700 → teal-700` field — the exact "large fields of saturated cyan"
   DESIGN.md forbids — and carried white text at 3.47:1 with a `white/40` copyright at
   2.12:1. Replaced by the landing's quiet ground plus an honest supporting column.
2. **One voice.** The invented taglines ("Enterprise Check-In Engine", "Secure, real-time
   visitor logging…", "Enterprise grade.") are replaced by the landing's committed hero
   clause and its three factual anchors. No new claims; nothing fabricated.
3. **Task first on mobile.** The form card is ordered above the headline below `lg`, so a
   returning user never scrolls past an argument to reach the field.
4. **Register mirrors login exactly.** Same frame, same card, same error shape.

## Systemic fixes this surface forced
- `components/ui/input.tsx` — the adapter derived the accessible name from the
  **placeholder**, and React Aria propagates a TextField's `aria-label` onto the input,
  where it outranks `<label for>`. Every field in the app was misnamed (the password field
  announced as "••••••••"). The visible Label is now authoritative via `aria-labelledby`.
- `--field-border` / `--field-border-width` — HeroUI ships `transparent` / `0px`, so a
  filled field sat on the panel at 1.10:1 with no perceivable boundary (WCAG 1.4.11).
- `--status-danger`, `--status-warning` — DESIGN.md documents the pairs; they were never
  real, so both surfaces hardcoded `text-red-500` (3.04:1 on its own wash) and
  `text-amber-600` (2.92:1).

## Constraints carried
- `useSearchParams` must stay inside a Suspense boundary or `next build` fails the route.
- Register's password hint mirrors the server's `RegisterSchema` (min 8) — never state a
  rule the API does not enforce.
- The register API responds neutrally for existing-but-unverified accounts; the success
  copy stays neutral so the UI does not leak account existence.

## Related
`app/landing/page.tsx`, `components/auth/AuthLayout.tsx`, `components/auth/FormNotice.tsx`,
`components/ui/input.tsx`, `components/ui/label.tsx`.

## Motion (2026-08-23)

Operate, so motion is feedback and continuity only — never page-load choreography a
returning user has to sit through. There is no entrance animation on the form.

- **Notice entrance** (`animate-notice`, 220ms): an error or verify-prompt appearing is a
  state change the reader must not miss.
- **Register form → confirmation** (`animate-panel-swap`, 400ms): a view change inside the
  same card, crossfaded so the confirmation reads as the form's outcome rather than a new
  page.
- **Press feedback** (`.press`): 160ms in, 90ms out — exits faster than entrances.
- **Theme toggle**: both glyphs stay mounted and stacked so the swap can transition;
  swapping the element could only ever snap.

Shared vocabulary lives in `app/globals.css` under Motion, keyed to `--ease-out-expo`.

## Layout — one screen (2026-08-23)

Both surfaces fit the viewport exactly, verified at 8 viewports each from
1440x900 down to 360x640, plus 1440x620 and iPhone SE.

**The cause of the scrolling was not the content.** The atmosphere layer was
`h-[115vh] min-h-[820px]`, copied from the landing where the page is long anyway.
An absolutely-positioned child still extends its scroll container, so a 900px
viewport produced a 1035px page while the content itself measured only 729px. It
is now `inset-0` — sized to the frame, never beyond it.

**Structure:** the frame is a flex column at `.min-h-screen-safe`, header fixed,
`main` takes the remainder and centres. `svh` (not `vh`) is the unit, so the page
still fits at the moment mobile browser chrome expands — which is exactly when
`100vh` overflows.

**The supporting column is desktop-only.** On a phone the card is the whole job,
and that column exists to fill width that would otherwise sit empty; stacking it
above or below the form only pushed the task off screen.

**Heading levels moved with it.** The aside's tagline is a styled `<p>` and the
task heading inside the card is the `<h1>`, so an `<h1>` is on screen at every
size even though the aside is hidden below `lg`. Verified at 1440 and 390.

**Height-responsive rhythm** (`.auth-stack`, `.auth-fields`, `.auth-card`) lets a
four-field form tighten on a 620px window without being cramped on a normal one.
The password requirement moved onto the label row — read before typing rather
than after, and one line shorter.

**It never clips.** At ~200% text the page scrolls normally (2026px against a
700px viewport), `overflow-y: visible`, submit reachable. Fitting the screen is
the default, not a cage.
