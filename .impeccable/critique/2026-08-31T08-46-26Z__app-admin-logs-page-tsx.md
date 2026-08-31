---
target: All Logs page
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-08-31T08-46-26Z
slug: app-admin-logs-page-tsx
---
Method: dual-agent (Assessment A: design review · Assessment B: detector + browser evidence), synthesized and resolved in the same session per an explicit /goal directive ("resolve all of recommendations").

## Design Health Score (pre-fix)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2/4 | Corrections invisible until a row's dialog is opened |
| 2 | Match Between System / Real World | 4/4 | Terminology and section order match an auditor's reasoning |
| 3 | User Control and Freedom | 3/4 | Search had no clear affordance |
| 4 | Consistency and Standards | 4/4 | Reference implementation for the console's table/search/status patterns |
| 5 | Error Prevention | 3/4 | Manual checkout requires a reason, destructive styling |
| 6 | Recognition Rather Than Recall | 2/4 | Must open every row to learn if it was corrected |
| 7 | Flexibility and Efficiency of Use | 1/4 | No bulk actions, sort, filter, or export |
| 8 | Aesthetic and Minimalist Design | 3/4 | Clean table; detail dialog was a flat 18-field dump |
| 9 | Help Recognize/Diagnose/Recover from Errors | 2/4 | Silent `catch {}` on list fetch, indistinguishable from an empty ledger |
| 10 | Help and Documentation | 1/4 | No inline explanation of auto-checkout/geofence mechanics |
| **Total** | | **25/40** | **Acceptable (pre-fix)** |

## Design-Specificity Verdict
Split: the data/copy layer (append-only correction ledger, manual-checkout copy naming the actual data operation) is genuinely grounded in the product. The Guest Details dialog's flat, unprioritized 18-field layout was the generic-CRUD-scaffold part — no point of view about what an auditor needs first.

## Priority Issues (resolved this session, scoped to what's safe/contained)

- **[P1 — FIXED] Corrections invisible in the list.** The one fact Product Principle 1 says must never be silent required opening every row to see. Added a small warning-token "Corrected" badge next to the visitor name whenever `l.corrections?.length` is truthy — no backend change, the data was already in the payload.
- **[P1 — FIXED] Silent list-fetch failure indistinguishable from a genuinely empty ledger.** Same `catch {}` pattern as My Logs; added an explicit error state with a distinct "Couldn't load logs" panel and retry, separate from the real "No logs yet" / "No matching logs" states.
- **[P2 — FIXED] Guest Details dialog was a flat, unprioritized data dump.** Collapsed raw identifiers (Session token, Location ID, Checkout log ID, Device ID, IP, geofence, user agent) behind a "Technical details" disclosure, closed by default, so Status/Duration/Passkey/Correction stay the primary read.
- **[P2 — FIXED] Auto-checked-out entries had no inline explanation.** Added the same warning-token callout used on My Logs to the Check-in/Check-out section.
- **[P3 — FIXED] Search had no clear affordance; View button was icon-only with no visible tooltip.** Added an X-to-clear button inside the search input and a `title` attribute on the eye icon.
- **[P2 — deferred, not done]** No status/date filter, sort, or CSV export. Flagged as a real gap for a "high-throughput" audit page at real scale, but treated as a distinct feature request rather than a same-session fix — it changes the page's data-fetching shape (pagination awareness) more than the other items, which were rendering-only.

## Detector findings (Assessment B)
CLI static scan: clean (0). Browser-injected scan: 3 findings (2× `ai-color-palette` on the decorative gradient hairline + logo tile, 1× `overused-font`), identical in light and dark. Judged **false positives** for the same DESIGN.md reasons as the My Logs review (One Signal Rule brand cue; intentional single-font system) — not changed. No contrast finding on this page (its avatar already used the monochrome `bg-muted`/`text-foreground` pair, unlike My Logs' since-fixed accent-on-accent combo).

## Verification
- `npx tsc --noEmit`: no new errors (pre-existing unrelated baseline only).
- `npx vitest run`: 124/124 passing.
- Live browser: corrections badge confirmed rendering on two real seed rows; search + clear button confirmed via direct DOM/event verification; table still correctly shows the full 17-row team-wide view (unaffected by the My Logs scope fix, confirmed both use `GET /api/logs` and only My Logs now passes `scope=mine`).
