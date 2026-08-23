---
version: 1
slug: "app-landing-page-tsx"
primary_target: "app/landing/page.tsx"
related_targets: ["app/scan/page.tsx"]
---

# Surface brief — Landing (`app/landing/page.tsx`)

## Mode
**Persuade.** The visitor decides and acts. Success is the right person through the right
door: staff/admins → `/login`, one-time visitors → `/scan`. This is an internal tool's
front door, so "persuade" means *route with conviction*, not sell.

## Visual world
**Preserved — the Glass Vault** (DESIGN.md, unchanged). Cyan→teal signal, shield mark,
translucent panels, calm deliberate motion. The redesign replaces the *layout* and the
*signature component*, not the identity.

## Direction (2026-08-22)
Objective: read faster, read more secure, read modern, and use the full width.

1. **Wide.** One shell (`--shell: 1440px`) replaces three stacked container widths
   (896/1024/1152). Hero is asymmetric — argument left, artifact right — instead of a
   centered column that leaves half of a 1920 screen empty.
2. **Fast, measurably.** Page is a server component; motion lives in small client
   islands. No `initial="hidden"` above the fold, so the hero paints from HTML instead of
   waiting on hydration. `LazyMotion` + `m` replaces the full framer-motion build.
3. **Secure, shown not claimed.** The hero artifact is the **anatomy of one log record** —
   real schema fields from CLAUDE.md (`device_id`, `geofence_status`, server timestamp,
   sha-256 idempotency key, `relatedLogId`). Immutability is demonstrated, not asserted.
4. **The locating field stays** (user call, 2026-08-22 — they read the dot field as a
   location pin / locating motif, and they are right: a probe with a radius that lights
   the points inside it is the `geofence_status` check the engine runs on every write).
   Kept, but rebuilt for cost: pre-rendered glow sprite instead of `ctx.shadowBlur`,
   density down, DPR capped at 1.5, and the loop gated on viewport + tab visibility +
   `(pointer: fine)`. It is anchored to the hero rather than fixed to the viewport, so it
   scrolls away from the text-dense sections and the loop genuinely stops. Touch devices
   paint one static frame and never start a loop. Measured: ~3% of main-thread script
   during continuous probing at 1600x1000.

5. **Two background layers, not four** (user call, 2026-08-22 — the ruling's vertical
   rules read as table columns, and it was one grid too many). The atmosphere is now a
   single `.ambient-wash` gradient plus the field. The dot grid is the only structure;
   the ledger ruling is gone. The two large `blur-3xl` circles were folded into that one
   gradient, so the page now paints **zero CSS blur filters**. `/scan` carries the same
   two layers, so the visitor's door and the console's door finally agree.

## Constraints carried
- Never fabricate proof. The four constants (12h / 15s / 256 / 100%) are real system
  values; the record panel is a labelled schema illustration, not a live feed.
- Admin-first when priorities conflict (PRODUCT.md principle 3).
- One Signal Rule; gradient flows 135° sky→cyan→teal, never reversed.
- HeroUI v3 primitives via `components/ui/*`; `onPress`/`isDisabled`.

## Craft-floor reconciliations
- **Gradient text kept** on one hero clause — DESIGN.md's Split-Clause Headline Rule is a
  committed visual world and overrides the floor's default. Stops deepened to clear
  contrast in both themes.
- **Eyebrows removed.** The floor bans kickers above headings outright, and the brief does
  not earn them back. The uppercase micro-label survives only as standalone metadata
  (record field names, section labels), never stacked above a heading.
- **Stat cards retired.** The four constants move into a spec row, avoiding the
  hero-metric template.

## Related
`app/scan/page.tsx` (the visitor door — shares the atmosphere, must stay consistent).

## Motion (2026-08-23)

**Focal — "the record seals."** One authored sequence, in `RecordPanel`: the rows land in
a capped cascade (~0.24s total), the accent sweep crosses as the sealing pass, and the
append-only chip locks behind it as the sweep's consequence. ~1.5s end to end, once, never
loops. It depicts the write path the engine actually performs, so removing it would lose
meaning rather than decoration.

**The hero is deliberately not animated.** It is the LCP element; entrance motion there
would undo the work that made it paint from HTML.

**Everything is CSS.** The framer-motion reveals that were removed shipped `opacity: 0` in
the SSR HTML and only resolved after hydration. A keyframe animation runs without JS, so
an entrance can never strand the page invisible. Verified: 0 inline `opacity:0` in SSR on
all three surfaces.

**Budget:** transform/opacity only, nothing loops (0 running animations 3s after load,
and scrolling away and back does not retrigger), no layout-driving properties animated.

**Reduced motion:** movement goes, meaning stays — rows and chip resolve through
`fade-only`, the sweep is off, press feedback stops travelling but still confirms. A
blanket `animation: none` would have deleted the feedback along with the decoration.
