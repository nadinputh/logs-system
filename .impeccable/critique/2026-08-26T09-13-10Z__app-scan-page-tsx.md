---
target: the scan page
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-26T09-13-10Z
slug: app-scan-page-tsx
---
Method: dual-agent (A: design review, Opus, static-source · B: detector + static measurement, Sonnet), parallel isolation.
Browser evidence unavailable: no dev server, app requires live MongoDB, no overlay injection attempted. No user-visible
overlay was produced. Contrast figures are COMPUTED from tokens (globals.css + HeroUI variables.css), not measured live.

## Design Health Score

| # | Heuristic | Score | Delta | Key Issue |
|---|---|:---:|:--:|---|
| 1 | Visibility of System Status | 2 | -1 | `starting` disables CTA -> label ~1.5:1 light, focus drops to <body>, live region silent up to 10s |
| 2 | Match System / Real World | 3 | - | Lede leads with a legal property ("never edited"), not the visitor's goal |
| 3 | User Control and Freedom | 3 | - | Nothing says nothing is written yet; no return path to scanner after a decode |
| 4 | Consistency and Standards | 2 | -1 | Destination /scan/[locationId] is a different visual system: light-only slate/cyan, no dark mode, no shell |
| 5 | Error Prevention | 3 | - | isSecureContext pre-check + watchdog excellent; zero forewarning before the OS permission dialog |
| 6 | Recognition Rather Than Recall | 3 | - | "Settings -> Safari -> Camera" memorised while leaving the browser |
| 7 | Flexibility and Efficiency | 2 | - | No repeat-scan path (quest = 5 cold starts), no torch, no camera switch |
| 8 | Aesthetic and Minimalist Design | 3 | - | Largest above-fold object is an empty dashed box; capture list appears verbatim twice |
| 9 | Error Recovery | 3 | -1 | Focus recovered only on the non-retryable path; the 3 most common failures leave focus on <body> |
| 10 | Help and Documentation | 3 | - | Disclosure omits that an optional photo uploads to Cloudinary, a third party |
| **Total** | | **27/40** | **-3** | **Good - one real regression, three previously-unexamined gaps** |

No heuristic n/a. Operate surface with hardware permission, irreversible write, real repeat-use paths: 7 and 10 apply.

Drop 30 -> 27: only H1 is a genuine regression (the polish pass fixed the resting CTA and never checked its loading
state). H4, H7, H10 fell because this run scored what prior runs never examined (destination surface, repeat-scan
population, photo disclosure). H9 fell because the focus fix covers the rarer branch.

Cognitive load: 4 failures of 8 (high/critical). Failed: single focus, visual hierarchy, working memory, progressive
disclosure. Minimal-choices passes but sits exactly at the ceiling of 4 goal-relevant targets.

## Design Specificity Verdict

Roughly half authored. Behaviour and copy are strongly this product's; composition, viewfinder and iconography are
category-interchangeable.

Authored: ALLOWED_PREFIXES (QRScanner.tsx:38,:148) refuses off-origin/off-route decoded URLs before router.push -
the thesis enacted, and the only reason a hostile door-frame sticker cannot steer a visitor through the app.
describeFailure() (:45-106) matches seven causes against [err.name, err.message, String(err)], the only shape that
works because html5-qrcode rejects with plain strings. The disclosure refuses a location claim because geofenceStatus
is documented but never captured.

Interchangeable: the h1 -> lede -> glass card -> boxed disclosure -> 3-step list -> footer link stack ships unchanged
for a parking garage or a gym. The viewfinder is a black rounded-2xl rectangle whose actual overlay is html5-qrcode's
UNSTYLED DEFAULT qrbox shading - the one moment the product is on screen doing its job is rendered by a dependency.
Camera/ScanLine/ShieldCheck is the standard lucide triple.

Missed opportunity: components/landing/RecordPanel.tsx exists and globals.css:251-294 already ships its keyframes
(record-row-in, seal-sweep, seal-lock). The idle placeholder - largest above-fold object, zero information - is the
natural home for a two-line version. The landing gets the signature component; the surface where the write happens
gets a dashed rectangle.

Deterministic scan: exit 0, ZERO findings on both runs (target files; then wider app/scan + components/scanner).
No false positives because nothing fired. Genuinely clean for the rules the text engine implements, but uninformative
about this page's real problems: disabled-state contrast, focus management, copy accuracy, cross-surface consistency.

Independent agreement: the design review flagged font-bold (700) on the wordmark at page.tsx:84 as breaking the
Two-Weight Rule; the blind static sweep found the identical line as the ONLY off-scale weight in either file. Zero
font-medium, zero hardcoded color literals, zero arbitrary spacing values.

