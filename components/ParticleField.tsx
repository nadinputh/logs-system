'use client'

import { useEffect, useRef } from 'react'

/**
 * ParticleField — the locating field.
 *
 * A calm grid of survey points. Move a cursor through it and the points nearest
 * the probe displace and warm toward the accent, falling off at a soft radius —
 * the shape of the question this product exists to answer: is this person
 * inside this boundary, at this moment?
 *
 * Accuracy note: that is the *shape* of a geofence test, not a description of a
 * running one. `geofenceStatus` is a Boolean on the Log schema and is read by
 * the admin log viewer, but no code path sets it — `navigator.geolocation`
 * appears nowhere in this repo. This comment used to assert "the geofence check
 * the engine runs on every check-in", and that claim propagated onto the
 * landing page's record panel as a captured field. The motif stays (owner call,
 * 2026-08-22); the claim does not.
 *
 * Physics per point:
 *   • Probe displacement with a smooth radial falloff.
 *   • Spring-back toward home (Hooke: F = -k·displacement).
 *   • Velocity damping so motion settles rather than oscillates.
 *
 * Cost discipline — this used to be the most expensive thing on the page:
 *   • Glow is a pre-rendered sprite, not `ctx.shadowBlur` (which forces a
 *     separate blur raster per fill and was ~156 of them per frame).
 *   • Resting points batch into one Path2D fill.
 *   • The loop only runs while the canvas is on screen, the tab is visible, and
 *     the device actually has a fine pointer. Touch devices paint one static
 *     frame and never start a loop.
 *   • DPR capped at 1.5 — this is a low-contrast dot field, not an image.
 *   • Honours prefers-reduced-motion, and keeps listening for changes to it.
 */

type Dot = {
  ox: number // home x
  oy: number // home y
  x: number
  y: number
  vx: number
  vy: number
}

