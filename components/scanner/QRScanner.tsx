'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, CameraOff, Loader2, ShieldAlert, Smartphone, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { describeFailure, resolveDecoded, type Failure } from '@/lib/scanner/decode'

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
  /**
   * Content for the box that holds the viewfinder's place while idle. Defaults
   * to a line saying the preview will appear here.
   *
   * It is a slot rather than fixed copy because `/scan` puts the visitor's
   * capture disclosure in it: consent belongs directly above the control that
   * opens the camera, and this is the only space above that control which costs
   * no vertical room — the box already exists at exactly the viewfinder's size
   * so starting the camera does not shift the page. It is also copy the staff
   * terminal must not show, which is reason enough not to bake it in here.
   */
  idlePlaceholder?: ReactNode
}

type Phase = 'idle' | 'starting' | 'scanning'

const DIV_ID = 'qr-reader'

export default function QRScanner({
  onResult,
  redirectOnScan = true,
  idlePlaceholder,
}: QRScannerProps) {
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('idle')
  const [failure, setFailure] = useState<Failure | null>(null)
  /** Read something unusable while the camera is still live. Not a failure. */
  const [notice, setNotice] = useState<string | null>(null)
  const rejectedRef = useRef<string | null>(null)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear?: () => void } | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      // stop() throws *synchronously* when the scanner never started, and a
      // trailing .catch() cannot intercept that — the same shape that once
      // escaped start()'s catch block and silently broke every failure path.
      try {
        void scannerRef.current?.stop()?.catch(() => {})
      } catch {
        /* never started */
      }
    }
  }, [])

  /**
   * `halt` shuts the camera down. It is called only once the decoded text has
   * earned it — a caller-owned result, or a route this product owns. A code
   * this scanner cannot use leaves the camera running and posts a notice.
   */
  const handleDecoded = useCallback(
    (decodedText: string, halt: () => void) => {
      if (onResult) {
        halt()
        onResult(decodedText)
        return
      }
      if (!redirectOnScan) return

      const resolved = resolveDecoded(decodedText, window.location.origin)
      if (resolved.kind === 'foreign') {
        // Deduped by content: the same sticker decodes ten times a second, and
        // a live region that re-announces at 10fps is unusable with a screen
        // reader. The notice stays until the scan ends or a real code is read —
        // "still looking" keeps it true for as long as it is on screen.
        if (rejectedRef.current !== decodedText) {
          rejectedRef.current = decodedText
          setNotice(resolved.notice)
        }
        return
      }
      halt()
      router.push(resolved.href)
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
    rejectedRef.current = null
    if (mounted.current) {
      setPhase('idle')
      setNotice(null)
    }
  }, [])

  const start = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setFailure(null)
    setNotice(null)
    rejectedRef.current = null
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

    // iOS can leave getUserMedia pending indefinitely when another app holds the
    // camera. Without this the visitor sits on a disabled "Starting camera…"
    // forever — the one state on a recovery-shaped page with no recovery.
    let watchdog: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      watchdog = setTimeout(
        () => reject(Object.assign(new Error('camera-timeout'), { name: 'KamnotheatTimeout' })),
        10_000,
      )
    })

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

      await Promise.race([
        timeout,
        scanner.start(
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
          handleDecoded(decodedText, () => {
            try {
              void scanner.stop()?.catch(() => {})
            } catch {
              /* already stopped */
            }
            scannerRef.current = null
            busy.current = false
            if (mounted.current) setPhase('idle')
          })
        },
        undefined,
        ),
      ])
      clearTimeout(watchdog)
      if (!mounted.current) {
        try {
          void scanner.stop()?.catch(() => {})
        } catch {
          /* never started */
        }
        return
      }
      setPhase('scanning')
    } catch (err) {
      clearTimeout(watchdog)
      // The camera may still open after the race is lost, so it must not be left
      // running behind a page that has given up on it. stop() *throws
      // synchronously* when the scanner never started, which a trailing .catch()
      // does not intercept — that escaping exception previously skipped
      // setFailure entirely and broke every failure path.
      try {
        void scannerRef.current?.stop()?.catch(() => {})
      } catch {
        /* never started */
      }
      scannerRef.current = null
      busy.current = false
      if (!mounted.current) return
      setPhase('idle')
      setFailure(describeFailure(err))
    }
  }, [handleDecoded])

  const failureRef = useRef<HTMLDivElement>(null)

  // A failure the visitor cannot clear by trying again. The UI must route
  // around it rather than leaving a disabled control as the last thing on screen.
  const deadEnd = !!failure && !failure.retryable

  // Deliberately only the dead end. A *retryable* failure needs no move: the
  // button is no longer disabled while starting, so it never loses focus, and
  // it is already the control the visitor wants — its label just becomes "Try
  // again" while role="alert" reads the cause. Sending focus to the notice
  // instead would park them on static text *after* that button in the DOM,
  // reachable only by shift-tabbing back. Only the dead end, which removes the
  // control entirely and would drop focus to <body>, needs the anchor.
  useEffect(() => {
    if (deadEnd) failureRef.current?.focus()
  }, [deadEnd])

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
            : 'aspect-[4/3] max-h-[min(45vh,20rem)] w-full overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-black [@media(max-height:540px)]:aspect-auto [@media(max-height:540px)]:h-28'
        }
      >
        <div id={DIV_ID} className="size-full [&_video]:size-full [&_video]:object-cover" />
      </div>

      {/* Idle placeholder: gives the panel a stable height so starting the camera
          does not shove the rest of the page down. Withdrawn on a dead end —
          promising a preview is a lie once the control that would start it is
          gone, and the space belongs to the routes that still work.

          A filled slot drops the dashed edge: dashed reads "nothing here yet",
          which stops being true once the box carries real content. It scrolls
          rather than clips, so a long disclosure stays reachable in the one
          case it can outgrow the box — a phone held in landscape. */}
      {phase === 'idle' && !deadEnd && (
        <div
          className={
            idlePlaceholder
              ? 'flex aspect-[4/3] max-h-[min(45vh,20rem)] w-full flex-col justify-center gap-2.5 overflow-y-auto rounded-2xl border border-[var(--panel-border)] bg-muted/40 px-5 py-4 [@media(max-height:540px)]:aspect-auto [@media(max-height:540px)]:h-28 [@media(max-height:540px)]:gap-1.5 [@media(max-height:540px)]:py-3'
              : 'flex aspect-[4/3] max-h-[min(45vh,20rem)] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--panel-border)] px-6 text-center [@media(max-height:540px)]:aspect-auto [@media(max-height:540px)]:h-28'
          }
        >
          {idlePlaceholder ?? (
            <>
              <Camera className="size-7 text-muted" strokeWidth={1.8} />
              <p className="text-sm text-muted">
                The camera preview appears here once you start the scanner.
              </p>
            </>
          )}
        </div>
      )}

      {phase === 'scanning' ? (
        <Button variant="outline" className="press h-12 w-full text-sm font-semibold" onPress={stop}>
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
          variant="brand"
          className="w-full"
          onPress={start}
          isLoading={phase === 'starting'}
          // Busy, not disabled. A disabled button renders at
          // --disabled-opacity, which puts this white label at roughly 1.5:1 on
          // the brand gradient — the least readable moment on the page is the
          // one where the visitor is waiting on an OS permission dialog. The
          // attribute also blurs the element, dropping a keyboard user to
          // <body> for up to the full watchdog. Re-entry is already guarded by
          // `busy.current`, so nothing needs the disabled attribute to do it.
          loadingBehavior="busy"
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
          behind other speech and can be missed entirely.

          'starting' is announced here rather than left to the button label: the
          button keeps focus now that it is not disabled, and a label change
          under an already-focused element is not reliably spoken. This window
          used to be silent for up to the full ten-second watchdog. */}
      <div aria-live="polite" role="status">
        {phase === 'starting' && (
          <p className="text-center text-sm text-muted">
            Starting the camera. This can take a few seconds.
          </p>
        )}
        {phase === 'scanning' &&
          (notice ? (
            <p className="text-center text-sm font-semibold text-[var(--status-danger)]">
              {notice}
            </p>
          ) : (
            <p className="text-center text-sm text-muted">
              Point the camera at the QR code. It reads the moment it is in frame.
            </p>
          ))}
      </div>

      <div role="alert" className="space-y-4">
        {failure && (
          <div
            ref={failureRef}
            tabIndex={-1}
            className="flex items-start gap-3 rounded-2xl border border-[var(--status-danger)]/25 bg-[var(--status-danger)]/[0.08] p-4 text-left outline-none"
          >
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
