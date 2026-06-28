'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion, type Variants } from 'framer-motion'
import { ParticleField } from '@/components/ParticleField'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import {
  ArrowRight,
  Camera,
  QrCode,
  ScanLine,
  ShieldCheck,
} from 'lucide-react'

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: [0.21, 0.47, 0.32, 0.98] },
  },
}

const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
}

const QRScanner = dynamic(() => import('@/components/scanner/QRScanner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <svg className="size-6 animate-spin text-accent" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  ),
})

const steps = [
  { Icon: Camera, title: 'Point your camera', text: 'Aim at the QR code posted at your location.' },
  { Icon: ScanLine, title: 'Auto-detect', text: 'The scanner reads the code the moment it’s in frame.' },
  { Icon: ShieldCheck, title: 'Confirm & log', text: 'Verify your identity and your entry is recorded.' },
]

export default function ScanPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient gradient blobs — matches the landing page */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-10%] size-[34rem] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -right-32 top-[5%] size-[30rem] rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute bottom-[-20%] left-1/3 size-[26rem] rounded-full bg-cyan-400/15 blur-3xl" />
      </div>

      {/* Interactive physics dot field (antigravity-style) */}
      <ParticleField className="fixed inset-0 z-0" />


      {/* Header */}
      <header className="relative z-10 border-b border-white/20 bg-background/10 backdrop-blur-3xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Link href="/landing" className="group flex items-center gap-3">
            <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
            <span className="hidden sm:block">
              <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
              <span className="block text-[11px] font-medium text-muted-foreground">Secure check-in logging</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/login"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-overlay/80 px-4 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-accent/10 hover:text-accent"
            >
              Sign in
              <ArrowRight className="size-4" strokeWidth={2.4} />
            </Link>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 mx-auto flex max-w-lg flex-col items-center px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
        <motion.div variants={stagger} initial="hidden" animate="show" className="w-full text-center">
          <motion.div variants={fadeUp}>
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent">
              <QrCode className="size-3.5" strokeWidth={2.5} />
              Check in
            </span>
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="mt-5 text-balance text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl"
          >
            Scan to <span className="gradient-text">check in</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="mx-auto mt-3 max-w-sm text-balance text-muted-foreground">
            Point your camera at the QR code posted at your location to record your
            entry instantly.
          </motion.p>

          {/* Scanner card */}
          <motion.div
            variants={fadeUp}
            className="mt-8 overflow-hidden rounded-3xl border border-white/20 bg-background/25 p-5 shadow-xl shadow-black/5 backdrop-blur-sm sm:p-6"
          >
            <QRScanner />
          </motion.div>
        </motion.div>

        {/* How it works */}
        <motion.ol
          variants={stagger}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-40px' }}
          className="mt-10 grid w-full gap-3 sm:grid-cols-3"
        >
          {steps.map((s, i) => (
            <motion.li
              key={s.title}
              variants={fadeUp}
              className="relative rounded-2xl border border-white/20 bg-background/25 p-4 backdrop-blur-sm"
            >
              <span className="absolute right-3 top-3 text-3xl font-black text-accent/10">{i + 1}</span>
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-teal-500/15 text-accent ring-1 ring-accent/15">
                <s.Icon className="size-5" strokeWidth={2.2} />
              </span>
              <h3 className="mt-3 text-sm font-bold">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.text}</p>
            </motion.li>
          ))}
        </motion.ol>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Staff or admin?{' '}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Open the console
          </Link>
        </p>
      </main>
    </div>
  )
}
