'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CameraOff, Loader2, ShieldAlert, X } from 'lucide-react'
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
      detail:
        'This device has no camera available. Use the QR code on your phone instead, or ask a host to check you in.',
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
      detail: 'No rear-facing camera is available on this device. Try a phone instead.',
      retryable: false,
    }
  }
  // Common when a link is opened inside an app's built-in browser, which is
  // exactly how a visitor often arrives at a QR link.
  if (/NotSupportedError|not supported|undefined is not an object/i.test(raw)) {
    return {
      title: "This browser can't use the camera",
      detail:
        'If you opened this from inside another app, tap its menu and choose "Open in browser", then try again.',
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
          'Browsers only allow camera access over HTTPS. Open this page on its https:// address, then try again.',
        retryable: false,
      })
      return
    }

    try {
      const { Html5Qrcode } = await import('html5-qrcode')
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
            const edge = Math.floor(Math.min(w, h) * 0.7)
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

  return (
    <div className="space-y-4">
      <div
        className={
          phase === 'scanning'
            ? 'overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-black'
            : 'hidden'
        }
      >
        <div id={DIV_ID} className="w-full [&_video]:block [&_video]:w-full" />
      </div>

      {/* Idle placeholder: gives the panel a stable height so starting the camera
          does not shove the rest of the page down. */}
      {phase !== 'scanning' && (
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
      ) : (
        <Button
          className="press w-full disabled:cursor-not-allowed disabled:opacity-45"
          size="lg"
          onPress={start}
          isLoading={phase === 'starting'}
          // A cause we know retrying cannot fix (no camera, insecure origin,
          // unsupported browser) must not offer a button that will fail again.
          isDisabled={failure ? !failure.retryable : false}
        >
          {phase === 'starting' ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              Starting camera…
            </>
          ) : (
            <>
              <Camera className="size-4" strokeWidth={2.4} />
              {failure?.retryable ? 'Try again' : 'Start scanner'}
            </>
          )}
        </Button>
      )}

      {/* One live region carries every status change, so a screen reader hears
          the camera start, stop, and fail. */}
      <div aria-live="polite" role="status">
        {phase === 'scanning' && (
          <p className="text-center text-sm text-muted">
            Point the camera at the QR code. It reads the moment it is in frame.
          </p>
        )}

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
    </div>
  )
}
