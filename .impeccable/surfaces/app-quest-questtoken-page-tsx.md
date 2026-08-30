---
version: 1
slug: "app-quest-questtoken-page-tsx"
primary_target: "app/quest/[questToken]/page.tsx"
related_targets: ["components/scanner/QRScanner.tsx","app/scan/page.tsx"]
---

# Surface brief — Quest card scan (`app/quest/[questToken]/page.tsx`)

## Mode
**Operate.** A visitor who scanned a quest card QR, tracking progress through a location
chain. One-time, unauthenticated, phone-first — same usage scene as `/scan`.

## Visual world
The Glass Vault (DESIGN.md). Shares `gradient-primary` and the neutral console tokens
with the rest of the app; no separate visual language of its own.

## Audit + remediation (2026-08-30)

Technical audit (`/impeccable audit`) scored this page 12/20 combined with `app/logs/page.tsx`.
This page carried the more severe finding of the pair:

**The entire page had zero dark-mode handling.** Both the "not found" and success states
used a hardcoded `bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20` — a
light-only background that never switched while the text on top of it (`text-foreground`,
`text-muted`) did, risking illegible combinations for a visitor on a phone in system dark
mode, which is the majority case for a stranger scanning a QR. Replaced with
`bg-background`, matching `components/location/CheckInOut.tsx`'s own page-background
pattern (`bg-background text-foreground`).

**Hardcoded status/type chips**, none with a dark variant: `bg-red-50/text-red-400` on
the not-found icon (→ `bg-muted` + `text-[var(--status-danger)]`, matching the already-fixed
pattern on the admin Quest/QR "not found" screens), `text-sky-600 bg-sky-50` on the quest-type
chip (→ `bg-muted text-foreground`), `text-emerald-700 bg-emerald-100` on "Completed!" and
`bg-emerald-50 border-emerald-200/60` on a done step (→ `var(--status-success)` at 10%/25%
opacity, both with defined light/dark pairs).

**Icon vocabulary drift.** Raw inline SVGs (warning triangle, quest star, scanner grid)
replaced with `lucide-react` (`AlertTriangle`, `Sparkles`, `QrCode`, `CheckCircle2`) — the
same vocabulary `/scan` and the admin pages already standardized on, so a visitor moving
`/quest` → "Open Scanner" → `/scan` sees one consistent icon system, not two.

**Accessibility.** Added a page-level `<h1>` to both render paths (previously the quest
title and "Quest not found" were both bare `<h2>`s with no `<h1>` above them — no
heading-navigation entry point for screen readers). Added `role="progressbar"` +
`aria-valuenow`/`aria-valuemin`/`aria-valuemax` to the progress bar, and `aria-hidden` on
the decorative icons.

Verified: detector clean, typecheck unchanged (0 new errors against the pre-existing
12-error baseline), 124/124 tests, and both the not-found and success states confirmed
live in both light and dark mode via Playwright (created a real quest card through the
admin UI, visited its actual `/quest/<uuid>` link, and forced `prefers-color-scheme`/
`localStorage` theme in both directions).

## Related
`components/location/CheckInOut.tsx` (the background-token precedent this page now
follows), `app/scan/page.tsx` / `components/scanner/QRScanner.tsx` (the icon-vocabulary
precedent and the destination of "Open Scanner").
