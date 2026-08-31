---
target: My Logs page
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-31T08-46-26Z
slug: app-logs-page-tsx
---
Method: dual-agent (Assessment A: design review · Assessment B: detector + browser evidence), synthesized and resolved in the same session per an explicit /goal directive ("resolve all of recommendations").

## Design Health Score (pre-fix)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | Broken duration value; undisclosed page-scope switch for admins |
| 2 | Match Between System and Real World | 1/4 | "My Logs" showed team-wide data for admins; raw UUID/IP/UA with no framing |
| 3 | User Control and Freedom | 3/4 | Escape closes dialog cleanly; no search/filter |
| 4 | Consistency and Standards | 2/4 | Same data rendered with a different status-pill style than the sibling admin page |
| 5 | Error Prevention | 3/4 | Read-only page, minimal error surface |
| 6 | Recognition Rather Than Recall | 3/4 | Full labels, avatars, location path via title |
| 7 | Flexibility and Efficiency of Use | 1/4 | No sort/search/shortcuts |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean table; malformed duration was visual noise |
| 9 | Help Recognize/Diagnose/Recover from Errors | 0/4 | Empty `catch {}` rendered a false "No logs yet" on fetch failure |
| 10 | Help and Documentation | 0/4 | No context for device/geofence/session-token fields |
| **Total** | | **18/40** | **Poor (pre-fix)** |

## Design-Specificity Verdict
~90% code-shared with `app/admin/logs/page.tsx` with nothing adapted for the "zero-friction personal history" persona vs. the admin audit persona. Most damning: for any team admin/owner, "My Logs" silently dropped the `userId` filter server-side and returned the entire team's check-ins under a header claiming otherwise — a real backend scoping bug, not a cosmetic one.

## Priority Issues (all resolved this session)

- **[P1 — FIXED] "My Logs" showed the whole team's data for admins.** `GET /api/logs` computed `canViewTeam` from role alone, with no way for either page to state its own intended scope. Added `scope=mine` query param that forces user-only filtering regardless of role; My Logs now always sends it. Verified live: table dropped from 17 (team-wide) rows to 2 (this admin's own) rows.
- **[P1 — FIXED] Duration formatter broken.** `durationLabel()` did `Math.round(ms/60000)` with no hour rollup, rendering raw values like "137811m" on 4 of 17 real seed rows. Now reuses the same hour-rollup logic as the detail dialog's `detailDurationLabel()`. Verified live: renders "2m" correctly.
- **[P1 — FIXED] Silent fetch failure indistinguishable from real emptiness.** `fetchLogs()`'s empty `catch {}` fell through to "No logs yet" on any API error. Added explicit `error` state with a distinct "Couldn't load your logs — Try again" panel and retry button.
- **[P2 — FIXED] Raw technical/security fields shown to staff with no framing.** Session token, device ID, IP, user agent, and raw Mongo IDs collapsed behind a "Technical details" `<details>` disclosure, closed by default.
- **[P2 — FIXED] Auto-checked-out entries had no at-a-glance signal.** Added a warning-token badge in the detail dialog's Check-in/Check-out section and a small icon on the row's status pill when `autoCheckedOut` is true.

## Detector findings (Assessment B)

CLI static scan: clean (0). Browser-injected scan (live DOM):
- **Real defect, fixed:** `low-contrast` — avatar-initial circles measured 4.3:1 (need 4.5:1), text `#0e7490` on a `bg-accent/15` tint in light mode. Root cause: the design system's `--accent` token (cyan-700, `#0e7490`) is calibrated for 4.91:1 against plain paper, not against its own 15%-opacity tint. Fixed by switching the avatar swatch to the verified `bg-accent`/`text-accent-foreground` pair (a solid fill with a foreground token DESIGN.md already treats as an accessible pair). Re-measured live: **5.36:1 light / 10.41:1 dark.**
- `ai-color-palette` (cyan gradient hairline + logo tile) and `overused-font` (100% Inter): judged **false positives** — both are DESIGN.md-intentional (One Signal Rule brand cue; the deliberate single-font "Two-Weight Rule" system). Not changed.
- `flat-type-hierarchy`: same call — intentional per the Two-Weight Rule, not changed.

## Verification
- `npx tsc --noEmit`: no new errors (pre-existing unrelated baseline only).
- `npx vitest run`: 124/124 passing.
- Live browser: scope fix, duration fix, contrast fix (measured via `getComputedStyle`), and the Technical Details disclosure all confirmed working in both light and dark mode.
