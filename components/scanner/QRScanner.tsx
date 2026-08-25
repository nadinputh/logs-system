'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CameraOff, Loader2, ShieldAlert, Smartphone, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * QRScanner — the visitor's entry point.
 *
 * This is the one surface where failure is both most likely and least tolerable:
 * someone is standing at a door trying to get in. Every way the camera can refuse
 * gets a named cause and a recovery instruction rather than the raw exception
 * string the browser throws.
 *
 * `html5-qrcode` is imported inside `start()`, so the module graph stays free of
 * it until a tap. That is why this component can render (and server-render) its
 * idle state immediately instead of hiding behind a `dynamic(ssr:false)` spinner.
 */

interface QRScannerProps {
  onResult?: (result: string) => void
  redirectOnScan?: boolean
}

type Phase = 'idle' | 'starting' | 'scanning'

type Failure = {
  title: string
  detail: string
  /** Whether retrying can plausibly succeed. */
  retryable: boolean
}

const DIV_ID = 'qr-reader'

/** Routes a Kamnotheat QR is allowed to send someone to. */
const ALLOWED_PREFIXES = ['/scan/', '/quest/', '/terminal']

/**
 * Maps a getUserMedia / html5-qrcode rejection onto a cause the visitor can act
 * on. The browser's own `message` is never shown — "NotAllowedError: Permission
 * denied" tells someone in a lobby nothing about what to do next.
 */
function describeFailure(err: unknown): Failure {
  // html5-qrcode rejects with a plain string for most camera failures
  // (`Error getting userMedia, error = NotFoundError: ...`), so the DOMException
  // name is only reachable by searching the stringified rejection too. Matching
  // on `err.name` alone silently collapses every cause into the generic one.
  const name = (err as { name?: string })?.name ?? ''
  const raw = [name, (err as { message?: string })?.message ?? '', String(err)].join(' ')

  if (/NotAllowedError|SecurityError|permission|denied|dismissed/i.test(raw)) {
    return {
      title: 'Camera access is blocked',
      detail:
        'Allow camera access for this site in your browser settings, then try again. On iPhone: Settings → Safari → Camera.',
      retryable: true,
    }
  }
  if (/NotFoundError|DevicesNotFoundError|no camera|device not found|not found/i.test(raw)) {
    return {
      title: 'No camera found',
      detail: 'This device has no camera available to open.',
      retryable: false,
    }
  }
  if (/NotReadableError|TrackStartError|AbortError|in use|could not start/i.test(raw)) {
    return {
      title: 'The camera is busy',
      detail:
        'Another app or tab is already using it. Close the other one, then try again.',
      retryable: true,
    }
  }
  if (/OverconstrainedError|ConstraintNotSatisfiedError/i.test(raw)) {
    return {
      title: "This camera can't be used",
      detail: 'No rear-facing camera is available on this device.',
      retryable: false,
    }
  }
  // Common when a link is opened inside an app's built-in browser, which is
  // exactly how a visitor often arrives at a QR link.
  if (/NotSupportedError|not supported|undefined is not an object/i.test(raw)) {
    return {
      title: "This browser can't use the camera",
      detail:
        'If you opened this from inside another app, tap its menu and choose "Open in browser" and load this page there.',
      retryable: false,
    }
  }
  return {
    title: "The scanner couldn't start",
    detail: 'Something went wrong reaching the camera. Try again, or ask a host to check you in.',
    retryable: true,
  }
}

