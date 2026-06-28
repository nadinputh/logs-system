'use client'

import { useEffect, useRef } from 'react'

/**
 * ParticleField — an antigravity.google-style interactive dot grid.
 *
 * Physics per dot (real-world model):
 *   • Cursor repulsion with inverse-distance falloff inside a radius.
 *   • Spring-back to the home position (Hooke's law: F = -k · displacement).
 *   • Velocity damping (friction) so motion settles smoothly.
 * Dots gain radius + glow toward the accent colour as they're displaced ("energy").
 *
 * Rendered to a single <canvas>; pointer-events are disabled so it never blocks UI.
 * Honours prefers-reduced-motion (renders a static grid) and theme (dark/light).
 */

type Dot = {
  ox: number // home x
  oy: number // home y
  x: number
  y: number
  vx: number
  vy: number
}

// Physics constants
const SPACING = 34 // px between dots
const REPEL_RADIUS = 240 // px — cursor influence radius (larger = wider hover effect)
const REPEL_STRENGTH = 4.6 // peak impulse (px/frame) at contact
const SPRING = 0.05 // Hooke stiffness pulling back home
const DAMPING = 0.86 // velocity retained per frame (friction)
const MAX_DPR = 2
// Idle ambient drift — keeps dots gently flowing even when the cursor is still
const DRIFT_AMP = 7 // px — how far a dot floats from home
const DRIFT_SPEED = 0.00055 // time scale (per ms) — lower = slower
const DRIFT_FREQ = 0.013 // spatial scale — makes neighbours move as a wave

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function ParticleField({
  className = '',
  tone = 'auto',
}: {
  className?: string
  tone?: 'auto' | 'onDark'
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const context = el.getContext('2d')
    if (!context) return
    // Non-null locals so narrowing holds inside the nested render closures.
    const canvas = el
    const ctx = context

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let width = 0
    let height = 0
    let dpr = 1
    let dots: Dot[] = []
    let rectLeft = 0
    let rectTop = 0
    const mouse = { x: -9999, y: -9999, active: false }

    function isDark() {
      return document.documentElement.classList.contains('dark')
    }

    function build() {
      const rect = canvas.getBoundingClientRect()
      width = rect.width
      height = rect.height
      rectLeft = rect.left
      rectTop = rect.top
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      dots = []
      const cols = Math.ceil(width / SPACING) + 1
      const rows = Math.ceil(height / SPACING) + 1
      const offsetX = (width - (cols - 1) * SPACING) / 2
      const offsetY = (height - (rows - 1) * SPACING) / 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = offsetX + c * SPACING
          const y = offsetY + r * SPACING
          dots.push({ ox: x, oy: y, x, y, vx: 0, vy: 0 })
        }
      }
    }

    function draw(now: number) {
      const dark = isDark()
      ctx.clearRect(0, 0, width, height)

      // Resting dot colour + accent glow target.
      // `onDark` renders white dots for use over a coloured/dark surface;
      // otherwise theme-aware slate dots that glow cyan.
      const onDark = tone === 'onDark'
      const base = onDark ? [255, 255, 255] : dark ? [148, 163, 184] : [100, 116, 139]
      const accent = onDark ? [255, 255, 255] : [34, 211, 238]
      const baseAlpha = onDark ? 0.3 : dark ? 0.22 : 0.16
      const restRadius = 1.15

      // Batch all low-energy dots into one fill for speed.
      const basePath = new Path2D()

      for (const d of dots) {
        // Idle target: home position + a slow flowing wave so dots keep
        // moving even while the cursor is still.
        let tx = d.ox
        let ty = d.oy
        if (!reduceMotion) {
          tx += Math.sin(now * DRIFT_SPEED + d.ox * DRIFT_FREQ + d.oy * DRIFT_FREQ) * DRIFT_AMP
          ty += Math.cos(now * DRIFT_SPEED + d.oy * DRIFT_FREQ - d.ox * DRIFT_FREQ) * DRIFT_AMP

          // Cursor repulsion (inverse-distance falloff)
          if (mouse.active) {
            const dx = d.x - mouse.x
            const dy = d.y - mouse.y
            const dist = Math.hypot(dx, dy) || 0.0001
            if (dist < REPEL_RADIUS) {
              const impulse = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH
              d.vx += (dx / dist) * impulse
              d.vy += (dy / dist) * impulse
            }
          }
          // Spring toward the drifting target (Hooke's law) + damping (friction)
          d.vx += (tx - d.x) * SPRING
          d.vy += (ty - d.y) * SPRING
          d.vx *= DAMPING
          d.vy *= DAMPING
          d.x += d.vx
          d.y += d.vy
        }

        // Energy from displacement off the drift target (so only the cursor —
        // not the gentle idle drift — lights dots up).
        const disp = Math.hypot(d.x - tx, d.y - ty)
        const energy = Math.min(disp / 26, 1)

        if (energy < 0.06) {
          basePath.moveTo(d.x + restRadius, d.y)
          basePath.arc(d.x, d.y, restRadius, 0, Math.PI * 2)
          continue
        }

        const radius = restRadius + energy * 1.9
        const r = Math.round(lerp(base[0], accent[0], energy))
        const g = Math.round(lerp(base[1], accent[1], energy))
        const b = Math.round(lerp(base[2], accent[2], energy))
        const alpha = baseAlpha + energy * 0.7

        ctx.beginPath()
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${alpha})`
        ctx.shadowBlur = energy * 10
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.shadowBlur = 0
      ctx.fillStyle = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${baseAlpha})`
      ctx.fill(basePath)
    }

    let raf = 0
    function loop(now: number) {
      draw(now)
      raf = requestAnimationFrame(loop)
    }

    function onPointerMove(e: PointerEvent) {
      mouse.x = e.clientX - rectLeft
      mouse.y = e.clientY - rectTop
      mouse.active = true
    }
    function release() {
      mouse.active = false
      mouse.x = -9999
      mouse.y = -9999
    }
    function onResize() {
      build()
    }

    build()

    if (reduceMotion) {
      draw(0)
    } else {
      window.addEventListener('pointermove', onPointerMove, { passive: true })
      window.addEventListener('blur', release)
      document.addEventListener('mouseleave', release)
      raf = requestAnimationFrame(loop)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', release)
      document.removeEventListener('mouseleave', release)
      window.removeEventListener('resize', onResize)
    }
  }, [tone])

  // `block h-full w-full` forces the canvas to fill its box — a <canvas> is a
  // replaced element with an intrinsic 300×150 size, so `inset-0` alone won't
  // stretch it (and the physics grid is sized from getBoundingClientRect()).
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  )
}
