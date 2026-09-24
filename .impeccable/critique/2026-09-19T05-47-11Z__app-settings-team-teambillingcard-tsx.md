---
target: team billing subscription — term of payment, switching plan, downgrade, invoice PDF export
total_score: 18
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-19T05-47-11Z
slug: app-settings-team-teambillingcard-tsx
---
Method: dual-agent (A: general-purpose design-review agent · B: general-purpose detector/browser-evidence agent)

#### Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Downgrade success shows a generic "Plan updated" toast; the member-suspension/building-archival it just triggered is invisible until you happen to check Members later. |
| 2 | Match System / Real World | 3 | "Prorated, not queued for next renewal" is precise and appropriately technical for this audience. |
| 3 | User Control and Freedom | 2 | Cancel exists on the confirm dialog, but nothing lets you preview or walk back a downgrade's side effects once committed. |
| 4 | Consistency and Standards | 2 | Verified live: the confirm dialog is character-for-character identical for an upgrade (Business monthly → annual) and a downgrade (Business → Free) — same title template, same icon, same button pair. |
| 5 | Error Prevention | 1 | The one destructive path on this card (downgrade → auto-suspend members / auto-archive buildings) ships with zero preview of what gets suspended/archived before commit. |
| 6 | Recognition Rather Than Recall | 3 | Plan cards show price/cycle/trial inline; no memory burden. |
| 7 | Flexibility and Efficiency | 2 | Owner console, so this applies — no bulk actions, no way to choose which members/buildings survive a downgrade instead of the silent newest-first rule deciding for you. |
| 8 | Aesthetic and Minimalist Design | 2 | Detector overlay counted 13 nested-card instances on this one card region (glass panel → plan tiles → invoice container → dashed empty-states) — busier than the "calm, minimal" Glass Vault brief. |
| 9 | Error Recovery | 1 | No error-state UI beyond a toast; no path back to "what just changed" without leaving the card. |
| 10 | Help and Documentation | 0 | Console surface, applies — nothing anywhere explains what a downgrade does to data/access before or after it happens. |
| **Total** | | **18/40** | **Poor** |

#### Design Specificity Verdict

**LLM assessment:** This is generic SaaS billing boilerplate wearing one piece of Glass Vault costume. The subscription-status card gets real authored treatment (ambient-wash + glass, explicitly reasoned about in a code comment as "the highest-trust moment on the page") — but the plan tiles, invoice rows, and confirm dialog are indistinguishable from any Stripe-Checkout-adjacent settings panel. The same page's role badges got a documented, deliberate hue system (Owner/Admin/Manager/Auditor/Member); billing got none of that authorship.

**Deterministic scan:** The isolated-file CLI scan (`detect.mjs`) came back clean (exit 0, no findings) — it can't see the component in its rendered context. The in-page browser overlay, run against the live `/settings/team` billing section, found **24 anti-patterns**: `nested-cards` ×13 (real — five levels of bordered/glass boxes stacked in one region), `ai-color-palette` ×9 (the cyan gradient on CTA buttons and an icon span — largely the intended One Signal Rule brand accent, but 9 hits on one card region is worth checking against the "≤10% of view" rule), `line-length` ×1 (a ~96-character subtitle paragraph, minor), and `overused-font` ×1 (Inter at 100% of text — a false positive, since DESIGN.md deliberately commits to one type family). No script-injection failures; the overlay ran cleanly in the actual page.

**Visual overlays:** Injection succeeded and the detector ran in the live page, but the tab and the temporary overlay server were both closed after evidence collection per the critique protocol — there is no overlay currently visible in your browser. The findings above are the full console output the overlay produced.

#### Overall Impression

The backend logic here is genuinely careful — downgrades are reversible, non-destructive, and owner-seat-protected — but none of that care reaches the UI. Confirmed live in the browser: switching plans in either direction shows the exact same dialog copy, there is no monthly/annual toggle (just six separate tiles), and there is no PDF/download affordance anywhere on the page. The single biggest opportunity is closing the gap between what the backend already knows (who gets suspended, which Stripe invoice PDF exists) and what the confirm dialog and invoice list actually show.

#### What's Working

1. **The subscription-status card's glass/ambient-wash treatment** is real Glass Vault authorship with reasoned intent, not a cargo-culted style.
2. **`enforcePlanLimitsAfterDowngrade`'s backend policy** (suspend newest-joined non-owners, archive newest-created buildings, always reversible, owner seat reserved) is a thoughtful non-destructive design — the gap is purely that it never surfaces.
3. **The `needsConfirm` gating logic** — only a live in-place plan mutation gets this confirm dialog; a fresh subscribe or resubscribe-after-cancellation correctly skips straight to Checkout's own confirmation — is sharp, correct interaction reasoning, and documented inline.

#### Priority Issues

**[P0] Invoice PDF export does not exist, despite the data already existing.** `Invoice.pdfUrl` is populated from real Stripe (`invoice.invoice_pdf`) on every `invoice.paid` webhook, but `GET /api/teams/[id]/billing` selects only `number status amountCents currency issuedAt` — `pdfUrl` is dropped before it ever reaches the client — and confirmed live, a DOM-wide search for download/PDF/receipt affordances on the rendered invoice list returned nothing. An owner who needs a receipt has no way to get one from this app.
**Why it matters:** This was the user's explicit question — the direct answer today is no, even though Stripe already hands you the PDF URL for free.
**Fix:** Add `pdfUrl` to the route's `.select()` and the `InvoiceRow` type, render a "Download PDF" link per row when present, and render nothing (not a dead link) for mock-mode invoices, which never get a real PDF.
**Suggested command:** `/impeccable harden`

