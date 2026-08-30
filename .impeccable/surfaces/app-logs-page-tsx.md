---
version: 1
slug: "app-logs-page-tsx"
primary_target: "app/logs/page.tsx"
related_targets: ["app/admin/logs/page.tsx"]
---

# Surface brief — Guest logs (`app/logs/page.tsx`)

## Mode
**Operate.** A staff member reviewing their own check-in history — scanability and
correctness of the record outrank expression.

## Visual world
The Glass Vault (DESIGN.md), unchanged — this page uses the app's neutral console
chrome, not the marketing/hero treatment.

## Audit + remediation (2026-08-30)

Technical audit (`/impeccable audit`) scored this page — paired with the already-compliant
`app/admin/logs/page.tsx` as reference — at 12/20. Findings and fixes:

**Location-type badges hardcoded the brand's own Signal hues.** `typeColors` mapped
`room`/`floor`/`building` to `sky-500`/`cyan-500`/`amber-500` — the literal brand gradient
hues, on a mundane per-row badge, violating DESIGN.md's One Signal Rule (the gradient is
the *only* chromatic voice per screen) and bypassing tokens entirely (no dark variant).
Replaced with the same `bg-muted text-foreground` treatment `app/admin/logs/page.tsx`
already uses for the identical badge.

**The "In" status pill used a raw `-500` hue for text.** `text-emerald-500` on
`bg-emerald-500/10` — DESIGN.md's Foreground-Pairs rule is explicit that a raw `-500` is
for graphic fills only, "never for text," because it has no verified dark-mode contrast
pair. Now `text-[var(--status-success)] bg-[var(--status-success)]/10`, which carries a
defined light/dark pair in `globals.css`.

**Empty-state icon** was a raw inline SVG on a hardcoded `bg-sky-500/10 text-sky-500` tile —
replaced with `ClipboardList` (lucide-react) on `bg-muted text-foreground`, matching the
icon vocabulary the rest of the console standardized on.

**Avatar swatch** mixed the `accent` token with a raw `cyan-600` — normalized to a flat
`bg-accent/15 text-accent` fill.

Verified: detector clean, typecheck unchanged (0 new errors against the pre-existing
12-error baseline), 124/124 tests, and both light and dark mode confirmed live via
Playwright + `getComputedStyle` — the type badge computes `oklch(0.9911 0 0)` text on
`oklch(0.274 0.006 286.033)` background in dark mode, the same surface-muted-dark pair
DESIGN.md documents.

## Related
`app/admin/logs/page.tsx` — the reference implementation this page was brought in line
with (already compliant: tokens, outlined status pill, lucide icons throughout).
