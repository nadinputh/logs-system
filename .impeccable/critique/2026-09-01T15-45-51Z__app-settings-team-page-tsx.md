---
target: Team & Access page (re-run verification)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-01T15-45-51Z
slug: app-settings-team-page-tsx
---
Method: dual-agent re-run, post-fix verification (A: a231a41cf3979f9f8 · B: a4e5d123f50f269a4)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good loading/saving/switching states; no dirty-state indicator on unsaved role/status edits |
| 2 | Match System / Real World | 3 | Role names (auditor/manager) never defined in-context |
| 3 | User Control and Freedom | 3 | Cancel on every dialog, dismissible banners |
| 4 | Consistency and Standards | 3 | One shared confirm-dialog pattern for all 3 destructive actions is genuinely consistent |
| 5 | Error Prevention | 3 | Confirm dialogs, required fields, owner excluded from role select |
| 6 | Recognition Rather Than Recall | 2 | 5 of 7 sections render as visually identical collapsed cards |
| 7 | Flexibility and Efficiency | 3 | Audit trail filters, CSV export, pagination; no bulk member actions |
| 8 | Aesthetic and Minimalist Design | 3 | Calm and uncluttered, consistent with dashboard's own flat-card pattern |
| 9 | Error Recovery | 3 | Specific toasts; undelivered-email banners remain excellent |
| 10 | Help and Documentation | 2 | No explanation of what each role actually grants |
| Total | | 28/40 | Good |

Up from 22/40 (Acceptable) on the first run.

## What improved (verified fixed)
- Role badges: dark-mode foreground pairs added, admin/manager moved off brand cyan/sky, member moved off emerald (was ambiguous with the Active pill).
- Progressive disclosure: 5 of 7 sections collapse by default; only Active Team Context and Members stay open. Cognitive-load checklist improved from 1/8 to 5/8 pass.
- Destructive actions: Remove, Revoke, and Transfer now share one consistent confirm-dialog pattern (replacing window.confirm and the prior no-confirmation gaps on Remove/Revoke).
- Mobile members list: dedicated stacked-card layout confirmed working at narrow width, no off-canvas clipping.
- Select accessible names: role/status controls now announce meaningfully instead of "Select option" for every instance.
- Audit metadata: human-readable summaries replace raw JSON for all four audit action types.

## Additional issues the re-run surfaced, fixed in this pass
- "Active" team-status pill used raw text-emerald-500 with no dark pair (missed in the first pass) - now text-emerald-700 dark:text-emerald-300.
- "Continue to requested page" rendered unconditionally even with no real pending redirect - now gated on an explicit ?next= param.
- Ghost opacity-0 alignment labels (Export/Transfer/Send) still occupied a blank line on mobile once their grids collapsed to one column - now hidden below the relevant breakpoint.
- Ownership Transfer's inline trigger button was red/destructive before any confirmation existed, duplicating the confirm dialog's own danger signal - now neutral, matching Create invite/Create user; red is reserved for the dialog's actual point of no return.
- describeAuditMetadata only covered 2 of 4 audit action types - extended to cover member_removed and ownership_transferred too.

## Consciously not changed (verified against the codebase, not fixed)
- Danger-button 4.3:1 text contrast: confirmed pre-existing, deliberately-documented tradeoff in app/globals.css (HeroUI's shared --danger token, used by every danger button app-wide) - unchanged both runs.
- "Add glass/blur treatment" (re-run's P1): checked app/dashboard/page.tsx directly - the dashboard, the actual comparable console surface, uses the same flat bg-background/border-border cards with no glass/blur/shadow-signal anywhere. Adding glass only to Team & Access would make it inconsistent with the rest of the authenticated console rather than fixing an inconsistency, so this was not applied.
- Violet/indigo role-badge hues aren't yet documented in DESIGN.md's palette; flagged as a documentation gap for a future `/impeccable document` pass rather than a page-level fix.