Correction to Assessment B: it reported app/scan/[locationId]/ does not exist. It does (page.tsx, 2306 bytes) - the
check was defeated by zsh bracket-globbing, so its sweep never reached the destination file. Assessment A's readings
of that file stand and were re-verified directly by the parent.

## Overall Impression

The error architecture is better than most shipped products and should not be touched. Everything above it is weaker
than one pass ago: the polish pass fixed the resting CTA and made its loading state worse, and the layout pass,
optimising the button above the fold, put the consent BELOW the action it should inform. Biggest opportunity: the page
describes an immutable write in prose and shows nothing, while the component that renders exactly that sits in the repo.

## What's Working

1. describeFailure() is a taxonomy, not a message bag. Seven causes with real instructions, and a retryable boolean the
   render tree uses STRUCTURALLY: non-retryable removes the CTA (:317-321) and promotes the fallback to a filled accent
   panel headed "Two other ways in".
2. ALLOWED_PREFIXES is the thesis as behaviour - the one element where the interface does the thing rather than
   describing it.
3. The disclosure declines to over-claim. CLAUDE.md and RecordPanel.tsx both imply geofenceStatus is captured; no code
   path sends it; the disclosure makes no location claim. PRODUCT.md principle 4 applied where it costs something.

## Priority Issues

### [P1] `starting` is illegible, unfocusable and silent; retryable failures never recover focus
QRScanner.tsx:327 passes isLoading; button.tsx:52 `isDisabledFinal = isDisabled ?? disabled ?? isLoading ?? false`
collapses it into a native disabled attribute at --disabled-opacity 0.5. Computed: white label over .gradient-cta at
50% = ~1.5:1 light (~4.0:1 dark) - breaks specifically in the daytime lobby. The disabled attribute blurs the element
(focus -> <body>) for up to the full 10s watchdog, and the polite region (:346) is empty during starting. Separately
:276-278 gates focus recovery on `deadEnd`, so permission-blocked / busy / timeout (all retryable, the three most
common) announce via role=alert but anchor nowhere.
Fix: do not disable to show progress - keep enabled with aria-busy, swap the label, hold resting contrast. Add the
starting message to the polite region. Change `if (deadEnd)` to `if (failure)`. Also :120's unmount cleanup is
`scannerRef.current?.stop().catch(() => {})` with NO try/catch - the exact synchronous-throw shape the comment at
:249-253 documents having fixed 130 lines below, which the notes say "silently broke every failure path".
-> /impeccable harden

### [P1] Consent sits below the button that triggers the camera, and omits the third-party upload
Above the CTA (page.tsx:99): the benign three. Below it (:112): IP, browser, device id - under the smallest, faintest
heading on the page. Worse: "The camera feed never leaves your device" sits three words from "a photo are optional",
and lib/cloudinary.ts:10-13 POSTs the selfie to https://api.cloudinary.com/v1_1/... , an unauthenticated upload preset
on a third-party host OUTSIDE the organisation. A reasonable reader concludes the photo stays local.
Fix: move the COMPLETE capture list above the CTA as a compact scannable micro-list; add "If you choose to take a
photo, it is uploaded and stored with your entry"; delete the duplicated capture list from the lede.
-> /impeccable clarify

