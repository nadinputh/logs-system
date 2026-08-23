---
version: 1
slug: "app-scan-page-tsx"
primary_target: "app/scan/page.tsx"
related_targets: ["app/landing/page.tsx","components/scanner/QRScanner.tsx"]
---

# Surface brief — Scan (`app/scan/page.tsx`)

## Mode
**Operate.** The visitor completes a task: get through the door. Success is a recorded
check-in, fast, by someone who has never seen this product and will never see it again.
Scanability and the real usage scene outrank expression.

## Usage scene
A one-time visitor standing at a reader, holding a phone, one-handed, mildly hurried,
possibly on venue wifi. The desktop case is real but secondary — usually someone who
clicked through from the landing.

## Visual world
**The Glass Vault**, shared with the landing (DESIGN.md, unchanged). Same two atmosphere
layers, same shell, same accent, same glass.

## Direction (2026-08-22)
Given the same treatment as the landing, with one deliberate divergence.

1. **Not the landing's width.** A camera viewfinder does not want 1440px. The `.shell`
   aligns the spine with the landing, but the width is spent on supporting content
   *beside* the task (`lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]`) rather than on
   stretching the viewfinder. Mobile stacks, task as high as possible.
2. **Server component.** framer-motion removed — it was rendering the page at
   `opacity: 0` until hydration, on the surface where speed matters most. `html5-qrcode`
   is imported inside the tap handler, so the scanner's idle state server-renders
   instead of hiding behind a `dynamic(ssr:false)` spinner.
3. **Kicker removed.** The "CHECK IN" chip above the h1 was the one thing the craft floor
   bans outright.
4. **Step cards → a sequence.** Three same-size icon+heading+text cards were the refused
   page scaffold; supporting content is now a numbered list with no card chrome.

## States are the deliverable here
This is where the product most often fails a stranger. Every camera refusal now has a
named cause and a recovery instruction, never the raw browser exception:
insecure context (checked *before* the tap — a LAN kiosk hits this), permission blocked,
no camera, camera busy, no rear camera, and a QR that is not a check-in code. Plus a
loading phase, a stop control, a stable-height idle placeholder, and one `aria-live`
region so a screen reader hears all of it.

## Constraints carried
- Decoded QR content is untrusted input: only same-origin URLs under `/scan/`, `/quest/`
  or `/terminal` are followed. A security product must not let any QR sticker steer a
  visitor through its own app.
- Never fabricate proof; no claims beyond what CLAUDE.md documents.
- `--status-danger` is text-only, per DESIGN.md's foreground-pairs rule.

## Related
`app/landing/page.tsx` (the other door — must stay visually consistent),
`components/scanner/QRScanner.tsx`, `app/scan/[locationId]/page.tsx` (the destination).
