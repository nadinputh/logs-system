---
target: /scan page
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-25T14-49-36Z
slug: app-scan-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), parallel isolation.
Both agents were barred from reading the prior snapshot and the revision notes, so this is an
independent measurement rather than a confirmation pass.

## Design Health Score

| # | Heuristic | Score | Delta | Key Issue |
|---|---|:---:|:--:|---|
| 1 | Visibility of System Status | 3 | +1 | 'starting' has no timeout; a hung stream has no exit |
| 2 | Match System / Real World | 3 | — | Lede leads with compliance framing; "Open the console" is internal |
| 3 | User Control and Freedom | 3 | +2 | Nothing says nothing is written yet |
| 4 | Consistency and Standards | 3 | — | Shell/glass/accent match DESIGN.md; the CTA does not |
| 5 | Error Prevention | 3 | +1 | No forewarning before the OS permission dialog |
| 6 | Recognition Rather Than Recall | 3 | — | iOS recovery must be memorised while leaving the browser |
| 7 | Flexibility and Efficiency | 2 | +1 | No route for a failed camera with no staffed desk |
| 8 | Aesthetic and Minimalist Design | 3 | — | Largest object is an empty box carrying zero information |
| 9 | Error Recovery | 4 | +1 | Genuinely excellent, verified live |
| 10 | Help and Documentation | 3 | +1 | Step 3 still understates the next flow |
| **Total** | | **30/40** | **+7** | **Good** |

The +7 is not calibration drift: every increment maps to a specific shipped fix and the six
untouched heuristics stayed put.

## Correction to the previous run
The previous critique warned the detector might be inert. Assessment B disproved this with
deliberate trip files (gray-on-color, gradient-text both fire, exit 2) and found 8 real
findings elsewhere in the repo (11px off-ramp in settings/passkeys, settings/team,
VisitorPasskey). /scan's exit 0 is a genuine clean pass, for the subset of the 59 rules the
text engine implements for .tsx.

## Measured deltas
- Viewfinder 0x0 + page error -> 306x229, stream live, 0 errors
- Dead end: disabled button + "try again" -> 0 buttons, no disabled control
- Start scanner y=807 (below fold) -> y=480, 140px clearance
- Most prominent control: Sign in -> Start scanner (19,760px2, 2.6x next, only filled surface)
- Contrast failures: several -> zero across light/dark/error; lowest anywhere 4.91
- Live regions: 1 polite -> 2 (polite progress + role=alert failure)

## Priority Issues

### [P1] Breaks in landscape
844x390: CTA at y=654, 264px below the fold. Same at 1024x600. Placeholder is aspect-[4/3]
on a 544px column = 371px tall, uncapped by viewport height.
Fix: max-h-[min(45vh,20rem)] on placeholder and viewfinder; collapse below ~500px vh.
-> /impeccable adapt

### [P1] 'starting' has no timeout
No watchdog on scanner.start(). A hung stream (real on iOS when another app holds the
camera) leaves a disabled "Starting camera...", a black box, and no exit.
Fix: 10s Promise.race resolving to a retryable failure.
-> /impeccable harden

### [P1] Removing the button destroys keyboard focus
Consequence of the harden fix. Verified: activeElement falls to <body> when the dead-end
path removes the control. role=alert still announces, but position is lost.
Fix: move focus to the failure heading with tabIndex={-1}.
-> /impeccable harden

### [P2] Step 3 still wrong (under-corrected)
"Give your name and confirm" vs the real four screens: identity -> purpose/gender ->
Check In -> selfie. The clarify pass replaced a falsehood with an understatement. That
substep also offers "Continue" and "Skip" doing nearly the same thing.
-> /impeccable clarify

### [P2] Primary CTA is the least branded object on the page
background-image none, box-shadow none, font-weight 500, 40px desktop. DESIGN.md specifies
brand gradient, cyan Signal-glow, 48px, and forbids weight 500.
-> /impeccable polish

## Persona Red Flags
Jordan: permanence before purpose; no "no account needed"; last line plants login doubt.
Casey: rotate the phone and the CTA is gone. Live scanning fits the fold correctly.
Sam: headings/skip/tab order/focus ring all correct; focus destroyed on dead end; still no
non-visual route to check in.
One-time lobby visitor: told what is stored and that the feed stays local, but the page
cannot name the organisation, gives no retention period, and never says no account is needed.

## Minor Observations
- Source comment app/scan/page.tsx:17-18 is stale (still claims two-column width).
- Dead-end path shifts the document -311px; success path +40px.
- "Open the console" is 119x17 — worst touch target.
- Desktop facingMode 'environment' falls back to the front webcam; no copy anticipates it.
- CTA is server-rendered but inert until hydration (~546ms local).

## Questions to Consider
1. The population here is defined by "the camera route already failed" — should the default
   state lead with the alternatives and make the scanner secondary?
2. What does a visitor do when the camera fails and the desk is unstaffed? Today: nothing.
3. Should the page say nothing is recorded until you confirm on the next screen?
4. Does an immutable-ledger product owe a stranger a retention period?