const SPACING = 40 // px between points
const PROBE_RADIUS = 230 // px — how far the cursor reaches
const PROBE_STRENGTH = 4.4 // peak impulse (px/frame) at contact
const SPRING = 0.05 // stiffness pulling back home
const DAMPING = 0.86 // velocity retained per frame
const MAX_DPR = 1.5
const DRIFT_AMP = 7 // px — idle float from home
const DRIFT_SPEED = 0.00055 // per ms — lower is slower
const DRIFT_FREQ = 0.013 // spatial scale, so neighbours move as a wave
const GLOW_SPRITE = 40 // px — pre-rendered glow diameter

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Smooth 0..1 falloff. Gives the probe a legible edge instead of a linear ramp. */
function falloff(t: number) {
  const u = 1 - t
  return u * u * (3 - 2 * u)
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

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const pointerQuery = window.matchMedia('(pointer: fine)')

    let width = 0
    let height = 0
    let dpr = 1
    let dots: Dot[] = []
    // The canvas scrolls with the page, so its offset has to track scroll — but
    // reading the rect on every pointermove would force layout. Cache it and
    // recompute lazily, at most once per frame, only when something moved.
    let rectLeft = 0
    let rectTop = 0
    let rectDirty = true
    const mouse = { clientX: -9999, clientY: -9999, active: false }

    function syncRect() {
      if (!rectDirty) return
      const r = canvas.getBoundingClientRect()
      rectLeft = r.left
      rectTop = r.top
      rectDirty = false
    }

    // --- Glow sprite ---------------------------------------------------------
    // One radial gradient, rasterised once, then blitted per energised point.
    let glow: HTMLCanvasElement | null = null
    let glowKey = ''
    function buildGlow(r: number, g: number, b: number) {
      const key = `${r},${g},${b}`
      if (glow && glowKey === key) return
      const c = document.createElement('canvas')
      c.width = c.height = GLOW_SPRITE
      const gctx = c.getContext('2d')
      if (!gctx) return
      const half = GLOW_SPRITE / 2
      const grad = gctx.createRadialGradient(half, half, 0, half, half, half)
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`)
      grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, 0.18)`)
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`)
      gctx.fillStyle = grad
      gctx.fillRect(0, 0, GLOW_SPRITE, GLOW_SPRITE)
      glow = c
      glowKey = key
    }

    function isDark() {
      return document.documentElement.classList.contains('dark')
    }

    function build() {
      const rect = canvas.getBoundingClientRect()
      rectLeft = rect.left
      rectTop = rect.top
      rectDirty = false
      width = rect.width
      height = rect.height
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

    function draw(now: number, animate: boolean) {
      syncRect()
      const mx = mouse.clientX - rectLeft
      const my = mouse.clientY - rectTop
      const dark = isDark()
      ctx.clearRect(0, 0, width, height)

      // Resting point colour and the accent the probe warms them toward.
      // `onDark` renders white points for use over a coloured surface.
      const onDark = tone === 'onDark'
      const base = onDark ? [255, 255, 255] : dark ? [148, 163, 184] : [100, 116, 139]
      const accent = onDark ? [255, 255, 255] : dark ? [34, 211, 238] : [14, 116, 144]
      const baseAlpha = onDark ? 0.3 : dark ? 0.22 : 0.2
      const restRadius = 1.15
      buildGlow(accent[0], accent[1], accent[2])

      // Batch every low-energy point into a single fill.
      const basePath = new Path2D()

      for (const d of dots) {
        // Idle target: home plus a slow flowing wave, so the field breathes
        // even while the cursor is still.
        let tx = d.ox
        let ty = d.oy
        if (animate) {
          tx += Math.sin(now * DRIFT_SPEED + d.ox * DRIFT_FREQ + d.oy * DRIFT_FREQ) * DRIFT_AMP
          ty += Math.cos(now * DRIFT_SPEED + d.oy * DRIFT_FREQ - d.ox * DRIFT_FREQ) * DRIFT_AMP

          if (mouse.active) {
            const dx = d.x - mx
            const dy = d.y - my
            const dist = Math.hypot(dx, dy) || 0.0001
            if (dist < PROBE_RADIUS) {
              const impulse = falloff(dist / PROBE_RADIUS) * PROBE_STRENGTH
              d.vx += (dx / dist) * impulse
              d.vy += (dy / dist) * impulse
            }
          }
          d.vx += (tx - d.x) * SPRING
          d.vy += (ty - d.y) * SPRING
          d.vx *= DAMPING
          d.vy *= DAMPING
          d.x += d.vx
          d.y += d.vy
        }

        // Energy is displacement off the drift target, so the gentle idle wave
        // does not light points up — only the probe does.
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

        if (glow) {
          // Keep the halo tight enough that the located point stays a point.
          const size = GLOW_SPRITE * (0.42 + energy * 0.45)
          ctx.globalAlpha = energy
          ctx.drawImage(glow, d.x - size / 2, d.y - size / 2, size, size)
          ctx.globalAlpha = 1
        }

        ctx.beginPath()
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${baseAlpha + energy * 0.7})`
        ctx.arc(d.x, d.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.fillStyle = `rgba(${base[0]}, ${base[1]}, ${base[2]}, ${baseAlpha})`
      ctx.fill(basePath)
    }

    // --- Run gating ----------------------------------------------------------
    // The loop is only allowed to run when all three are true. Anything else
    // paints one static frame and stops.
    let onScreen = true
    let raf = 0
    let running = false

    function shouldRun() {
      return onScreen && !document.hidden && pointerQuery.matches && !motionQuery.matches
    }

    function loop(now: number) {
      draw(now, true)
      raf = requestAnimationFrame(loop)
    }

    function start() {
      if (running || !shouldRun()) return
      running = true
      raf = requestAnimationFrame(loop)
    }

    function stop() {
      if (!running) return
      running = false
      cancelAnimationFrame(raf)
      // Leave a settled frame behind rather than a half-displaced one.
      for (const d of dots) {
        d.x = d.ox
        d.y = d.oy
        d.vx = 0
        d.vy = 0
      }
      draw(0, false)
    }

    function sync() {
      if (shouldRun()) start()
      else stop()
    }

    function onPointerMove(e: PointerEvent) {
      // Store client coords only; they are resolved against the cached rect at
      // draw time, so moving the mouse never forces a layout read.
      mouse.clientX = e.clientX
      mouse.clientY = e.clientY
      mouse.active = true
    }
    function release() {
      mouse.active = false
      mouse.clientX = -9999
      mouse.clientY = -9999
    }
    function onScroll() {
      rectDirty = true
    }

    let resizeTimer = 0
    function onResize() {
      window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        rectDirty = true
        build()
        if (!running) draw(0, false)
      }, 120)
    }

    build()
    draw(0, false)

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting
        sync()
      },
      { rootMargin: '120px' },
    )
    io.observe(canvas)

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('blur', release)
    document.addEventListener('mouseleave', release)
    document.addEventListener('visibilitychange', sync)
    motionQuery.addEventListener('change', sync)
    pointerQuery.addEventListener('change', sync)
    window.addEventListener('resize', onResize)

    sync()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.clearTimeout(resizeTimer)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('blur', release)
      document.removeEventListener('mouseleave', release)
      document.removeEventListener('visibilitychange', sync)
      motionQuery.removeEventListener('change', sync)
      pointerQuery.removeEventListener('change', sync)
      window.removeEventListener('resize', onResize)
    }
  }, [tone])

  // `block h-full w-full` forces the canvas to fill its box — a <canvas> is a
  // replaced element with an intrinsic 300×150 size, so `inset-0` alone won't
  // stretch it (and the grid is sized from getBoundingClientRect()).
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none block h-full w-full ${className}`}
    />
  )
}
