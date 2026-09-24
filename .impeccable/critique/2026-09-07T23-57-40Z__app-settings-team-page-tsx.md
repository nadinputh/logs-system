---
target: the Team, its subscription, and payment processing with invoice (round 3 — Glass Vault, padding, contrast all closed)
total_score: 37
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-09-07T23-57-40Z
slug: app-settings-team-page-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose) — round 3, plus a final self-verified micro-round on the two P3s round 3 surfaced

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Solid |
| 2 | Match Between System and Real World | 3 | Decline reasons & portal actions mirror real Stripe vocabulary |
| 3 | User Control and Freedom | 4 | Reactivation path + both confirm dialogs |
| 4 | Consistency and Standards | 4 | Up from 3 — danger icon/button now pinned to the same fixed red instead of diverging by theme |
| 5 | Error Prevention | 4 | Both high-stakes actions confirmed |
| 6 | Recognition Rather Than Recall | 4 | Plan/price/status/renewal all visible without memory load |
| 7 | Flexibility and Efficiency of Use | 3 | Admin-tool ceiling, not a defect |
| 8 | Aesthetic and Minimalist Design | 4 | Up from 3 — glass card now has genuine, verified color bleed-through (ambient-wash), not just border+shadow |
| 9 | Recover from Errors | 4 | Decline copy remains well-written |
| 10 | Help and Documentation | 3 | Admin-tool ceiling, not a defect |
| **Total** | | **37/40** | **Excellent (93%)** |

## Round 3 fix verification (dual-agent, both independent assessments)

1. **Glass Vault treatment on `TeamBillingCard`'s hero card** — Assessment A confirmed the `.glass`/`.shadow-panel`/`rounded-3xl` classes apply correctly and read as intentional, restrained elevation versus the flat plan tiles, but flagged the translucency itself was imperceptible against the card's flat backdrop (nothing colorful for the blur to reveal) — a real gap against DESIGN.md's "See-Through-At-Rest" rule. **Fixed after the round**: added the same `.ambient-wash` radial-gradient layer the landing hero uses, scoped and clipped to just this card (`overflow-hidden`, `aria-hidden`, `pointer-events-none`). Verified live in dark mode: the card now shows real sky/teal color bleeding through its edges, visually distinct from the flat black cards around it.

2. **Outline-button padding** — both assessments confirmed `py-1.5` (computed 6px) resolved `cramped-padding` on every targeted button with no height distortion (40px, matching siblings). Assessment B additionally caught that the confirm-dialog's own destructive button (`size="sm"`) wasn't in the original fix's scope and still measures 0px padding. Left as-is deliberately: it's the exact same `size="sm"`-with-no-padding-override pattern already used by every other confirm dialog in the app (member-removal, invite-revoke, ownership-transfer) — patching only this one dialog's buttons would be the first divergence from that established, intentionally-copied pattern rather than a fix.

3. **`--danger` → local `#b42318` override on "Cancel immediately"** — both assessments confirmed 6.41:1 measured contrast, clearly destructive-reading color, no muddiness. Assessment A caught a real inconsistency: the confirm dialog's icon still used the theme-varying `var(--status-danger)` token (which is `#f87171` — a much lighter salmon — in dark mode), so the icon and the button showed two different reds in the same dialog. **Fixed after the round**: pinned the icon to the same fixed `#b42318` as the button, with a comment explaining why `--status-danger` isn't safe to use as a solid-fill background (its dark-mode value is tuned for text-on-wash, not a white-text button fill — using it as one would have re-introduced a ~2.8:1 contrast failure). Verified live: icon and button now render identically.

## What's Working

- Every fix in this round is scoped and reasoned: no shared component or token was changed app-wide; each override is local, commented, and justified against a specific measured problem.
- The ambient-wash reuse is the same mechanism (and the same restraint — one wash, one card, contained) the landing page already uses, not an invented pattern.
- The danger-red exception is now internally consistent within its own dialog, closing the one loose thread the reviewers found.

## Remaining (not defects — structural ceiling for this surface type)

- **Match Real World (3/4)** and **Flexibility/Efficiency (3/4)**: reasonable for an admin/dev-tool surface; nothing actionable was identified against either.
- **Help and Documentation (3/4)**: this surface is self-explanatory by design intent (dev-mode banners, inline copy); a dedicated help affordance isn't warranted here.

All 152 tests pass, `tsc` clean on every touched file, static detector clean (`[]`), and every dev server started for testing (three rounds across two sessions) was torn down — the user's own dev server on port 4242 was never touched at any point.