**[P1] Downgrade confirm dialog is directionally blind to the very side effect it triggers.** Verified live: the dialog for Business→Free (a downgrade that will suspend members and archive buildings per `enforcePlanLimitsAfterDowngrade`) and Business-monthly→annual (a harmless upgrade) render byte-identical copy: *"X is replaced by Y at $Z / period, effective immediately — prorated, not queued for the next renewal."* Same icon, same button pair, no mention of what gets suspended or archived.
**Why it matters:** An owner can click through a downgrade with zero idea that colleagues are about to be suspended or a building archived — on a product whose entire pitch is cryptographic certainty and an immutable, auditable trail, this is the one place state silently mutates other people's access with no warning and no ledger-visible flag on this page.
**Fix:** Before rendering the dialog, compute (or have the API return) current active-member and active-building counts against the target plan's limits; when the switch is a downgrade, replace the generic sentence with something like "This will suspend 2 members and archive 1 building to fit Free's limits" and swap the icon/tone to a warning treatment.
**Suggested command:** `/impeccable harden`

**[P1] Trial status and "Renews on" date are conflated.** Live-verified: a `trialing` subscription (badge reads "trialing") still shows the label **"Renews on 9/14/2026"** — the component only branches on `cancelAtPeriodEnd` ("Ends" vs. "Renews"), never checks `status === 'trialing'` even though `subscription.trialEndsAt` is already returned by the API and simply unused in this branch.
**Why it matters:** "Renews" implies you've already been charged before; during a trial, that date is when you'll be charged for the first time. That's a real term-of-payment ambiguity for anyone deciding whether to cancel before being billed.
**Fix:** When `status === 'trialing'`, show "Trial ends {trialEndsAt}, then renews at {price}" instead of the generic "Renews on {currentPeriodEnd}."
**Suggested command:** `/impeccable clarify`

**[P2] No monthly/annual comparison — cycle is encoded only in six separate tile headings.** Live-verified: Free/Pro/Business × monthly/annual render as six independent tiles in a 3-column grid ("Free (monthly)," "Free (annual)," etc.) rather than a single cycle toggle with tiers underneath, so comparing "what do I save by going annual" requires scanning six cards instead of flipping one control.
**Why it matters:** Raises the cognitive load of the one comparison (monthly vs. annual cost) that term-of-payment clarity is supposed to make trivial.
**Fix:** A monthly/annual segmented toggle above three tier cards, price updating in place.
**Suggested command:** `/impeccable layout`

**[P2] Card-on-card visual clutter.** The overlay's `nested-cards` finding (×13) is real: an ambient-wash glass panel, five bordered plan tiles, a bordered invoice container, and dashed-border empty states all stack in one region, working against DESIGN.md's own guidance to flatten dense admin surfaces.
**Why it matters:** Undercuts the "calm, restrained" read the rest of the Glass Vault system earns elsewhere on this same page.
**Fix:** Drop borders on the plan tiles (rely on the grid gap + typography for separation) and flatten the invoice list to a striped table without its own outer border, reserving the glass/border treatment for the one already-earned status card.
**Suggested command:** `/impeccable polish`

#### Persona Red Flags

**Alex (Power User / Owner):** Trusts the "cryptographic certainty" pitch, then discovers a downgrade silently touched teammates' access with no audit-visible trace on this page. No bulk or granular control over which members/buildings survive a downgrade — the newest-first rule decides for you.

**Sam (Accessibility-Dependent):** Invoice paid/failed status does pair color with text, which is fine — but the confirm dialog uses the identical `CreditCard` icon and framing for a harmless upgrade and a member-suspending downgrade, so a screen-reader user gets no differentiated cue for the higher-stakes action.

**Riley (Stress Tester):** The in-place plan-mutation path (`startCheckout` for a live subscription) has no redirect to interrupt — refreshing mid-request right after clicking "Switch plan" but before `loadBillingInfo()` resolves would leave the UI showing a stale plan with no surviving in-flight indicator. Worth probing directly.

#### Minor Observations

- `formatPrice` hardcodes the `en-US` locale regardless of viewer locale.
- The overlay's `overused-font` flag (Inter, 100%) is a false positive — DESIGN.md deliberately commits to a single type family.
- The `ai-color-palette` ×9 flag is mostly the intended brand signal (cyan CTAs), but worth a quick gut-check that it isn't creeping past the One Signal Rule's "≤10% of view" ceiling on this specific card region.
- Mock-mode invoices correctly never fabricate a `pdfUrl` (defaults to `null`) — that's the right call, not a bug, once real PDFs are wired up for the Stripe path.

#### Questions to Consider

- If the ledger is "sacred" and every correction gets an audit trail, why does a downgrade silently mutate two other collections (TeamMember, Building) with no comparable entry visible to the owner in this same UI?
- What would this confirm dialog look like if it had to justify itself to the exact admin persona PRODUCT.md names as primary — the one who audits the whole estate for a living?
- Is invoice PDF export missing by oversight or deliberately deferred — and if deferred, why does the schema field already exist and get populated on every real Stripe payment?
