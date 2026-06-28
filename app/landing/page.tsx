'use client'

import Link from 'next/link'
import { useRef } from 'react'
import {
  motion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion'
import { ParticleField } from '@/components/ParticleField'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  ArrowRight,
  Building2,
  CalendarClock,
  Camera,
  CheckCircle2,
  Clock,
  Fingerprint,
  Gauge,
  KeyRound,
  Layers3,
  LockKeyhole,
  QrCode,
  RadioTower,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  Animation helpers                                                         */
/* -------------------------------------------------------------------------- */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.21, 0.47, 0.32, 0.98] },
  },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

function Reveal({
  children,
  className = '',
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Data                                                                      */
/* -------------------------------------------------------------------------- */

type Feature = { Icon: LucideIcon; title: string; description: string }

const coreFeatures: Feature[] = [
  {
    Icon: Building2,
    title: 'Location hierarchy',
    description:
      'Model your whole estate — buildings, floors, and rooms — with full admin CRUD and per-room check-in spots.',
  },
  {
    Icon: QrCode,
    title: 'Static & printable QR',
    description:
      'Generate a permanent QR for any room, then print kiosk-ready pages straight from the admin console.',
  },
  {
    Icon: ScanLine,
    title: 'iOS-safe scanner',
    description:
      'An in-app html5-qrcode scanner that initializes inside a user gesture so it just works on iOS Safari.',
  },
  {
    Icon: Camera,
    title: 'Identity & selfie capture',
    description:
      'Visitor identity, open-log detection, and optional Cloudinary selfie verification on every check-in.',
  },
  {
    Icon: Gauge,
    title: 'Live dashboard',
    description:
      'Today, live-on-site, and all-time totals with loading skeletons and realtime log updates.',
  },
  {
    Icon: ScrollText,
    title: 'Logs everywhere',
    description:
      'Staff see their own check-ins; admins audit every entry across the organization in one view.',
  },
]

const securityFeatures: Feature[] = [
  {
    Icon: LockKeyhole,
    title: 'Append-only ledger',
    description:
      'Logs are immutable. Check-out writes a new linked document — nothing is ever mutated in place.',
  },
  {
    Icon: ShieldCheck,
    title: 'Immutable audit trail',
    description:
      'Every admin correction is recorded in a separate ledger: who, which field, old value, new value, and why.',
  },
  {
    Icon: Fingerprint,
    title: 'Anti-spoof metadata',
    description:
      'Each entry captures device ID, server-side IP, user agent, and a geofence pass/fail against your polygon.',
  },
  {
    Icon: Clock,
    title: 'Server-authoritative time',
    description:
      'Client timestamps are rejected outright. Every log is stamped by the server with NTP-drift guards.',
  },
  {
    Icon: CheckCircle2,
    title: 'Idempotency engine',
    description:
      'SHA-256 keys with a 24-hour MongoDB TTL guarantee duplicate writes can never double-book a check-in.',
  },
  {
    Icon: CalendarClock,
    title: 'Auto check-out',
    description:
      'A nightly cron resolves logs left open past 12 hours, flagging them and writing a correction entry.',
  },
]

type FlowSection = {
  tag: string
  Icon: LucideIcon
  title: string
  body: string
  points: string[]
}

const flowSections: FlowSection[] = [
  {
    tag: 'Fast-path UX',
    Icon: RadioTower,
    title: 'Dynamic QR kiosk loop',
    body: 'A kiosk rotates a freshly signed QR every 15 seconds — a photographed screen is worthless the moment it refreshes.',
    points: [
      'Short-lived signed tokens issued server-side',
      'Signature + expiry verified before any check-in',
      'Auto-refreshing display, zero staff intervention',
    ],
  },
  {
    tag: 'Reverse scan',
    Icon: Smartphone,
    title: 'Personal QR, fixed terminal',
    body: 'Each user shows a personal 30-second QR that an admin-locked terminal scans to check them in.',
    points: [
      'Ephemeral 30s personal session tokens',
      'Terminal decodes and identifies the user',
      'Admin-locked scanner page',
    ],
  },
  {
    tag: 'Cryptographic auth',
    Icon: KeyRound,
    title: 'Passkeys & FIDO2',
    body: "Bind check-ins to a device's Secure Enclave or TPM, with every passkey-verified entry flagged on the log.",
    points: [
      'Replay-protected credential counters',
      'Co-exists with password credentials',
      'passkeyVerified stamped on each log',
    ],
  },
  {
    tag: 'Engagement',
    Icon: Sparkles,
    title: 'Quest cards & routes',
    body: 'Turn a building into a guided route with bulk-issued quest cards, each validated step-by-step in order.',
    points: [
      'Location-chain & custom quests',
      'Bulk issuance with per-card QR',
      'Ordered step validation API',
    ],
  },
]

const stats = [
  { value: '12h', label: 'Auto-checkout window' },
  { value: '15s', label: 'Kiosk QR rotation' },
  { value: '256', label: 'Bit idempotency keys' },
  { value: '100%', label: 'Append-only logs' },
]

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const heroFade = useTransform(scrollYProgress, [0, 0.8], [1, 0])

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Continuous ambient colour wash — fixed so it never cuts at a section border */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -left-40 -top-40 size-[44rem] rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute -right-48 -top-56 size-[36rem] rounded-full bg-teal-500/[0.06] blur-3xl" />
        <div className="absolute -bottom-48 left-1/4 size-[40rem] rounded-full bg-cyan-400/[0.07] blur-3xl" />
      </div>

      {/* Interactive physics dot field (antigravity-style) — fixed viewport layer */}
      <ParticleField className="fixed inset-0 z-0" />

      <div className="relative z-10">
      {/* ---------------------------------------------------------------- Nav */}
      <header className="sticky top-0 z-50 border-b border-white/20 bg-background/10 backdrop-blur-3xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Link href="/landing" className="group flex items-center gap-3">
            <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
            <span className="hidden sm:block">
              <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
              <span className="block text-[11px] font-medium text-muted-foreground">Secure check-in logging</span>
            </span>
          </Link>

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {[
              ['Features', '#features'],
              ['Security', '#security'],
              ['Flows', '#flows'],
              ['How it works', '#how'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-full px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/10 hover:text-accent"
              >
                {label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-teal-500 px-5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition-transform hover:scale-[1.03]"
            >
              Sign in
              <ArrowRight className="size-4" strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- Hero */}
      <section ref={heroRef} className="relative">
        <motion.div
          style={{ opacity: heroFade }}
          className="relative mx-auto max-w-4xl px-4 pb-24 pt-20 text-center sm:px-6 sm:pt-28"
        >
          <motion.div variants={stagger} initial="hidden" animate="show">
            <motion.div variants={fadeUp}>
              <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent">
                <Sparkles className="size-3.5" strokeWidth={2.5} />
                Enterprise check-in engine
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              className="mt-6 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl"
            >
              Zero-friction check-ins.
              <br />
              <span className="gradient-text">Cryptographic certainty.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground"
            >
              A high-throughput, immutable check-in/out logging system that pairs
              passkeys, QR, and BLE with strict cryptographic security, compliance
              tracking, and automated edge-case resolution.
            </motion.p>

            <motion.div
              variants={fadeUp}
              className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <Link
                href="/scan"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-sky-500 to-teal-500 px-7 text-sm font-semibold text-white shadow-xl shadow-cyan-500/30 transition-transform hover:scale-[1.03]"
              >
                <QrCode className="size-4.5" strokeWidth={2.4} />
                Scan to check in
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-border bg-overlay/80 px-7 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/10 hover:text-accent"
              >
                Open the console
                <ArrowRight className="size-4" strokeWidth={2.4} />
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Stats strip */}
        <Reveal className="relative mx-auto max-w-5xl px-4 pb-20 sm:px-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-3xl border border-white/20 bg-background/25 px-6 py-7 text-center backdrop-blur-sm">
                <div className="text-3xl font-extrabold tracking-tight gradient-text">{s.value}</div>
                <div className="mt-1 text-xs font-medium text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ----------------------------------------------------------- Features */}
      <Section
        id="features"
        eyebrow="Everything in the box"
        title="The complete check-in toolkit"
        subtitle="From the first room you create to the last log you audit — every step of the journey is covered."
      >
        <motion.div
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {coreFeatures.map((f) => (
            <FeatureCard key={f.title} feature={f} />
          ))}
        </motion.div>
      </Section>

      {/* ----------------------------------------------------------- Security */}
      <div className="relative overflow-hidden">
        <Section
          id="security"
          eyebrow="Anti-spoofing & compliance"
          title="Built like a ledger, not a logbook"
          subtitle="Immutability, idempotency, and server-authoritative time make every entry tamper-evident and audit-ready."
        >
          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {securityFeatures.map((f) => (
              <FeatureCard key={f.title} feature={f} />
            ))}
          </motion.div>
        </Section>
      </div>

      {/* -------------------------------------------------------------- Flows */}
      <Section
        id="flows"
        eyebrow="Fast-path interaction mechanisms"
        title="Four ways to verify a presence"
        subtitle="Pick the friction that fits the door — every flow lands in the same immutable ledger."
      >
        <div className="mx-auto grid max-w-4xl gap-3 sm:grid-cols-2 sm:gap-4">
          {flowSections.map((flow, i) => (
            <FlowCard key={flow.title} flow={flow} index={i} />
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- How it works */}
      <div className="relative overflow-hidden">
        <Section
          id="how"
          eyebrow="How it works"
          title="Live in four steps"
          subtitle="Model your space, post the codes, let people check in, and watch the ledger fill itself."
        >
          <motion.ol
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { Icon: Layers3, step: 'Model', text: 'Create buildings, floors, and rooms in the admin console.' },
              { Icon: QrCode, step: 'Deploy', text: 'Print static QR or stand up a dynamic kiosk loop.' },
              { Icon: Workflow, step: 'Check in', text: 'Scan, passkey, or terminal — identity captured instantly.' },
              { Icon: Timer, step: 'Auto-resolve', text: 'Stale logs close themselves; corrections hit the audit ledger.' },
            ].map((s, i) => (
              <motion.li
                key={s.step}
                variants={fadeUp}
                className="relative rounded-3xl border border-white/20 bg-background/25 p-6 backdrop-blur-sm"
              >
                <span className="absolute right-5 top-5 text-5xl font-black text-accent/10">
                  {i + 1}
                </span>
                <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-teal-500/15 text-accent ring-1 ring-accent/15">
                  <s.Icon className="size-6" strokeWidth={2.2} />
                </span>
                <h3 className="mt-4 text-lg font-bold">{s.step}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.text}</p>
              </motion.li>
            ))}
          </motion.ol>
        </Section>
      </div>

      {/* ---------------------------------------------------------------- CTA */}
      <section className="px-4 py-24 sm:px-6">
        <Reveal className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-sky-500 via-cyan-500 to-teal-500 px-8 py-16 text-center text-white shadow-2xl shadow-cyan-500/30 sm:px-16">
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
              <div className="absolute -left-10 -top-10 size-72 rounded-full bg-white/20 blur-3xl" />
              <div className="absolute -bottom-16 right-0 size-80 rounded-full bg-white/10 blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
                Ready to log every presence with certainty?
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-balance text-white/85">
                Sign in to the console or scan a code to see the immutable ledger in
                action.
              </p>
              <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-sky-700 shadow-lg transition-transform hover:scale-[1.03]"
                >
                  Open the console
                  <ArrowRight className="size-4" strokeWidth={2.4} />
                </Link>
                <Link
                  href="/scan"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-white/40 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
                >
                  <QrCode className="size-4.5" strokeWidth={2.4} />
                  Scan to check in
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ------------------------------------------------------------- Footer */}
      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <LogoTile className="size-9 rounded-xl" />
            <span className="text-sm font-semibold">Kamnotheat</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Enterprise check-in/out logging engine · Immutable by design
          </p>
        </div>
      </footer>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Section & card primitives                                                 */
/* -------------------------------------------------------------------------- */

function Section({
  id,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="relative scroll-mt-20 px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            {eyebrow}
          </span>
          <h2 className="mt-3 text-balance text-3xl font-extrabold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-balance text-muted-foreground">{subtitle}</p>
        </Reveal>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}

function FeatureCard({ feature }: { feature: Feature }) {
  const { Icon } = feature
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -4 }}
      className="group rounded-3xl border border-white/20 bg-background/25 p-6 shadow-sm shadow-black/5 backdrop-blur-sm transition-colors hover:border-accent/40 hover:bg-background/40"
    >
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500/15 to-teal-500/15 text-accent ring-1 ring-accent/15 transition-transform group-hover:scale-105">
        <Icon className="size-6" strokeWidth={2.2} />
      </span>
      <h3 className="mt-4 text-lg font-bold tracking-tight">{feature.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {feature.description}
      </p>
    </motion.div>
  )
}

function FlowCard({ flow, index }: { flow: FlowSection; index: number }) {
  const { Icon } = flow
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-60px' }}
      className="group relative rounded-[1.75rem] p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-background/40 hover:shadow-xl hover:shadow-cyan-500/10 hover:ring-1 hover:ring-white/15 sm:p-10"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
          {flow.tag}
        </span>
        <span className="text-sm font-semibold tabular-nums text-foreground/15">
          {String(index + 1).padStart(2, '0')}
        </span>
      </div>
      <Icon
        className="mt-7 size-11 text-accent transition-transform duration-500 group-hover:scale-110"
        strokeWidth={1.2}
      />
      <h3 className="mt-6 text-xl font-bold tracking-tight sm:text-2xl">{flow.title}</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">{flow.body}</p>
    </motion.div>
  )
}
