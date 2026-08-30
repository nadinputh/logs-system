---
version: 1
slug: "components-location-checkinout-tsx"
primary_target: "components/location/CheckInOut.tsx"
related_targets: ["app/quest/[questToken]/page.tsx","components/scanner/QRScanner.tsx","app/scan/[locationId]/page.tsx"]
---

# Surface brief — Scan quest card after check-in (`components/location/CheckInOut.tsx`)

## Mode
**Operate.** A one-time visitor who just checked in and is also holding a quest card,
trying to get one location step recorded before moving on. Same usage scene as `/scan`.

## Audit + remediation (2026-08-30)

`/impeccable audit` was asked to specifically probe the scan-quest-card-after-check-in
sub-flow: two entry points in this component both call `POST /api/quests/[token]/progress`
after a check-in write — an automatic path (`recordQuestProgress`, fires when the check-in
URL carries `?quest=<token>`) and a manual path (`handleQuestCardScanned`, fires from the
"Scan Quest Card" button → `questScan` step → camera scan). The happy path and theming were
already solid from the earlier delight pass; the gaps were all in error/edge-case handling.

**The automatic path failed completely silently.** `recordQuestProgress`'s `catch {}` was
empty and its non-OK branch did nothing at all — no toast, no state change. A visitor who
checked in via a `?quest=` link with a real problem (wrong step order, deactivated card,
dropped connection) had zero way of knowing their quest step wasn't recorded; the check-in
itself still visibly succeeds. Fixed by extracting a shared `submitQuestProgress(token)`
helper (used by both paths) that always resolves to a toast — success, already-recorded, or
error — so the two entry points can no longer drift out of sync with each other.

**A re-scan of an already-completed step said "recorded!" as if it were new.** The server's
200 "Already recorded" response was shown with the identical `toast.success('Quest step
recorded!')` as a genuinely fresh completion. `submitQuestProgress` now checks
`data.message === 'Already recorded'` and shows a distinct "Already recorded for this stop."

**Scanning something that wasn't a quest-card URL failed silently.** If `/quest/` wasn't in
the scanned URL, `handleQuestCardScanned` just `return`ed with the scanner still open and no
feedback. Now toasts "That doesn't look like a quest card" and returns to the checked-in
step, whether the URL failed to parse at all or simply isn't a quest link.

**One generic catch conflated "bad QR" with "network failure."** The prior single
try/catch wrapped both URL-parsing and the fetch call, so a dropped connection during a
valid scan got the same "Invalid quest card" message as an actually-malformed code — telling
a visitor to blame their physical card for a network hiccup. URL-parsing now fails into the
"not a quest card" message; the network/fetch call fails into "Quest progress failed — check
your connection", a separate, accurate message.

**Cleanup:** `recordQuestProgress` took an unused `token: string` parameter (actually always
the check-in's `logId`, referenced nowhere in the body) at both call sites — dropped.

Verified: typecheck identical to the pre-existing 12-error baseline (0 new), detector clean,
124/124 tests, and the full flow driven live end-to-end: checked in via a real `?quest=`
link, confirmed the `POST .../progress` succeeded and the success toast fired; checked out
and back in with the same completed card, confirmed the server's `{"message":"Already
recorded"}` response and the corresponding client branch; confirmed a clean `.next` boot
with zero server-log errors throughout.

## Related
`app/quest/[questToken]/page.tsx` (the quest card's own view — the "Open Scanner" link into
this same journey), `components/scanner/QRScanner.tsx` (the shared scanner used by the
`questScan` step), `app/scan/[locationId]/page.tsx` (the page that renders this component).
