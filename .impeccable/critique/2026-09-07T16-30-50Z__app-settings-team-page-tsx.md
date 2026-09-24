---
target: the Team, its subscription, and payment processing with invoice
total_score: 20
max_score: 36
na_heuristics: 10
p0_count: 2
p1_count: 2
timestamp: 2026-09-07T16-30-50Z
slug: app-settings-team-page-tsx
---
Method: dual-agent (A: general-purpose · B: general-purpose)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toasts/badges work; accordion open-state is flaky on first click |
| 2 | Match Between System and Real World | 3 | Decline reasons and portal actions mirror real Stripe vocabulary well |
| 3 | User Control and Freedom | 1 | A canceled subscription has no self-serve path back to a paid plan |
| 4 | Consistency and Standards | 1 | Member-removal uses a confirm Dialog; billing cancel/upgrade use none |
| 5 | Error Prevention | 1 | No confirmation before an instant 3x price jump or before cancellation |
| 6 | Recognition Rather Than Recall | 3 | Plan, price, status, renewal date all visible without memory load |
| 7 | Flexibility and Efficiency of Use | 3 | One-click access to every outcome serves QA/power-user efficiency |
| 8 | Aesthetic and Minimalist Design | 2 | Clean but ignores the system's glass/glow/elevation rules entirely |
| 9 | Help Recognize/Diagnose/Recover from Errors | 3 | Decline copy is genuinely reassuring and well-written |
| 10 | Help and Documentation | n/a | Admin/dev surface, self-explanatory by design intent |
| **Total** | | **20/36** | **Acceptable (55%)** |

## Design Specificity Verdict

**LLM assessment (Assessment A):** This surface does not read as authored for Kamnotheat. DESIGN.md's "Glass Vault" system — translucent `backdrop-blur` panels, `rounded-3xl` containers, cyan-tinted glow, sky→cyan→teal signal — is almost entirely absent. Every card in `TeamBillingCard.tsx` and both mock pages is a flat `rounded-xl border-border` box with no blur, no glow, no glass. The only brand touch surviving is the gradient fill on primary buttons — everything else (banners, invoice rows, status pills) is interchangeable with a generic Stripe-settings tutorial. For a product whose differentiator is pairing frictionless UX with cryptographic certainty, the billing surface — arguably the highest-trust screen in the app — should be the *most* deliberately vault-like, not the least.

**One refinement worth naming:** this verdict lands hardest on `TeamBillingCard.tsx` (real production UI every team owner sees). The two `/dev/billing/*` mock pages have a legitimate countervailing reason to look deliberately plain and utilitarian — a fake Checkout/Portal page that's *too* polished risks a developer mistaking it for the real Stripe-hosted one it's standing in for. That tension is a genuine open question (see Questions below), not an oversight.

**Deterministic scan (Assessment B):** clean CLI pass — `detect.mjs --json` against all 6 source files returned `[]`. The live-browser detector pass (rendered DOM, not static source) told a different story: 22 hits on `/settings/team` (`ai-color-palette` ×6 and `dark-glow` ×6 on the header badge and CTA buttons, `nested-cards` ×9 across the summary card/plan grid/invoice rows, plus `line-length` and `overused-font`), 7 hits on the mock checkout page, 5 on the mock portal.

**Where the two assessments agree, from opposite directions:** the detector flagged the cyan-gradient CTAs as `ai-color-palette`/`dark-glow` — almost certainly a false positive, since that gradient *is* the app's real `gradient-cta` token, not an ad-hoc AI cliché. But Assessment A's independent complaint is that this gradient is the *only* brand-true element on the page while everything else ignores the system. Read together: the detector mis-flagged the one authentic touch, while the human review confirms everything around it is generic — both point at the same gap.

**Where the detector caught something the LLM review didn't:** `cramped-padding` (0px vertical, needs ≥4.2px) on all four checkout decline buttons and both portal "Simulate renewal" buttons — a live-rendered measurement, distinct from the button-height check already covered in the prior `/impeccable audit` pass.