### [P1] Designed as a fallback, shipped as the front door
The last three passes re-scoped this page as the fallback and rebuilt the layout on that premise. The only two inbound
links present it as primary: app/landing/page.tsx:160 (hero visitor CTA) and app/quest/[questToken]/page.tsx:124
("Open Scanner"). Nothing routes here as recovery. Copy, information order and the missing "where is the code?"
affordance all assume a failure that never happened.
Fix: an owner decision, not a fourth layout pass. Either the landing CTA stops pointing here (door instructions
instead, /scan linked beneath as recovery, and this page's first line acknowledges the failure), or accept it as a
front door and give it the affordance a front door needs.
-> /impeccable shape

### [P2] A stray QR in frame kills the camera
:231-237 calls scanner.stop() and sets phase idle BEFORE handleDecoded runs its origin/route check. A wifi QR, a menu
or a poster in frame yields "That code is not a check-in code" with the camera already shut down. html5-qrcode fires on
any QR in frame; a lobby door is full of them. Contradicts step 2's "It reads itself".
Fix: keep the scanner running on a rejected decode, surface the notice inline, stop only on a valid target.
-> /impeccable harden

### [P2] The visual world collapses one route later
app/scan/[locationId]/page.tsx -> CheckInOut.tsx:410 uses hardcoded light-only bg-gradient-to-br from-slate-50 via-
cyan-50/30 to-teal-50/20 at max-w-sm (384 vs 544px), hardcoded bg-red-50/text-sky-600/text-amber-600, no wordmark, no
glass, no .shell, NO dark mode. Kiosk-token errors (:52-66) are a bare centred sentence with no header and no route
forward from "QR code expired".
Fix: queue that surface next; polishing /scan while ignoring its destination polishes a doorway into an unfinished room.
-> /impeccable polish (on app/scan/[locationId], its own pass)

## Persona Red Flags

Casey (distracted mobile, poor light): taps Start scanner; button drops to 50% opacity, "Starting camera..." ~1.5:1 on
the light theme; taps again, busy.current (:175) swallows it silently; taps a third time. NO TORCH CONTROL anywhere in
QRScanner.tsx despite the brief naming poor light in the usage scene.

Sam (screen reader + keyboard): Enter on Start scanner -> native disabled blurs it -> focus on <body>, role=status
empty during starting. Silence for up to 10s and place in document lost. On retryable failure role=alert announces but
:276's deadEnd gate does not fire, so Sam tabs from the top to find "Try again". Correct and well-reasoned: sr-only h2
(:284), split live regions, always-visible fallback block.

Riley (stress tester): one wifi sticker shuts down the page's only function. Navigating away mid-starting hits the
un-try/caught :120 cleanup - the documented regression shape, back in the file.

Dara (quest-card participant, project-specific): five-stop chain routed here from quest/[questToken]/page.tsx:124 for
every stop. No return path to a live scanner after router.push (:158) - five cold starts, ~15 taps. Step 3's "Your
entry is written once" is true per-location and confusing across five.

## Minor Observations

- #qr-reader video { height: auto !important } (globals.css:417-421) overrides [&_video]:size-full and makes
  object-cover dead code. At [@media(max-height:540px)]:h-28 the container clips to 112px while the video renders at
  intrinsic ratio (~408px on a 544px column): the visible strip is the TOP of the frame while the decode region is its
  CENTRE. The landscape fix may have traded a fold problem for an aiming problem. Needs live confirmation.
- Header alignment: .shell puts the logo at x~65 on desktop while the centred max-w-[34rem] column starts at x~448 -
  383px apart, exactly the "three stacked max-widths" .shell's own comment warns about.
- Two brand gradients in one view: LogoTile sky-500->cyan-500->teal-500 vs .gradient-cta #0369a1->#0f766e. In dark mode
  this inverts hierarchy - headline tokens go bright while the CTA stays dark navy-teal (~3.2-3.5:1 on #0f0f1e),
  making the primary control the dimmest branded object on the page.
- Touch targets: Stop scanner resolves to h-11 below md but h-10 (40px) at >=768px - under 44px on desktop, and 4px
  smaller than Start scanner's 48px, so the control shrinks the moment scanning begins.
- font-bold (700) on the wordmark (page.tsx:84) breaks the Two-Weight Rule on the brand's own name.
- Fallback copy leaks across surfaces: "Ask at reception" / "use your phone's own camera app" are baked into the shared
  QRScanner, so they also render on /terminal where the operator IS reception.
- ParticleField gated on pointer:fine (:241): the phone gets one static frame while still paying for a canvas, an
  IntersectionObserver and eight listeners on venue wifi. Unlike the landing, /scan applies no fade mask, so the dot
  grid runs behind the consent text to the page foot.
- Steps 1 and 2 restate the scanning live-text verbatim; step 3 is the only new information and is below the fold.
- A successful decode announces nothing - App Router router.push moves no focus and fires no announcement.

## Questions to Consider

1. If the realistic path is the native camera opening /scan/[locationId], why does the landing hand visitors this page
   instead of door instructions? And if it IS the fallback, what does it look like honestly titled "The camera didn't
   work", with the two working routes first and the scanner third?
2. Is /scan a page, or a route wrapper around a component four surfaces each need differently? Should the fallback
   routes be a prop?
3. Does an append-only ledger owe a stranger a retention period AND a deletion answer? If nothing can ever be removed,
   is that a sentence the page is brave enough to print ABOVE the button?
4. geofenceStatus is documented as captured in CLAUDE.md, rendered as geofence_status: inside on the landing's
   RecordPanel under a caption claiming these are the engine's real rules, and never sent by any code path. Which
   surface is lying?
5. Why does the visitor's twenty seconds get the Glass Vault while the four screens that take their name, purpose,
   gender and photo get a hardcoded slate gradient with no dark mode? Which is the product?
6. What if tapping Start scanner opened a full-bleed viewfinder - no chrome, no explainer, no fold - and this entire
   page became what you return to when it fails?
