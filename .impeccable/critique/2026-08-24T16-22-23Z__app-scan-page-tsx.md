---
target: /scan page
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-08-24T16-22-23Z
slug: app-scan-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), parallel isolation.
Detector: exit 0, zero findings; URL mode unavailable (puppeteer absent); overlay injection skipped — no user-visible overlay. Detector was equally silent on /landing, so exit 0 is uninformative here, not a clean bill.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|:---:|---|
| 1 | Visibility of System Status | 2 | Camera status is a 2px black sliver, captioned as if a frame exists |
| 2 | Match System / Real World | 3 | Step 3 "Confirm and you are logged" precedes a 5-field form + selfie |
| 3 | User Control and Freedom | 1 | Non-retryable failures disable the only control, no alternative route |
| 4 | Consistency and Standards | 3 | CTA renders no gradient, no glow, 40px vs DESIGN.md's gradient/glow/48px |
| 5 | Error Prevention | 2 | Great isSecureContext pre-check; zero framing before the permission prompt |
| 6 | Recognition Rather Than Recall | 3 | hidden sm:block — phone never names who is asking for the camera |
| 7 | Flexibility and Efficiency | 1 | One path only; no manual code, host route, or non-visual alternative |
| 8 | Aesthetic and Minimalist Design | 3 | 308x231px empty dashed box dominates above the mobile fold |
| 9 | Error Recovery | 3 | Excellent diagnosis, contradicted recovery ("try again" beside disabled) |
| 10 | Help and Documentation | 2 | No privacy statement, capture disclosure, or reception fallback |
| **Total** | | **23/40** | **Acceptable — significant work needed** |

No heuristic n/a: all apply to an Operate surface with a hardware permission and an irreversible write.

## Design Specificity Verdict — ~50% authored

Authorship is in behavior and copy, not composition. Authored: describeFailure()'s six causes matched against the stringified rejection; isSecureContext pre-check; ALLOWED_PREFIXES refusing off-origin QR. Generic: two-column split, header carried from /landing, glass card + dashed placeholder + pill CTA. The surface brief claims step cards were "the refused page scaffold" but they became <li> rows with the same icon+title+body triple — the refusal was cosmetic. At 1440 the task gets 480px, the explainer 766px.

## Overall Impression

The error handling is better than most shipped products. And the page cannot do its job.

## What's Working

1. describeFailure() — six named causes, matched against [err.name, err.message, String(err)] because html5-qrcode rejects with plain strings.
2. isSecureContext checked before the tap — names a LAN-kiosk failure other products let you discover by watching a prompt do nothing.
3. ALLOWED_PREFIXES — the one place the security thesis is something the interface does, not says.

## Priority Issues

### [P0] Viewfinder renders 0x0 — the page cannot perform its only task
Wrapper is display:none during 'starting' (setPhase('scanning') runs only after scanner.start() resolves). html5-qrcode measures 0, writes inline width:0px, qrbox gets (0,0) → throws "minimum size of 'config.qrbox' dimension value is 50px". Inline style outranks [&_video]:w-full so it never recovers. Verified 3x independently: stream live (640px, readyState 4, unpaused), video 0x0.
Fix: keep wrapper mounted/measurable during 'starting'; #qr-reader video { width:100% !important }; floor qrbox with Math.max(160, ...).
→ /impeccable harden

### [P1] Non-retryable failure is a dead end contradicting its own copy
Button disabled while label stays "Start scanner", above copy reading "then try again". 3 of 6 branches non-retryable; "No camera found" says "ask a host" with no host affordance.
Fix: replace the CTA for non-retryable states rather than disabling it.
→ /impeccable harden

### [P1] No path that does not go through this scanner
One control, one mechanism. Turns the above from bugs into outages; fails screen-reader users completely.
Fix: short-code input resolving to the same /scan/[locationId].
→ /impeccable onboard

### [P1] Nothing discloses what is recorded
Only data statement is that the entry cannot be edited — a restriction on the visitor, not a protection. Engine captures ip_address, user_agent, device_id, geofence_status, offers a selfie; none disclosed. Step 3 misdescribes what follows.
Fix: rewrite step 3 truthfully; add one line on capture scope, readership, and on-device video.
→ /impeccable clarify

### [P2] Mobile hierarchy sells the wrong things
At 390x664 the highest-contrast interactive element is "Sign in" (staff). Wordmark hidden. Tapping Start shifts 189px under the thumb — the placeholder's own comment claims it prevents this.
→ /impeccable layout

## Persona Red Flags

Jordan: unlabeled shield asks for camera on mobile; placeholder promises a preview that never arrives.
Casey: 189px shift on tap; failure box below the button; disabled pill doesn't read as dead.
Sam: task region has NO accessible name (only h2 labels the explainer); task-ending error announced polite not assertive; disable is silent; no non-visual path at all. Credit: tab order correct, visible 2px #0e7490 outline on every stop — but the CTA is the 5th stop.
One-time lobby visitor: no privacy statement, no operator identity on mobile, no framing before the prompt; most prominent control invites sign-in to a system they have no account for.

## Minor Observations

- Primary CTA violates DESIGN.md button-primary (no gradient, no glow, 40px).
- Component boundaries fail WCAG 1.4.11: panel ~1.21:1, dashed placeholder ~1.25:1 vs 3:1.
- Text contrast otherwise clean both themes. Disabled label 2.02:1 is exempt (inactive) but matters as the terminal state.
- Desktop exactly 900px, no scroll, ~210px empty bottom-right.
- Manual {i+1} inside a real <ol> doubles the count for screen readers.
- isLoading destructured in Button adapter, never forwarded.
- prefers-reduced-motion honored; metadata, skip link, landmarks correct.

## Questions to Consider

1. Why does this page have a scanner at all? Native camera opens the door QR better; the realistic path is /scan/[locationId]. Front door or fallback dressed as one?
2. If the answer is kiosks, why laid out as a marketing hero rather than a full-bleed viewfinder with no chrome?
3. The page shows the mechanism's constraint and hides its scope. Which half is a stranger entitled to know before consenting?
4. What is ThemeToggle for on a surface used for twenty seconds, once?