**Likely false positives (per Assessment B's own read, and agreed here):** `all-caps-body` on the "DEV MODE" banners (a small environment badge, not body prose); `em-dash-overuse` (8 hits are one dash each across 8 short button/banner labels, not prose overuse).

## Overall Impression

The functional coverage here is genuinely strong — every Stripe outcome (7 payment declines, 5 portal actions) is reachable in one click, and the copy is unusually well-written for a dev tool. But two things undercut it: a **verified P0 bug** that silently traps a canceled team with no way back to a paid plan (both assessments hit this independently, from different tests), and a **visual identity gap** where the highest-trust screen in the console reads as the least "Kamnotheat" screen in it.

## What's Working

- **Checkout decline copy**: "Pick another outcome to retry, same as a real Checkout page" bridges simulation and reality precisely — the single best-written string on the surface.
- **Consistent dev-mode framing**: the amber banner + footer disclaimer repeats identically across both mock pages, giving a trustworthy "no real money moves" signal exactly where anxiety would otherwise spike.
- **Portal action coverage**: renew-success/fail, cancel-at-period-end, resume, cancel-now maps almost 1:1 onto real Stripe Billing Portal capabilities.

## Priority Issues

**[P0] A canceled subscription can never be reactivated through self-serve checkout.**
Why it matters: verified live by both assessments independently — cancel a plan, then click "Switch to this plan" on anything, and the team stays permanently `canceled` with no new invoice, no matter which plan is picked. Root cause (traced in source): `handleSubscriptionUpdated`... no — `handleSubscriptionDeleted` in `lib/billing/webhookHandlers.ts` sets `status: "canceled"` but never clears `providerSubscriptionId`. The checkout route's guard (`existing.provider !== "manual" && existing.providerSubscriptionId`) stays true forever afterward, so every later "Subscribe" click routes through `changeSubscriptionPlan` (an in-place proration update that never touches `.status`) instead of a real new Checkout Session. This is shared logic — it affects real Stripe subscriptions exactly as much as mock ones.
Fix: the checkout route's live-subscription guard needs an explicit `existing.status !== "canceled"` condition (or `handleSubscriptionDeleted`/`cancelSubscriptionNow` should clear `providerSubscriptionId`) so a canceled team is routed to a real new Checkout Session again.
Suggested command: `/impeccable harden` (this is a production-logic bug, not a styling issue — flag for direct code fix alongside/before any visual work).

**[P0] No confirmation before high-stakes, irreversible billing actions.**
Why it matters: an instant 3x price jump (Pro $49 → Business $149/mo) and "Cancel immediately" both execute with zero confirmation, while this same settings page already has a `Dialog`/confirm pattern wired up for member removal and ownership transfer. The most consequential actions on the page get the least ceremony.
Fix: route plan-change and cancel-now through the existing confirm-dialog pattern already built in `app/settings/team/page.tsx`.
Suggested command: `/impeccable harden`

**[P1] Invoice status is conveyed by color alone in `TeamBillingCard.tsx`** (red/green amount, no word) — while the portal's own invoice list correctly appends "— paid" / "— payment failed." Fails WCAG 1.4.1 and is directly inconsistent with a sibling component built minutes apart.
Fix: match the portal's label pattern in the card.
Suggested command: `/impeccable clarify`

**[P1] The single most destructive control has the weakest measured legibility.** "Cancel immediately" combines P0's missing confirmation with a live-measured 3.5:1 text contrast (needs verification against the WCAG bold/large-text 3:1 exception — flagged, not confirmed failing) on its red fill. The riskiest action on the surface is currently also the hardest one to read clearly and the easiest one to trigger by accident.
Fix: verify/fix contrast on the destructive button fill, and pair it with the confirmation fix above.
Suggested command: `/impeccable harden`

**[P2] Outline-variant buttons render with ~0px effective vertical padding around their label** (live-measured on the checkout decline buttons and both portal "Simulate renewal" buttons) — a visually cramped click target distinct from the button-height check already covered in the last `/impeccable audit` pass.
Suggested command: `/impeccable layout`

**[P2] The surface disengages from the "Glass Vault" design system** — flat `rounded-xl border-border` boxes throughout, no blur/glow/elevation, on the highest-trust screen in the console (see Design Specificity Verdict above; scoped to `TeamBillingCard.tsx`, not the intentionally-plain mock pages).
Suggested command: `/impeccable polish`

**[P3] Flaky first click on the Billing accordion** — sometimes fails to expand or resets scroll on the first attempt.
Suggested command: `/impeccable harden`

**[P3] Flat type hierarchy on the portal's invoice/status text** (12/14/16/18px, only 1.5:1 size ratio) — reinforces the cognitive-load finding that plan name, price, and status carry near-identical visual weight.
Suggested command: `/impeccable typeset`

## Persona Red Flags

**Alex (impatient admin):** clicks "Switch to this plan" expecting a checkout step or at least a confirmation for a 3x price change; instead gets a silently mutated card and a toast that's gone before it can be screenshotted for a billing dispute — no invoice, no audit-trail entry to point to afterward.

**Sam (keyboard/screen-reader):** tabs through the nav and billing controls and gets no visible focus ring at any tested stop; hears "$49.00" twice on the invoice list with no way to distinguish paid from failed beyond the color a sighted user relies on.

## Minor Observations

Current-plan tile isn't pinned first in the 6-tile grid; light-mode primary buttons look flatter than dark mode's cyan glow; card radii are `rounded-xl` throughout rather than the system's `rounded-3xl`.

## Questions to Consider

- If "the ledger is sacred" for check-in logs, why does canceling real revenue require less ceremony than removing a team member?
- Should the mock Checkout/Portal pages stay deliberately plain (so nobody mistakes them for the real Stripe-hosted UI), or would leaning into the Glass Vault system there actually help testers trust the simulation more?
- Has this checkout flow been exercised end-to-end by anyone besides whoever built it, given it was structurally unreachable a second time for any team that had ever canceled?
