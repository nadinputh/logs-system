---
target: the Team, its subscription, and payment processing with invoice (re-run after fixes)
total_score: 29
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 1
timestamp: 2026-09-07T16-57-32Z
slug: app-settings-team-page-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose) — re-run after fixes

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Solid |
| 2 | Match Between System and Real World | 3 | Decline reasons & portal actions mirror real Stripe vocabulary |
| 3 | User Control and Freedom | 3 | Up from 1 — reactivation path restored, confirm dialogs added |
| 4 | Consistency and Standards | 4 | Up from 1 — new dialogs reuse the exact existing Dialog pattern |
| 5 | Error Prevention | 3 | Up from 1 — both high-stakes actions now confirmed |
| 6 | Recognition Rather Than Recall | 4 | Plan/price/status/renewal all visible without memory load |
| 7 | Flexibility and Efficiency of Use | 3 | One-click access to every outcome |
| 8 | Aesthetic and Minimalist Design | 2 | Unchanged — Glass Vault gap still open (parked by design) |
| 9 | Recover from Errors | 3 | Decline copy remains well-written |
| 10 | Help and Documentation | n/a | Admin/dev surface |
| **Total** | | **29/36** | **Good (80%)** |

(Score reflects Assessment A's re-run scoring; a follow-up typography fix — portal headline bumped from `text-xl` to `text-3xl` — closed the one detector finding (`flat-type-hierarchy`) that survived the first round of fixes, applied after both assessments returned.)

## Fix Verification (8 items from the last critique)

1. **[P0] Canceled subscription trapped forever** — FIXED, verified live end-to-end by both assessments independently (cancel → switch plan → real checkout redirect → active with new invoice).
2. **[P0] No confirmation on high-stakes billing actions** — FIXED. Both new dialogs triggered reliably in testing, correctly scoped (don't fire on a fresh subscribe or a resubscribe-after-cancel, since those already redirect through a real checkout).
3. **[P1] Invoice status color-only** — FIXED, confirmed in both the billing card and the portal's list.
4. **[P1] Cancel-immediately: missing confirmation + borderline contrast** — confirmation FIXED; contrast deliberately left alone (documented, pre-existing, app-wide `--danger` token tradeoff — out of scope here).
5. **[P2] Outline-button cramped padding** — deliberately left alone (shared HeroUI base sizing used by ~26+ buttons app-wide; a local override would fragment consistency, not improve it).
6. **[P2] Glass Vault disengagement** — deliberately left open, flagged for a dedicated `/impeccable polish` pass rather than folded into a bug-fix round.
7. **[P3] Billing accordion first-click flakiness** — PARTIALLY addressed. Two real fixes shipped: (a) the `<details>` element is no longer React-controlled, so a native toggle can no longer be silently reverted by a later hydration re-render; (b) the "loading teams" skeleton now matches the loaded grid's container and card shape/height, eliminating a real, measured layout shift (confirmed via live position sampling: the Billing summary's Y-coordinate is now stable from first render through settle). Both were verified as genuine defects and are now fixed. A residual flakiness remains under a stricter test than the original finding used: a click fired with literally zero delay after navigation can still land before React hydration attaches event handlers at all — this is inherent to any client-rendered Next.js page, not fixable at the app level, and did not reproduce once in repeated testing (this session and the prior one) whenever even a ~1 second delay was given before clicking, which is the realistic floor for human reaction time. Recommend closing this as "fixed for real users" with that caveat recorded, rather than continuing to chase a testing-harness artifact.
8. **[P3] Flat type hierarchy** — FIXED. Checkout page's price/plan-name bumped to the system's 800-weight tier; a follow-up pass also bumped the portal's plan-name headline to `text-3xl` after the detector's re-run still flagged the portal specifically (it has no separate price line, so its plan name needed the larger headline treatment checkout's price line already carries).

## What's Working (reconfirmed)

- The canceled-reactivation fix ships with an unusually clear explanation of *why* the bug existed, not just that it's fixed.
- Both new confirm dialogs are byte-for-byte structurally identical to the existing member-removal/invite-revoke pattern — they can't visually drift from the rest of the app because they're built from the same primitives.
- The emotional arc across cancel → reactivate → switch tiers now reads as "safe" rather than "risky" at every step.

## Remaining Open Items (unchanged from last report, deliberately not touched this round)

- **[P2] Glass Vault disengagement** on `TeamBillingCard.tsx` — flat boxes, no blur/glow, on the highest-trust screen in the console. Candidate for `/impeccable polish`.
- **[P2] Outline-button padding** — a systemic HeroUI base-sizing characteristic, not scoped to this feature.
- **[P1] `--danger` token contrast** — documented, deliberate, app-wide tradeoff; would need a dedicated token-level decision, not a local patch.

Questions skipped: this critique is running under an active user directive to resolve findings and re-run verification autonomously without pausing for interactive input, and the user has already explicitly declined an interactive question prompt earlier in this session.
