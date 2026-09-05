---
name: Kamnotheat
description: Secure check-in logging — passkeys, QR, and an immutable audit ledger, rendered as a glass vault.
colors:
  sky-signal: "#0ea5e9"
  cyan-core: "#06b6d4"
  cyan-deep: "#0891b2"
  teal-depth: "#0d9488"
  sky-deep: "#0284c7"
  ink-vault: "#0f0f1e"
  paper: "#ffffff"
  surface-muted-light: "oklch(96.5% 0.001 286.375)"
  surface-muted-dark: "oklch(27.4% 0.006 286.033)"
  status-success: "#047857"
  status-success-dark: "#6ee7b7"
  status-warning: "#b45309"
  status-warning-dark: "#fcd34d"
  status-track: "#64748b"
typography:
  display:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 5vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
rounded:
  sm: "8px"
  md: "16px"
  lg: "24px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.cyan-core}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "0 28px"
    height: "48px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.cyan-deep}"
    rounded: "{rounded.full}"
    padding: "0 28px"
    height: "48px"
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    padding: "28px"
  chip:
    backgroundColor: "{colors.cyan-core}"
    textColor: "{colors.cyan-deep}"
    rounded: "{rounded.full}"
    padding: "6px 16px"
    typography: "{typography.label}"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink-vault}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "44px"
---

# Design System: Kamnotheat

## Overview

**Creative North Star: "The Glass Vault"**

Kamnotheat renders a paradox as a single surface: an immutable, vault-grade record of who was where and when, made visible through frosted glass. The interface earns trust not by looking locked-down and opaque, but by looking *seen-through* — translucent panels, soft cyan light, and calm neutral space that says "nothing here is hidden, and nothing here can be altered." Security is communicated as clarity, not as friction.

The mood is **calm and authoritative**. This is enterprise software for a security/facilities administrator who audits a whole estate, so restraint is the point: composed spacing, disciplined color, and motion that reveals rather than performs. The cyan–teal identity appears as a *signal* against quiet ground — a gradient headline, a glowing CTA, a glass panel edged in colored light — never as wall-to-wall saturation. Framer-motion reveals (fade-up, staggered children, scroll-linked hero fade) give the system a composed, deliberate cadence; nothing snaps or bounces.

Depth is **glass plus colored glow**: frosted translucent surfaces (`backdrop-filter: blur(12px)`) floating over a subtly layered background, lifted by soft cyan-tinted shadows. Light and dark modes are first-class (next-themes, `class` strategy) — light mode is bright paper with cyan light; dark mode is a deep indigo-black vault (`#0f0f1e`) where the glass and glow do more of the work. The base component library is HeroUI v3 (neutral, accessible primitives); Kamnotheat's identity lives in the brand gradient, the glass, and the glow layered on top.

**Key Characteristics:**
- Translucency as trust — frosted glass over layered ground, never flat opaque boxes for hero surfaces
- A single cyan→teal signal against calm neutrals; the accent is rare and intentional
- Calm, deliberate motion — reveals and fades, never bounce or spectacle
- Fully dual-mode: bright paper vault (light) and deep indigo vault (dark)
- HeroUI v3 primitives as the accessible substrate; brand lives in the gradient, glass, and glow

## Colors

A disciplined cyan→teal signal palette on calm, near-neutral ground. The brand is a single flowing gradient (sky → cyan → teal); everything else is quiet.

