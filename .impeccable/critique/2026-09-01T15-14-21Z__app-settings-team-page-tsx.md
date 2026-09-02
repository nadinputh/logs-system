---
target: Team & Access page
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-09-01T15-14-21Z
slug: app-settings-team-page-tsx
---
Method: dual-agent (A: a0f918ac490bdac3a · B: a0b814ecae8f51315)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good loading/saving states; Select triggers give little open/pressed feedback |
| 2 | Match System / Real World | 3 | "Resource ownership" is a bit abstract; otherwise domain-appropriate |
| 3 | User Control and Freedom | 2 | Remove/Revoke fire with zero confirmation; Transfer uses a native window.confirm |
| 4 | Consistency and Standards | 1 | Role badges hardcode raw -500 text with no dark variant, violating DESIGN.md's mandatory foreground-pair rule, and reuse the brand's own cyan/sky hues as role identity |
| 5 | Error Prevention | 2 | Same asymmetry as #3 — only one of three destructive actions is gated |
| 6 | Recognition Rather Than Recall | 3 | Labels present throughout; draft changes visible before Save |
| 7 | Flexibility and Efficiency | 2 | No bulk actions, no search/filter on Members, no shortcuts |
| 8 | Aesthetic and Minimalist Design | 1 | Seven full-width cards of identical visual weight, all live at once |
| 9 | Error Recovery | 3 | Consistent toasts; undelivered-email recovery banners are well-designed |
| 10 | Help and Documentation | 2 | No inline explanation of role permissions or transfer consequences before the action |
| Total | | 22/40 | Acceptable |

## Design Specificity Verdict

LLM assessment: Could be dropped into any generic SaaS admin-CRUD kit unnoticed. Seven identical flat bg-background/border-border boxes, no glass/blur/gradient (defensible per DESIGN.md's dense-console exception). The one deliberate brand touch (gradient + glow) is spent on the least important action ("Create user"), while role badges recruit the brand's own cyan/sky hues as generic categorical color.

Deterministic scan: CLI static scan clean (exit 0, []). Live-DOM scan found 16 anti-patterns: low-contrast (2x, Remove/Transfer Ownership buttons, 4.3:1 vs 4.5:1), nested-cards (6x), dark-glow/ai-color-palette (5x, CTA + avatar icon), line-length (2x, 155-171 chars), cramped-padding (1x, false positive - height-based centering), overused-font (1x, false positive - Two-Weight Rule intentional). Danger-button contrast confirmed as a pre-existing documented tradeoff in app/globals.css (HeroUI's shared --danger token deliberately left alone).

## Overall Impression
Functionally complete and safe, but visually/structurally generic: no information hierarchy, a color system that quietly breaks its own documented rules, and a destructive-action pattern whose caution level doesn't match actual risk.

## What's Working
1. The undelivered-email recovery pattern (pendingLink/undelivered state) — persistent, explains why, copy-to-clipboard.
2. The audit trail visibly proves append-only-ness — reversed-metadata event pairs sit side by side.
3. Consistent, readable toast/error handling via readApiError fallback pattern.

## Priority Issues

[P0] Role badges violate the mandatory foreground-pair rule and compete with the brand signal. roleBadgeClass() (page.tsx:105) uses raw -500 text with no dark variant, assigns brand cyan/sky hues to admin/manager, and duplicates emerald between "member" role and "Active" team status. Fix: dark-paired hues, move role identity off cyan/sky/emerald. Suggested: /impeccable harden

[P0] Seven co-equal cards, zero progressive disclosure — cognitive load 1/8 pass (critical). Every role sees all seven cards regardless of permission. Corroborated by 6 nested-cards detector findings. Fix: collapse secondary sections, keep only Active Team + Members open by default. Suggested: /impeccable distill

[P1] Destructive actions have inverted confirmation weight; the one gated action uses a raw browser dialog. Remove/Revoke fire instantly; only Transfer is gated via window.confirm. Fix: consistent confirm affordance across all three, replace window.confirm with the app's Modal. (Danger-button 4.3:1 contrast is a separate, pre-existing, deliberately-accepted platform-wide tradeoff — not touched.) Suggested: /impeccable polish

[P1] Members table breaks entirely at mobile width — Actions column clipped off-canvas, no scroll affordance. Verified live at 500px. Fix: stacked card layout below sm. Suggested: /impeccable adapt

[P1] Every Select announces as "Select option" to assistive tech. components/ui/select.tsx's aria-label fallback unconditionally overrides native label association. Fix: only emit aria-label when no native label applies; add explicit labels to the two unlabeled members-table selects. Suggested: /impeccable harden

## Persona Red Flags
Alex (power user): re-scans 7-card stack every visit to relocate Members; no bulk role-change or search.
Sam (accessibility): "Select option, button" on every role/status control; off-canvas mobile Actions column is also a low-vision/zoom problem.
Casey (mobile): Remove button clipped off-screen by default with no visible scroll cue.

## Minor Observations
- Label className="opacity-0" hack (3 spots) stays in the accessibility tree — needs aria-hidden.
- Member name/email cells lack truncate (inconsistent with team cards above).
- Admin viewing the owner's row sees "No permission" — factually wrong.
- Raw JSON.stringify(event.metadata) in the audit trail undercuts the "clarity, not friction" positioning.
- Two description paragraphs measure 155-171 characters, past DESIGN.md's <=68ch rule.

## Questions to Consider
- What if this page were split by task frequency (daily vs occasional) instead of one long scroll?
- What if role identity dropped color for shape/icon, leaving cyan as the only color on the page?
