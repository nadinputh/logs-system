---
target: the homepage
total_score: 22
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 2
timestamp: 2026-08-16T02-29-39Z
slug: app-landing-page-tsx
---
# Critique — Homepage (app/landing/page.tsx)

Method: dual-agent (A: design review · B: detector evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|:---:|-----------|
| 1 | Visibility of System Status | 3 | Anchor nav has no scrollspy/active state — orientation lost on a long page |
| 2 | Match System / Real World | 3 | Strong mechanism copy, but "idempotency engine", "Reverse scan", "geofence…polygon" are unglossed jargon at visitor eye-level |
| 3 | User Control and Freedom | 3 | Theme toggle + anchors good; no "back to top", fixed particle field only dismissable via reduced-motion |
| 4 | Consistency and Standards | 2 | One-Signal Rule broken; the two dual-CTA blocks invert which action is primary |
| 5 | Error Prevention | 3 | "Scan to check in" → /scan sets no camera/permission/desktop expectation |
| 6 | Recognition Rather Than Recall | 3 | Self-describing cards, but 16 feature/flow items ask the reader to hold a lot |
| 7 | Flexibility and Efficiency | n/a | Persuade front door — no power-user task to accelerate |
| 8 | Aesthetic and Minimalist Design | 2 | ~28 discrete claims on an internal tool's front door — the opposite of "restraint is the point" |
| 9 | Error Recovery | 3 | Static surface; the two CTAs always give an exit |
| 10 | Help and Documentation | n/a | Persuade surface — docs live in the console |
| Total | | 22/32 (69%) | Acceptable — competent, not distinguished |

Both #7 and #10 n/a for a Persuade landing page; max is 32. 22/32 = 69% → Acceptable, at the Good boundary. The two 2s (Consistency, Minimalism) both trace to one root: the page performs abundance where DESIGN.md asks for calm authority.

## Design Specificity Verdict — ~60% authored, 40% template

LLM: Copy and data are unmistakably this product (mechanism language, honest stats obeying never-fabricate). But composition is a generic SaaS skeleton (glass nav → hero+eyebrow → 4-up stats → two identical 6-item feature grids → 2×2 flows → 4-step how-it-works → full-bleed gradient CTA band → footer). 20 Lucide icons in identical tinted squares carry the visual load; the shield-with-check mark appears only in nav/footer. Particle field borrowed from antigravity.google — not about check-ins.

Deterministic scan: Detector exit 2, 2 findings, both real:
- L258 text-[11px] on nav subtitle (also font-medium/500, off Two-Weight Rule)
- L574 text-[11px] on flow-card eyebrow (micro-label style but 11px not ramp's 12px; also tracking-[0.22em] vs documented 0.12em)

Visual overlays: no browser tool available to either agent — CLI scan only.

## Overall Impression

Reads credible, composes forgettable. Biggest problem is strategy mismatch: a conversion-optimized marketing page for an internal tool with zero prospects. PRODUCT.md calls the surface a router ("front door that routes staff to the console and visitors to the scan flow") but it's built as a 28-claim sales brochure. Biggest opportunity: stop selling, start routing; spend the reclaimed restraint on making the two doors unmistakable and the compliance story substantiated.

## What's Working
1. Mechanism-first copy that never fabricates proof — voice matches PRODUCT.md, stats are real system constants.
2. Disciplined color identity within any single card — 135° gradient, Split-Clause Headline Rule, cyan-tinted shadows.
3. Calm, non-performative motion — custom-eased fade-ups, viewport once, scroll-linked hero fade, reduced-motion honored.

## Priority Issues

[P0] One-Signal Rule broken by full-field cyan saturation. Cyan is the background (fixed 3-blob wash), atmosphere (particle glow), all four stat values (gradient-text), the buttons, and a full-bleed sky→cyan→teal CTA band — the DESIGN.md "Don't". Fix: demote closing band to a glass panel with one glowing CTA; stat values → foreground; reserve gradient-text for headline; confine color-wash to hero viewport. → /impeccable quieter

[P0] No visual primary between hero CTAs — inverts at the close. Hero: Scan (gradient) + Console (ghost); closing: Console (solid) + Scan (ghost). Personas need different primaries (visitor→scan, admin→console); admin-first per PRODUCT.md. Fix: one consistent primary (admin-first → Console as gradient primary in both blocks); demote visitor path to secondary/text link. → /impeccable layout

[P1] Content maximalism undercuts calm authority and over-builds an internal router. ~28 claims; two identical feature grids flatten Features and the differentiating Security into one band. Fix: cut to hero + one proof strip + the pairing shown as one contrast + two doors; push enumeration to /features. → /impeccable distill

[P1] Closing CTA is a redundant echo; compliance story buried. Peak-end wasted on restating hero. Admin evaluator gets no trust anchor (residency, self-hosted, roles, enforcement of immutability); the auditor's dream line (auto check-out at 12h + correction) is one card of twelve. Fix: make the close restate the append-only/self-hosted guarantee as a concrete promise + "what happens when you click" microcopy; elevate compliance mechanics. → /impeccable clarify

[P2] Jargon at visitor eye-level + residual 11px type drift. "idempotency engine", "Reverse scan", "Quest cards", "geofence…polygon" face one-time visitors. Detector's two text-[11px] (+ font-medium, tracking-[0.22em]) echo the looseness. Fix: gloss/segment jargon; round text-[11px] → text-xs, fix weight/tracking. → /impeccable typeset + /impeccable clarify

## Persona Red Flags

Jordan (first-timer): two co-equal hero CTAs → doesn't know which door; "Enterprise check-in engine" says everything but what to do; flow-tag jargon bounces him.

Riley (stress tester): reads "100% append-only"/"256-bit" → "says who?"; taps Scan on desktop → /scan with no camera/expectation; spots inverted CTA emphasis; "against your polygon" → "what polygon?".

Casey (distracted mobile): nav links hidden md:flex → visitor's "Scan to check in" absent from mobile header; four stacked fixed/blur compositing layers risk jank; ~28 cards = long thumb journey between the two real actions.

Facilities/security admin (compliance): no trust anchors (residency, self-hosted, roles, enforcement); full-gradient band + "Enterprise check-in engine" read as sales theater to an internal evaluator who knows there are no customers — dressed as sold, not operated.

## Minor Observations
- Two taglines: nav "Secure check-in logging" vs footer "Enterprise check-in/out logging engine · Immutable by design".
- size-4.5 icons (L332, L483) not a default Tailwind step — latent visual bug.
- Hero fades on scroll but fixed particle field + color-wash never do — atmosphere persists into text-dense sections.
- Flow cards have no resting border/bg (hover-only) — break FeatureCard consistency.
- Stats obey See-Through-At-Rest; the loudest element (closing band) is the opaque exception.

## Questions to Consider
1. If you know who arrives, why a marketing page rather than a confident two-door router?
2. What is the page emphasizing when cyan is the background, stats, buttons, and a whole section?
3. Could one composition (a check-in shown as both a 200ms scan and an immutable ledger line) say the differentiator more memorably than twelve cards?