### Primary
- **Cyan Core** (#06b6d4): The identity anchor. The center of the brand gradient, the theme-color (`#0891b2`, Cyan Deep, for the browser chrome and PWA), and the hue every glow and focus ring is tinted with.
- **Cyan Deep** (#0891b2): The stronger, more legible cyan for text-on-light, secondary-button labels, and the manifest/theme color.

### Secondary
- **Sky Signal** (#0ea5e9): The bright top of the gradient. Opens the primary CTA and the logo tile; reads as the "fast, live" end of the signal.
- **Sky Deep** (#0284c7): The saturated start of the gradient-text treatment used on headlines and stat values.

### Tertiary
- **Teal Depth** (#0d9488): The grounded bottom of the gradient. Closes the CTA and gradient-text sweep; adds the "certainty / depth" counterweight to the brighter sky.

### Neutral
- **Paper** (#ffffff): Light-mode base surface and the fill of glass panels at rest.
- **Ink Vault** (#0f0f1e): Dark-mode base — a deep indigo-black. The glass tints to `rgba(15,15,30,0.8)` over it.
- **Surface Muted** (`oklch(96.5% 0.001 286.375)` light / `oklch(27.4% 0.006 286.033)` dark): The `--default` token behind muted fills (`.bg-muted` and its opacity steps), used for inset panels, table zebra, and secondary chips.
- **Semantic neutrals (HeroUI):** `background`, `foreground`, `muted-foreground`, `border`, and `overlay` resolve from HeroUI v3's theme and carry all body text, dividers, and container strokes. Treat these as the source of truth for neutrals; do not hardcode grays.

### Semantic Status
These are *state* colors, not brand colors — they report live-occupancy, completion, and data state inside the console. They are deliberately narrow and never compete with the cyan signal. Each ships a light and a dark foreground so it holds contrast in both vaults.

- **Success — "Occupied Green"** (text `#047857` light / `#6ee7b7` dark, on a `emerald-500/10` wash; `#10b981` for solid bar/dot fills): "Currently checked in", the live-occupancy dot, "Still IN" counts, and the active-team pill. Carries the "someone is present" signal — the one status an admin scans for first.
- **Warning — "Pending Amber"** (text `#b45309` light / `#fcd34d` dark, on an `amber-500/10` wash; `#f59e0b` for solid fills): overdue or attention states (e.g. stale-log candidates), and the building tier in location-type accents.
- **Neutral Track — "Slate"** (`#64748b`): the "checked out / inactive / resolved" half of completion bars and inert progress tracks. The quiet counterpart to Occupied Green.

**Foreground pairs are mandatory.** Use the light value on light, the dark value on dark (`text-emerald-700 dark:text-emerald-300`); the raw `-500` hue is for graphic fills (bars, dots, icon tiles) only, never for text.

### Role Identity
Team role badges (`roleBadgeClass()`, `app/settings/team/page.tsx`) are *identity*, not state — they must never borrow a Semantic Status or brand hue, or a role badge starts reading as a live condition instead of a fixed label. Each carries the same mandatory light/dark foreground pair as Semantic Status colors, on a `-500/10` wash with a `-500/20` border.

| Role | Hue | Classes |
|------|-----|---------|
| Owner | Rose | `bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20` |
| Admin | Violet | `bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20` |
| Manager | Indigo | `bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20` |
| Auditor | Neutral (HeroUI default) | `bg-default text-muted border-border` |
| Member | Zinc | `bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20` |

Off-limits for role identity: cyan/sky/teal (brand, One Signal Rule), and emerald/amber/slate (already Semantic Status — Success/Warning/Neutral Track above). Owner and Member previously used amber and slate respectively; both were moved off in 2026-09 after a design critique found Owner's badge shared the exact class combo used by warning banners elsewhere in the console, and Member's badge shared the completion-bar "Neutral Track" hue — both are Status-Is-Not-Brand Rule violations even though neither is a brand color.

### Named Rules
**The Status-Is-Not-Brand Rule.** Semantic Status colors report state; they never carry identity. Keep them to badges, dots, bars, and counts — small surfaces, ≤10% of a view — so they read as instrumentation against the neutral ground, and never let a status hue stand in for the cyan signal (or vice versa). This is what keeps the One Signal Rule intact on a data-dense console.

**The One Signal Rule.** The cyan→teal gradient is the *only* chromatic voice on a screen. It appears on ≤10% of any view — one headline, one CTA, one glowing edge — against otherwise neutral ground. Two competing gradients on one screen breaks the vault.

**The Gradient-Direction Rule.** The brand gradient always flows `135deg`, sky→cyan→teal (top-left bright to bottom-right deep). Never reverse it, never rotate it per-component; the light always comes from the same corner.

## Typography

**Display / Body Font:** Inter Variable (with Inter, system-ui, sans-serif)
**Label Font:** Inter Variable, uppercase with wide tracking (no separate family)

**Character:** One voice, worked hard. Inter carries everything from the extrabold gradient hero to fine print; hierarchy comes from weight, size, and tracking rather than a second typeface. The effect is precise and modern — engineered, not decorated. (Geist and Geist Mono ship in the repo but are not wired into the layout; Inter is the live family. If a monospace is ever needed for tokens/hashes, wire Geist Mono rather than importing a new face.)

### Hierarchy
- **Display** (800, `clamp(2.25rem, 5vw, 3.75rem)`, line-height 1.05, tracking -0.02em): Hero headlines only. Often paired with the gradient-text treatment on one clause.
- **Headline** (800, 1.875rem, tracking -0.015em): Section titles and page headers inside the console.
- **Title** (600, 1.125rem): Card titles, list-row headers, dialog titles.
- **Body** (400, 1rem, line-height 1.6): Paragraph and descriptive copy, typically in `muted-foreground`. Keep measure ≤ 68ch.
- **Label** (600, 0.75rem, letter-spacing 0.12em, UPPERCASE): Eyebrows, chips, stat captions, and metadata. The uppercase micro-label is a signature.

### Named Rules
**The Two-Weight Rule.** Type lives at 400 (body) and 800 (display/headline), with 600 for titles and labels. Skip the middle weights (500/700) so the hierarchy stays crisp and the extrabold headlines keep their impact.

**The Split-Clause Headline Rule.** In hero display type, only *one* clause gets the gradient-text fill; the rest stays in `foreground`. "Zero-friction check-ins. / **Cryptographic certainty.**" — the emphasis, not the whole line.

## Layout

A centered, single-column reading spine for marketing and auth surfaces; a denser, aligned grid for the console. Marketing sections cap at `max-w-4xl`–`max-w-5xl` and center within generous horizontal padding (`px-4 sm:px-6`); feature and stat grids run `grid` at `sm:grid-cols-2 lg:grid-cols-3` (or `grid-cols-2 sm:grid-cols-4` for stats) with `gap-4`. Vertical rhythm is roomy on landing (section padding `py-20`–`py-28`) and tighter inside the console where scan-density matters.

The spacing scale is Tailwind's 4px base; the reused steps are 8 / 16 / 24 / 40 / 64px. Breakpoints follow Tailwind defaults (`sm` 640, `lg` 1024); the primary responsive shift is single-column → multi-column grids and stacked → row CTA groups (`flex-col sm:flex-row`). Content is `text-center` on hero/marketing moments and left-aligned in the console.

## Elevation & Depth

Glass plus colored glow — a hybrid of translucency and soft, tinted shadow rather than hard drop shadows. Hero and floating surfaces use `backdrop-filter: blur(12px)` over a translucent fill (`.glass` = `rgba(255,255,255,0.8)` light / `rgba(15,15,30,0.8)` dark), so the layered background and particle field read faintly through the panel. Lift is carried by cyan-tinted shadows, not neutral gray ones, which is what makes the glow feel like the brand rather than generic Material elevation.

### Shadow Vocabulary
- **Signal glow** (`box-shadow: 0 20px 40px -12px rgba(6,182,212,0.30)`): Under the primary CTA and the logo tile — the branded lift. Cyan-tinted, generous, soft.
- **Panel float** (`box-shadow: 0 8px 24px rgba(0,0,0,0.08)` light): Neutral, quiet lift for glass cards and console containers at rest.
- **Ambient border-light** (`border` at `white/20` over glass): Stat cards and translucent panels get a hairline of light instead of a heavy shadow.

### Named Rules
**The Cyan-Shadow Rule.** When a surface carries the brand (CTA, logo, active state), its shadow is tinted cyan (`shadow-cyan-500/25`–`/30`), never neutral gray. Brand lift glows; neutral lift just floats.

**The See-Through-At-Rest Rule.** Hero and overlay surfaces are translucent glass by default, not opaque. If you can't see the background faintly through a floating panel, it's not a Glass Vault surface — it's a box.

## Shapes

Soft, confident, pill-forward. Interactive controls are fully rounded: buttons, chips, eyebrows, and the theme toggle are `rounded-full` (9999px). Containers are generously curved — cards and glass panels at `rounded-3xl` (24px), the logo tile and mid-size surfaces at `rounded-2xl` (16px), inputs and small controls at `rounded-lg` (8px). Borders are hairline and low-contrast (`border-border`, or `white/20` over glass) — structure comes from radius, translucency, and glow, not from heavy strokes. The recurring silhouette is a softly-cornered glass rectangle floating above a layered field, with a pill CTA glowing at its base.

## Components

### Buttons
- **Shape:** Fully rounded pill (`rounded-full`, 9999px), fixed comfortable height (`h-12` / 48px on marketing CTAs).
- **Primary:** The brand gradient made tactile — `linear-gradient(90deg, #0ea5e9 → #0d9488)`, white label, cyan Signal-glow shadow. Icon + label, label in the uppercase micro-style or semibold sentence case per context.
- **Hover / Focus:** Lifts on hover (`hover:scale-[1.03]`, ~200ms); focus shows a visible cyan focus ring. Motion is a gentle scale, never a color flip.
- **Secondary / Ghost:** Bordered pill on translucent `overlay/80` fill with `foreground` label that shifts to cyan on hover (`hover:bg-accent/10 hover:text-accent`). Used for "Open the console"-style alternates beside the primary CTA.
- **Base:** All buttons are HeroUI v3 `Button` (via `components/ui/button.tsx`); `default`→`primary`, `outline`/`secondary`/`ghost` map through the adapter. Use `onPress`/`isDisabled`.

### Chips
- **Style:** Pill (`rounded-full`) with a tinted brand wash (`bg-accent/10`) and cyan-deep uppercase label, sometimes with a leading icon (e.g. the "Enterprise check-in engine" eyebrow uses a `border-accent/20` outline).
- **State:** Primarily used as static eyebrows and metadata badges; selected/active states tint toward solid cyan.

### Cards / Containers
- **Corner Style:** `rounded-3xl` (24px) for feature/stat cards; `rounded-2xl` for tighter tiles.
- **Background:** Glass at rest (`bg-background/25` + `backdrop-blur-sm` on translucent panels) or `paper`/HeroUI `Card` surface in the console.
- **Shadow Strategy:** Panel-float at rest; see Elevation. Brand-bearing cards get the cyan Signal-glow.
- **Border:** Hairline `white/20` over glass, or `border-border` on solid cards.
- **Internal Padding:** 24–28px (`p-6`/`p-7`).
- **Base:** HeroUI v3 `Card.*` compound components via `components/ui/card.tsx`.

### Inputs / Fields
- **Style:** HeroUI v3 `Input` inside `TextField` (`components/ui/input.tsx`), `rounded-lg`, subtle stroke on `paper`/surface fill, full-width by default.
- **Focus:** Cyan focus ring / border shift consistent with the brand accent.
- **Accessibility:** The adapter always supplies an `aria-label` (from `aria-label` → placeholder → id) — keep that guarantee when extending.

### Navigation
- **Style:** Glass top bar with the shield `LogoTile` + "Kamnotheat" wordmark (semibold, `tracking-tight`), a `ThemeToggle`, and pill CTAs. On the marketing surface the nav is minimal and recedes; inside the console (`NavBar.tsx`) it carries role-aware links.
- **States:** Links default to `foreground`/`muted-foreground` and shift to cyan (`text-accent`) on hover/active.

### Signature Component — Particle Field
`components/ParticleField.tsx` renders an animated dot field behind the landing hero — the "atmosphere" of the vault. It is a background texture, never interactive chrome; keep it low-contrast, behind glass, and confined to marketing/hero moments. Do not carry it into dense console/admin views.

## Do's and Don'ts

### Do:
- **Do** keep the cyan→teal gradient as the single chromatic voice per screen (The One Signal Rule), flowing 135° sky→cyan→teal every time.
- **Do** make floating hero/overlay surfaces translucent glass (`backdrop-blur(12px)`) so the layered ground shows through (The See-Through-At-Rest Rule).
- **Do** tint brand-bearing shadows cyan (`shadow-cyan-500/25`–`/30`); reserve neutral shadows for non-brand lift (The Cyan-Shadow Rule).
- **Do** build on HeroUI v3 primitives via the `components/ui/*` adapters, using `onPress`/`isDisabled` and the compound `Card.*`/`Modal.*` APIs.
- **Do** support light and dark equally — test glass and glow against both `paper` and the `#0f0f1e` vault.
- **Do** apply gradient-text to only one clause of a hero headline (The Split-Clause Headline Rule).
- **Do** use uppercase, wide-tracked (`0.12em`) micro-labels for eyebrows, chips, and metadata.

### Don't:
- **Don't** flatten the brand into opaque boxes with gray drop shadows — that's generic SaaS, not the Glass Vault.
- **Don't** run two gradients, or paint large fields of saturated cyan; the accent's rarity is the point.
- **Don't** introduce a second type family — hierarchy is weight/size/tracking in Inter. (If a mono is truly needed, wire the already-present Geist Mono.)
- **Don't** use bouncy or attention-seeking motion; reveals fade and lift, calm and deliberate.
- **Don't** carry the Particle Field or heavy hero glass into dense console/admin tables where scan-density matters — flatten there.
- **Don't** hardcode neutral grays; use HeroUI semantic tokens (`background`, `foreground`, `muted-foreground`, `border`, `overlay`).