export default function QRScanner({ onResult, redirectOnScan = true }: QRScannerProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<Failure | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear?: () => void } | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      scannerRef.current?.stop().catch(() => {})
    }
  }, [])

  /**
   * A decoded QR is untrusted input. Only same-origin URLs pointing at a route
   * this product actually owns are followed — otherwise any QR sticker in the
   * world could steer a visitor through the app.
   */
  const handleDecoded = useCallback(
    (decodedText: string) => {
      if (onResult) {
        onResult(decodedText)
        return
      }
      if (!redirectOnScan) return

      let target: URL
      try {
        target = new URL(decodedText, window.location.origin)
      } catch {
        setFailure({
          title: 'That code is not a check-in code',
          detail: 'Scan the Kamnotheat QR posted at your location.',
          retryable: true,
        })
        return
      }
      const sameOrigin = target.origin === window.location.origin
      const knownRoute = ALLOWED_PREFIXES.some((prefix) => target.pathname.startsWith(prefix))
      if (!sameOrigin || !knownRoute) {
        setFailure({
          title: 'That code is not a check-in code',
          detail: 'It points somewhere outside Kamnotheat. Scan the QR posted at your location.',
          retryable: true,
        })
        return
      }
      router.push(target.pathname + target.search)
    },
    [onResult, redirectOnScan, router],
  )

  const stop = useCallback(async () => {
    try {
      await scannerRef.current?.stop()
    } catch {
      /* already stopped */
    }
    scannerRef.current = null
    busy.current = false
    if (mounted.current) setPhase('idle')
  }, [])

  const start = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setFailure(null)
    setPhase('starting')

    // getUserMedia is unavailable outside a secure context, which is easy to hit
    // on a LAN-hosted kiosk. Say so plainly instead of failing at the prompt.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      busy.current = false
      setPhase('idle')
      setFailure({
        title: 'The camera needs a secure connection',
        detail:
          'Browsers only allow camera access over HTTPS. Open this page on its https:// address to use the scanner.',
        retryable: false,
      })
      return
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      if (!mounted.current) return
      // Wait for the viewfinder to actually be laid out before the library
      // measures it. The dynamic import usually covers this, but a frame is
      // cheap and makes the ordering explicit rather than incidental.
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      if (!mounted.current) return
      const scanner = new Html5Qrcode(DIV_ID)
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        // A ratio-based box adapts to the actual video size; a fixed 250px box
        // overflows the frame on small phones.
        {
          fps: 10,
          qrbox: (w: number, h: number) => {
            // The library throws below 50px. Clamp rather than let a bad
            // measurement take the whole scanner down.
            const edge = Math.max(50, Math.floor(Math.min(w, h) * 0.7))
            return { width: edge, height: edge }
          },
        },
        (decodedText: string) => {
          scanner.stop().catch(() => {})
          scannerRef.current = null
          busy.current = false
          if (mounted.current) setPhase('idle')
          handleDecoded(decodedText)
        },
        undefined,
      )
      if (!mounted.current) {
        scanner.stop().catch(() => {})
        return
      }
      setPhase('scanning')
    } catch (err) {
      scannerRef.current = null
      busy.current = false
      if (!mounted.current) return
      setPhase('idle')
      setFailure(describeFailure(err))
    }
  }, [handleDecoded])

  // A failure the visitor cannot clear by trying again. The UI must route
  // around it rather than leaving a disabled control as the last thing on screen.
  const deadEnd = !!failure && !failure.retryable

  return (
    <div className="space-y-4">
      {/* Heading navigation previously landed on "What happens" — the explainer —
          because the task itself had no accessible name. */}
      <h2 className="sr-only">Scan the QR code</h2>
      {/* Mounted and laid out from 'starting', not 'scanning'. html5-qrcode
          measures this container the instant start() runs; if it is still
          display:none it reads 0, writes an inline width:0px onto the <video>,
          and hands qrbox a 0x0 decode region — a live camera with no picture. */}
      <div
        className={
          phase === 'idle'
            ? 'hidden'
            : 'aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-black'
        }
      >
        <div id={DIV_ID} className="size-full" />
      </div>

      {/* Idle placeholder: gives the panel a stable height so starting the camera
          does not shove the rest of the page down. Withdrawn on a dead end —
          promising a preview is a lie once the control that would start it is
          gone, and the space belongs to the routes that still work. */}
      {phase === 'idle' && !deadEnd && (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--panel-border)] px-6 text-center">
          <Camera className="size-7 text-muted" strokeWidth={1.8} />
          <p className="text-sm text-muted">
            The camera preview appears here once you start the scanner.
          </p>
        </div>
      )}

      {phase === 'scanning' ? (
        <Button variant="outline" className="press w-full" size="lg" onPress={stop}>
          <X className="size-4" strokeWidth={2.4} />
          Stop scanner
        </Button>
      ) : deadEnd ? (
        /* A cause retrying cannot fix does not get a button that will fail
           again. The control is replaced by the routes that still work —
           never a dimmed pill sitting above copy that says "try again". */
        null
      ) : (
        <Button
          className="press w-full"
          size="lg"
          onPress={start}
          isLoading={phase === 'starting'}
        >
          {phase === 'starting' ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              Starting camera…
            </>
          ) : (
            <>
              <Camera className="size-4" strokeWidth={2.4} />
              {failure ? 'Try again' : 'Start scanner'}
            </>
          )}
        </Button>
      )}

      {/* Progress is polite; a failure that ends the task is not. Announcing a
          dead camera at the same priority as "scanner started" means it queues
          behind other speech and can be missed entirely. */}
      <div aria-live="polite" role="status">
        {phase === 'scanning' && (
          <p className="text-center text-sm text-muted">
            Point the camera at the QR code. It reads the moment it is in frame.
          </p>
        )}
      </div>

      <div role="alert" className="space-y-4">
        {failure && (
          <div className="flex items-start gap-3 rounded-2xl border border-[var(--status-danger)]/25 bg-[var(--status-danger)]/[0.08] p-4 text-left">
            {failure.retryable ? (
              <ShieldAlert
                className="mt-0.5 size-5 shrink-0 text-[var(--status-danger)]"
                strokeWidth={2.2}
              />
            ) : (
              <CameraOff
                className="mt-0.5 size-5 shrink-0 text-[var(--status-danger)]"
                strokeWidth={2.2}
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--status-danger)]">{failure.title}</p>
              <p className="mt-1 text-sm text-muted">{failure.detail}</p>
            </div>
          </div>
        )}
      </div>

      {/* The other ways in.
          Deliberately always visible, not revealed only after a failure: a
          screen-reader user cannot aim a camera and will never trigger the
          failure that would disclose an alternative. Both routes work with no
          account, no new endpoint, and no code printed on the poster — the
          phone's own camera opens the same link the in-app scanner reads, and
          a person at reception is the fallback a physical door already has. */}
      <div
        className={
          deadEnd
            ? 'rounded-2xl border border-[var(--panel-border)] bg-[var(--accent)]/[0.06] p-4'
            : 'border-t border-[var(--panel-border)] pt-4'
        }
      >
        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          {deadEnd ? 'Two other ways in' : 'Not working?'}
        </h3>
        <ul className="mt-3 space-y-3">
          <li className="flex items-start gap-3">
            <Smartphone
              className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
              strokeWidth={2.3}
            />
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">
                Use your phone&apos;s own camera app.
              </span>{' '}
              Point it at the same QR code — it opens the identical link without
              needing this page.
            </p>
          </li>
          <li className="flex items-start gap-3">
            <UserRound
              className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
              strokeWidth={2.3}
            />
            <p className="text-sm text-muted">
              <span className="font-semibold text-foreground">Ask at reception.</span>{' '}
              A host can check you in if the code is damaged, missing, or your
              camera will not open.
            </p>
          </li>
        </ul>
      </div>
    </div>
  )
}
