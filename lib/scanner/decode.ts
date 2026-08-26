/**
 * Scanner decision logic, deliberately free of React and of `window`.
 *
 * Both functions here decide what a visitor is told and where a decoded QR is
 * allowed to send them, which makes them the two pieces of the scanner most
 * worth testing directly. Keeping them out of the `'use client'` component is
 * what lets a node-environment test exercise them without a DOM.
 */

/** Routes a Kamnotheat QR is allowed to send someone to. */
export const ALLOWED_PREFIXES = ['/scan/', '/quest/', '/terminal']

export type Failure = {
  title: string
  detail: string
  /** Whether retrying can plausibly succeed. */
  retryable: boolean
}

export type Resolution =
  | { kind: 'route'; href: string }
  | { kind: 'foreign'; notice: string }

/**
 * A decoded QR is untrusted input. Only same-origin URLs pointing at a route
 * this product actually owns are followed — otherwise any QR sticker in the
 * world could steer a visitor through the app. `origin` is passed in rather
 * than read from `window` so this stays a pure function.
 *
 * Anything else resolves to a *notice*, not a failure. A lobby door is covered
 * in codes that are not check-in codes — a wifi card, a menu, a poster — and
 * html5-qrcode fires on every one of them. Ending the scan each time costs a
 * re-tap and a camera cold start, and contradicts the page's own promise that
 * it reads itself.
 */
export function resolveDecoded(decodedText: string, origin: string): Resolution {
  let target: URL
  try {
    target = new URL(decodedText, origin)
  } catch {
    return {
      kind: 'foreign',
      notice: 'That is not a check-in code — still looking. Scan the QR posted at your location.',
    }
  }
  // `target.origin` is the check that matters: a protocol-relative
  // `//elsewhere/scan/x` and a `javascript:` payload both parse cleanly and
  // both land on a pathname that would otherwise pass the prefix test.
  const sameOrigin = target.origin === origin
  const knownRoute = ALLOWED_PREFIXES.some((prefix) => target.pathname.startsWith(prefix))
  if (!sameOrigin || !knownRoute) {
    return {
      kind: 'foreign',
      notice:
        'That code leads somewhere outside this check-in system — still looking. Scan the QR posted at your location.',
    }
  }
  return { kind: 'route', href: target.pathname + target.search }
}

/**
 * Maps a getUserMedia / html5-qrcode rejection onto a cause the visitor can act
 * on. The browser's own `message` is never shown — "NotAllowedError: Permission
 * denied" tells someone in a lobby nothing about what to do next.
 */
export function describeFailure(err: unknown): Failure {
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
      detail: 'Another app or tab is already using it. Close the other one, then try again.',
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
  if (/KamnotheatTimeout|camera-timeout/.test(raw)) {
    return {
      title: 'The camera did not open',
      detail:
        'It may be in use by another app. Close anything else using the camera, then try again.',
      retryable: true,
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
