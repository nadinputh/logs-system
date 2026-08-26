'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { LogoTile } from '@/components/Logo'
import { CircleCheck, Lock, MapPin, Star } from 'lucide-react'
import { ScanNotice } from '@/components/location/ScanNotice'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { v4 as uuidv4 } from 'uuid'
import { getPredictedAction, formatDuration } from '@/lib/predictive'
import { buildIdempotencyKey } from '@/lib/idempotency-key'
import { useLogRealtime } from '@/lib/useLogRealtime'

const SelfieCapture = dynamic(() => import('@/components/selfie/SelfieCapture'), { ssr: false })
const QRScanner = dynamic(() => import('@/components/scanner/QRScanner'), { ssr: false })
const VisitorPasskey = dynamic(() => import('@/components/location/VisitorPasskey'), { ssr: false })

interface LocationData {
  _id: string
  name: string
  number?: string
  address?: string
  description?: string
  locationType: 'building' | 'floor' | 'room'
  checkInMode?: 'click' | 'passkey'
  buildingId?: { name: string; address: string }
  floorId?: { name: string; number: number }
}

interface OpenLog {
  _id: string
  timestamp: string
  visitorName?: string
  passkeyVerified?: boolean
}

type Step = 'loading' | 'identity' | 'checkin' | 'selfie' | 'checkedIn' | 'checkedOut' | 'questScan'

interface CheckInOutClientProps {
  locationId: string
  initialLocation: LocationData | null
}

interface SessionData {
  sessionToken: string
  visitorName: string
  visitorContact?: string
  visitorGender?: string
  visitPurpose?: string
}

function getSessionData(): SessionData | null {
  try {
    const token = localStorage.getItem('sessionToken')
    const name = localStorage.getItem('visitorName')
    if (token && name) return {
      sessionToken: token,
      visitorName: name,
      visitorContact: localStorage.getItem('visitorContact') ?? undefined,
      visitorGender: localStorage.getItem('visitorGender') ?? undefined,
      visitPurpose: localStorage.getItem('visitPurpose') ?? undefined,
    }
  } catch {}
  return null
}

function saveSessionData(token: string, name: string, contact?: string, gender?: string, purpose?: string) {
  try {
    localStorage.setItem('sessionToken', token)
    localStorage.setItem('visitorName', name)
    if (contact) localStorage.setItem('visitorContact', contact)
    if (gender) localStorage.setItem('visitorGender', gender)
    if (purpose) localStorage.setItem('visitPurpose', purpose)
  } catch {}
}

function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem('deviceId')
    if (existing) return existing
    const id = uuidv4()
    localStorage.setItem('deviceId', id)
    return id
  } catch {
    return uuidv4()
  }
}

function getActiveCheckIn(locationId: string): { logId: string; checkedInAt: string; viaPasskey?: boolean } | null {
  try {
    const data = JSON.parse(localStorage.getItem('activeCheckIns') ?? '{}')
    return data[locationId] ?? null
  } catch {}
  return null
}

function setActiveCheckIn(locationId: string, logId: string, viaPasskey = false) {
  try {
    const data = JSON.parse(localStorage.getItem('activeCheckIns') ?? '{}')
    data[locationId] = { logId, checkedInAt: new Date().toISOString(), viaPasskey }
    localStorage.setItem('activeCheckIns', JSON.stringify(data))
  } catch {}
}

function clearActiveCheckIn(locationId: string) {
  try {
    const data = JSON.parse(localStorage.getItem('activeCheckIns') ?? '{}')
    delete data[locationId]
    localStorage.setItem('activeCheckIns', JSON.stringify(data))
  } catch {}
}

function toOpenLog(log: any, fallbackName?: string): OpenLog | null {
  const id = log?._id ?? log?.id
  if (!id) return null

  return {
    _id: id,
    timestamp: log?.timestamp ?? new Date().toISOString(),
    visitorName: log?.visitorName ?? fallbackName,
    passkeyVerified: log?.passkeyVerified,
  }
}

/**
 * Owns the one-second tick so the parent does not. `formatDuration` is the only
 * thing in the flow that needs second resolution, and re-rendering an 860-line
 * component once a second to advance it was the whole cost.
 */
function LiveDuration({ since }: { since: string }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{formatDuration(since, now)}</>
}

function formatCheckInTime(value: string | Date) {
  return new Date(value).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Split a raw contact string into email or phone fields for the API
function splitContact(contact?: string): { visitorEmail?: string; visitorPhone?: string } {
  if (!contact) return {}
  return contact.includes('@')
    ? { visitorEmail: contact }
    : { visitorPhone: contact }
}

export default function CheckInOutClient({ locationId, initialLocation }: CheckInOutClientProps) {
  const searchParams = useSearchParams()
  const questToken = searchParams.get('quest')

  const [step, setStep] = useState<Step>('loading')
  const [identitySubStep, setIdentitySubStep] = useState<1 | 2>(1)

  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [gender, setGender] = useState('')
  const [purpose, setPurpose] = useState('')

  const [sessionToken, setSessionToken] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [location, setLocation] = useState<LocationData | null>(initialLocation)
  const [openLog, setOpenLog] = useState<OpenLog | null>(null)
  const [activeLogId, setActiveLogId] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [questRecorded, setQuestRecorded] = useState(false)
  const [visitorPasskeyRegistered, setVisitorPasskeyRegistered] = useState(false)
  const [passkeySavedThisVisit, setPasskeySavedThisVisit] = useState(false)
  const [checkedInViaPasskey, setCheckedInViaPasskey] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())

  useEffect(() => {
    const id = getOrCreateDeviceId()
    setDeviceId(id)
    const session = getSessionData()
    if (session) {
      setSessionToken(session.sessionToken)
      setName(session.visitorName)
      setContact(session.visitorContact ?? '')
      setGender(session.visitorGender ?? '')
      setPurpose(session.visitPurpose ?? '')
      checkOpenLog(session.sessionToken)
    } else {
      setStep('identity')
    }
  }, [locationId])

  useEffect(() => {
    if (step !== 'checkedIn') return
    setCurrentTime(new Date())

    // Once a minute, not once a second: this drives the 16:30 check-out
    // prediction, which cannot flip more often than that. The live duration
    // ticks inside <LiveDuration/> where only that one string re-renders.
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [step])

  useLogRealtime(
    (event) => {
      if (event.locationId !== locationId) return

      if (event.action === 'in') {
        setActiveLogId(event.logId)
        setOpenLog({ _id: event.logId, timestamp: event.timestamp, visitorName: name })
        setActiveCheckIn(locationId, event.logId, checkedInViaPasskey)
        setStep('checkedIn')
        return
      }

      if (event.relatedLogId === activeLogId || event.relatedLogId === openLog?._id) {
        clearActiveCheckIn(locationId)
        setActiveLogId(null)
        setOpenLog(null)
        setStep('checkedOut')
      }
    },
    Boolean(sessionToken),
    sessionToken
      ? `/api/realtime/guest-log?locationId=${encodeURIComponent(locationId)}&sessionToken=${encodeURIComponent(sessionToken)}`
      : '/api/realtime/guest-log',
  )

  async function checkOpenLog(token: string) {
    try {
      const [logRes, pkRes] = await Promise.all([
        fetch(`/api/logs/open?locationId=${locationId}&sessionToken=${token}`),
        fetch(
          `/api/logs/passkey/visitor/exists?sessionToken=${encodeURIComponent(token)}&locationId=${encodeURIComponent(locationId)}&locationType=${encodeURIComponent(location?.locationType ?? '')}`,
        ),
      ])
      const data = await logRes.json()
      const pkData = await pkRes.json()
      if (pkData.exists) setVisitorPasskeyRegistered(true)
      if (data.openLog) {
        setOpenLog(data.openLog)
        setActiveLogId(data.openLog._id)
        setPasskeySavedThisVisit(false)
        // Source of truth: localStorage (survives across reloads without mutation of the log doc)
        const stored = getActiveCheckIn(locationId)
        const viaPasskey = stored?.viaPasskey ?? !!data.openLog.passkeyVerified
        setCheckedInViaPasskey(viaPasskey)
        setStep('checkedIn')
      } else {
        setStep('checkin')
      }
    } catch {
      setStep('checkin')
    }
  }

  function handleIdentityStep1(e: React.FormEvent) {
    e.preventDefault()
    setIdentitySubStep(2)
  }

  function completeIdentity(skip = false) {
    const token = uuidv4()
    const g = skip ? undefined : gender || undefined
    const p = skip ? undefined : purpose || undefined
    saveSessionData(token, name, contact || undefined, g, p)
    setSessionToken(token)
    if (!skip) {
      if (g) setGender(g)
      if (p) setPurpose(p)
    }
    checkOpenLog(token)
  }

  async function handleCheckIn(photo?: string) {
    // The write is irreversible and the ledger cannot delete a duplicate, so
    // re-entry is refused here as well as deduplicated on the server.
    if (loading) return
    setLoading(true)
    setCheckedInViaPasskey(false)
    setPasskeySavedThisVisit(false)
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Was absent entirely: the server has read this header since the
          // idempotency engine shipped, and the passkey path has always sent
          // one, but the ordinary click path — the one most visitors use —
          // reached an append-only ledger with no replay protection at all.
          'Idempotency-Key': await buildIdempotencyKey(sessionToken, locationId, 'in'),
        },
        body: JSON.stringify({
          locationId,
          locationType: location?.locationType,
          sessionToken,
          visitorName: name,
          ...splitContact(contact),
          visitorGender: gender || undefined,
          visitPurpose: purpose || undefined,
          deviceId: deviceId || undefined,
          photo,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Check-in failed')
      const checkedInLog = data.existing ? data.log : data
      const logId = checkedInLog?._id ?? checkedInLog?.id
      const nextOpenLog = toOpenLog(checkedInLog, name)
      if (!logId) throw new Error('Check-in response missing log ID')
      setActiveLogId(logId)
      if (nextOpenLog) setOpenLog(nextOpenLog)
      setActiveCheckIn(locationId, logId, false)

      if (questToken) {
        await recordQuestProgress(logId)
      }

      setStep('checkedIn')
      toast.success(`Checked in to ${location?.name}`)
    } catch {
      toast.error('Check-in failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCheckOut() {
    if (!activeLogId || loading) return
    setLoading(true)
    try {
      const res = await fetch(`/api/logs/${activeLogId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': await buildIdempotencyKey(sessionToken, locationId, 'out'),
        },
        body: JSON.stringify({ sessionToken }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Check-out failed (${res.status})`)
      }
      clearActiveCheckIn(locationId)
      setStep('checkedOut')
      toast.success(`Checked out of ${location?.name}`)
    } catch (err: any) {
      toast.error(err.message ?? 'Check-out failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function recordQuestProgress(token: string) {
    if (!questToken || !location) return
    try {
      const res = await fetch(`/api/quests/${questToken}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          locationType: location.locationType,
          sessionToken,
        }),
      })
      if (res.ok) setQuestRecorded(true)
    } catch {}
  }

  async function handleQuestCardScanned(url: string) {
    try {
      const parsedUrl = new URL(url)
      const token = parsedUrl.pathname.split('/quest/')[1]
      if (!token || !location) return

      const res = await fetch(`/api/quests/${token}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          locationType: location.locationType,
          sessionToken,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setQuestRecorded(true)
        toast.success(data.completed ? 'Quest completed!' : 'Quest step recorded!')
      } else {
        toast.error(data.error ?? 'Quest progress failed')
      }
    } catch {
      toast.error('Invalid quest card')
    }
    setStep('checkedIn')
  }

  const locationLabel =
    location?.locationType === 'room'
      ? `${(location as any).buildingId?.name ?? ''} › Floor ${(location as any).floorId?.number ?? ''} › ${location.name}`
      : location?.locationType === 'floor'
      ? `${(location as any).buildingId?.name ?? ''} › ${location.name}`
      : location?.name ?? 'Location'

  // A visitor crosses seven states between scanning and leaving. Nothing
  // announced any of them, and when the active card unmounted, focus fell to
  // <body> — so a screen-reader user completed an irreversible write with no
  // confirmation that anything had changed.
  const stepKey = step === 'identity' ? `identity:${identitySubStep}` : step
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const lastStepKey = useRef<string | null>(null)

  useEffect(() => {
    const previous = lastStepKey.current
    lastStepKey.current = stepKey
    // Arrival is not a transition: the first painted step owns focus already
    // (the name field autofocuses), and moving it here would fight that.
    if (previous === null || previous === 'loading' || previous === stepKey) return
    stepHeadingRef.current?.focus()
  }, [stepKey])

  const stepAnnouncement =
    step === 'identity'
      ? identitySubStep === 1
        ? 'Enter your name to check in.'
        : 'Optional details. You can skip these.'
      : step === 'checkin'
        ? `Ready to check in to ${location?.name ?? 'this location'}.`
        : step === 'selfie'
          ? 'Optional photo. Take a photo or skip.'
          : step === 'checkedIn'
            ? `Checked in to ${location?.name ?? 'this location'}.`
            : step === 'checkedOut'
              ? `Checked out of ${location?.name ?? 'this location'}.`
              : step === 'questScan'
                ? 'Scan your quest card.'
                : ''

  const passkeyRequired = location?.checkInMode === 'passkey'
  const checkoutSuggested = openLog
    ? getPredictedAction(openLog.timestamp, currentTime) === 'checkout_suggested'
    : false

  if (!location) {
    return (
      <ScanNotice
        tone="danger"
        icon="missing"
        title="That code doesn't match a location"
        detail="The code scanned cleanly, but no building, floor or room here answers to it. It may have been retired. Nothing has been recorded."
      />
    )
  }

  const locTypeColor = location.locationType === 'room'
    ? 'text-sky-700 dark:text-sky-300 bg-sky-500/10'
    : location.locationType === 'floor'
    ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-500/10'
    : 'text-amber-700 dark:text-amber-300 bg-amber-500/10'

  return (
    // The hardcoded slate/cyan gradient here was light-only: a visitor whose
    // phone is in dark mode crossed from the dark vault at /scan straight onto a
    // white page, mid-flow, on the screen that takes their name and photo. The
    // ambient wash is the same ground /scan and /landing stand on and follows
    // the theme. No particle field — DESIGN.md keeps it out of dense views.
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="ambient-wash absolute inset-0" />
      </div>

      <a
        href="#main"
        className="glass sr-only rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>

      <header className="relative z-10 border-b border-[var(--panel-border)]">
        <nav aria-label="Primary" className="shell">
          <div className="mx-auto flex h-16 w-full max-w-sm items-center sm:h-[4.5rem] [@media(max-height:540px)]:h-12">
          <Link
            href="/landing"
            aria-label="Kamnotheat — home"
            className="group flex items-center gap-3 rounded-2xl"
          >
            <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
            <span>
              <span className="block text-sm font-semibold tracking-tight">Kamnotheat</span>
              <span className="block text-xs text-muted">Secure check-in logging</span>
            </span>
          </Link>
          </div>
        </nav>
      </header>

      <main
        id="main"
        className="shell relative z-10 flex items-start justify-center pt-8 pb-16 [@media(max-height:540px)]:pt-3 [@media(max-height:540px)]:pb-6"
      >
      <div className="w-full max-w-sm space-y-3">

        {/* Progress through the flow is polite: it never interrupts, but it
            does tell a screen-reader user that the step changed. */}
        <div aria-live="polite" role="status" className="sr-only">
          {stepAnnouncement}
        </div>

        {/* Loading skeleton */}
        {step === 'loading' && (
          <div aria-busy="true" className="space-y-3">
            <h1 className="sr-only">Loading this location</h1>
            <Card className="overflow-hidden animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-5 w-14 bg-muted rounded-full" />
                    </div>
                    <div className="h-5 w-40 bg-muted rounded-lg" />
                    <div className="h-4 w-28 bg-muted/60 rounded-lg" />
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                </div>
              </CardContent>
            </Card>
            <Card className="animate-pulse">
              <CardContent className="p-4 space-y-3">
              <div className="h-10 w-full bg-muted rounded-xl" />
              <div className="h-10 w-full bg-muted/60 rounded-xl" />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Location card */}
        {step !== 'loading' && (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${locTypeColor}`}>
                    {{ building: 'Building', floor: 'Floor', room: 'Room' }[location.locationType] ?? location.locationType}
                  </span>
                  {step === 'checkedIn' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-success)] bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Checked In
                    </span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-foreground leading-tight">{location.name}</h1>
                <p className="text-sm text-muted mt-0.5">{locationLabel}</p>
                {location.description && (
                  <p className="text-xs text-muted mt-1.5">{location.description}</p>
                )}
                {(location as any).capacity && (
                  <p className="text-xs text-muted mt-1">
                    <span className="font-medium">Capacity:</span> {(location as any).capacity}
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-sm">
                <MapPin className="size-5 text-white" strokeWidth={2.2} aria-hidden />
              </div>
            </div>
          </CardContent>
        </Card>
        )} {/* end location card */}

        {/* Step: Identity — step 1 */}
        {step === 'identity' && identitySubStep === 1 && (
          <Card>
            <CardContent className="p-4">
            <div className="mb-4">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                Who are you?
              </h2>
              <p className="text-sm text-muted mt-0.5">Enter your name to check in</p>
            </div>
            <form onSubmit={handleIdentityStep1} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="visitor-name">
                  Full name <span className="text-[var(--status-danger)]">*</span>
                </Label>
                <Input
                  id="visitor-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitor-contact">Email or phone (optional)</Label>
                <Input
                  id="visitor-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com or +1 555…"
                />
              </div>
              <Button
                size="touch"
                type="submit"
                className="w-full"
              >
                Continue
              </Button>
            </form>
            </CardContent>
          </Card>
        )}

        {/* Step: Identity — step 2 */}
        {step === 'identity' && identitySubStep === 2 && (
          <Card>
            <CardContent className="p-4">
            <div className="mb-4">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                A couple more details
              </h2>
              <p className="text-sm text-muted mt-0.5">Optional — you can skip these</p>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="visit-purpose">
                  Purpose of visit (optional)
                </Label>
                <Input
                  id="visit-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Meeting, interview, delivery…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitor-gender">Gender (optional)</Label>
                <Select value={gender} onValueChange={v => setGender(v ?? '')}>
                  <SelectTrigger id="visitor-gender" className="w-full">
                    <SelectValue placeholder="Select…">
                      {gender ? ({ male: 'Male', female: 'Female', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' } as Record<string, string>)[gender] : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="non_binary">Non-binary</SelectItem>
                    <SelectItem value="prefer_not_to_say">Prefer not to say</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="touch"
                type="button"
                onClick={() => completeIdentity(false)}
                className="w-full"
              >
                Continue
              </Button>
              <Button
                size="touch"
                type="button"
                onClick={() => completeIdentity(true)}
                variant="ghost"
                className="w-full"
              >
                Skip
              </Button>
            </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Check-in */}
        {step === 'checkin' && (
          <Card>
            <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3.5 py-2.5">
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-sm font-semibold text-accent shrink-0">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                {contact && <p className="text-xs text-muted truncate">{contact}</p>}
                {(gender || purpose) && (
                  <p className="text-xs text-muted truncate">
                    {[purpose, gender && ({ male: 'Male', female: 'Female', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' } as Record<string,string>)[gender]].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              {/* Inline, so not the full-width 48px control — but `size="sm"`
                  alone resolves to h-9 md:h-8, a 32px target on desktop for the
                  only way to correct a name before an irreversible write. h-11
                  meets the 44px floor without dominating the summary row.
                  `title` was the only long-form description and screen readers
                  do not surface it reliably; aria-label does, and still contains
                  the visible word so the name matches the label. */}
              <Button
                type="button"
                onClick={() => { setIdentitySubStep(1); setStep('identity') }}
                variant="ghost"
                size="sm"
                className="h-11 shrink-0 px-4"
                aria-label="Edit your information"
              >
                Edit
              </Button>
            </div>
            {passkeyRequired ? (
              <div className="flex items-center gap-2 text-xs text-[var(--status-warning)] bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                <Lock className="size-3.5 shrink-0" strokeWidth={2.3} aria-hidden />
                <span>This location requires a passkey (Face ID, Touch ID, or PIN) to check in.</span>
              </div>
            ) : (
              <Button
                size="touch"
                type="button"
                onClick={() => setStep('selfie')}
                className="w-full"
              >
                Check In
              </Button>
            )}
            {!passkeyRequired && (
              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="flex-1 h-px bg-border" />
                <span>or use biometrics</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <VisitorPasskey
              locationId={locationId}
              locationType={location.locationType}
              action="in"
              sessionToken={sessionToken}
              visitorName={name}
              visitorContact={contact || undefined}
              visitorGender={gender || undefined}
              visitPurpose={purpose || undefined}
              deviceId={deviceId || undefined}
              onAuthenticated={(logId, log) => {
                const nextOpenLog = toOpenLog(
                  log ?? { _id: logId, timestamp: new Date().toISOString(), visitorName: name, passkeyVerified: true },
                  name,
                )
                setActiveLogId(logId)
                if (nextOpenLog) setOpenLog(nextOpenLog)
                setActiveCheckIn(locationId, logId, true)
                if (questToken) recordQuestProgress(logId)
                setVisitorPasskeyRegistered(true)
                setPasskeySavedThisVisit(false)
                setCheckedInViaPasskey(true)
                setStep('checkedIn')
                toast.success(`Checked in`)
              }}
              onRegistered={() => {
                setVisitorPasskeyRegistered(true)
                setPasskeySavedThisVisit(true)
              }}
            />
            </CardContent>
          </Card>
        )}

        {/* Step: Selfie */}
        {step === 'selfie' && (
          <Card>
            <CardContent className="p-4">
            <div className="mb-4">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                Optional Selfie
              </h2>
              <p className="text-sm text-muted mt-0.5">Take a photo or skip</p>
            </div>
            <SelfieCapture
              onCapture={(url) => {
                setPhotoUrl(url)
                handleCheckIn(url)
              }}
              onSkip={() => handleCheckIn()}
            />
            </CardContent>
          </Card>
        )}

        {/* Step: Checked In */}
        {step === 'checkedIn' && (
          <Card>
            <CardContent className="p-4 space-y-3">
            {openLog && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-[var(--status-success)] font-semibold">
                  Checked in at {formatCheckInTime(openLog.timestamp)} ·{' '}
                  <LiveDuration since={openLog.timestamp} />
                </p>
                {checkoutSuggested && (
                  <p className="text-xs font-semibold text-[var(--status-warning)]">
                    Suggested: time to check out.
                  </p>
                )}
              </div>
            )}
            {/* Click checkout — only if guest checked in by clicking */}
            {/* Busy, not disabled. HeroUI renders a disabled control at
                --disabled-opacity and the native attribute blurs it, so the one
                irreversible action in the flow became both unreadable and
                unfocused at the moment it was pressed. handleCheckOut refuses
                re-entry itself, so nothing needs the attribute to do it. */}
            {!checkedInViaPasskey && (
              <Button
                size="touch"
                type="button"
                onClick={handleCheckOut}
                isLoading={loading}
                loadingBehavior="busy"
                variant="destructive"
                className="w-full"
              >
                {loading ? 'Checking out…' : checkoutSuggested ? 'Check Out — Suggested' : 'Check Out'}
              </Button>
            )}
            {/* Passkey checkout — only if guest checked in by passkey */}
            {checkedInViaPasskey && (
              <VisitorPasskey
                locationId={locationId}
                locationType={location.locationType}
                action="out"
                sessionToken={sessionToken}
                relatedLogId={activeLogId ?? undefined}
                visitorName={name}
                visitorContact={contact || undefined}
                visitorGender={gender || undefined}
                visitPurpose={purpose || undefined}
                deviceId={deviceId || undefined}
                authOnly
                onAuthenticated={() => {
                  clearActiveCheckIn(locationId)
                  setStep('checkedOut')
                  toast.success(`Checked out`)
                }}
              />
            )}

            {/* Offer to save passkey only if location is click-mode and passkey not yet registered */}
            {location.checkInMode !== 'passkey' && !checkedInViaPasskey && !visitorPasskeyRegistered && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <div className="flex-1 h-px bg-border" />
                  <span>save for next time</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <VisitorPasskey
                  locationId={locationId}
                  locationType={location.locationType}
                  action="in"
                  sessionToken={sessionToken}
                  visitorName={name}
                  visitorContact={contact || undefined}
                  visitorGender={gender || undefined}
                  visitPurpose={purpose || undefined}
                  deviceId={deviceId || undefined}
                  registerOnly
                  onRegistered={() => {
                    setVisitorPasskeyRegistered(true)
                    setPasskeySavedThisVisit(true)
                  }}
                />
              </>
            )}
            {passkeySavedThisVisit && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--status-success)] font-semibold">
                <CircleCheck className="size-3.5" strokeWidth={2.3} aria-hidden />
                Passkey saved
              </div>
            )}

            {!questRecorded && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <div className="flex-1 h-px bg-border" />
                  <span>quest</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button
                  size="touch"
                  type="button"
                  onClick={() => setStep('questScan')}
                  variant="outline"
                  className="w-full"
                >
                  <Star className="size-4" strokeWidth={2.3} aria-hidden />
                  Scan Quest Card
                </Button>
              </>
            )}
            {questRecorded && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-[var(--status-success)] font-semibold">
                <Star className="size-4" strokeWidth={2.3} aria-hidden /> Quest step recorded!
              </div>
            )}
            </CardContent>
          </Card>
        )}

        {/* Step: Quest scan */}
        {step === 'questScan' && (
          <Card>
            <CardContent className="p-4">
            <div className="mb-4">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                Scan Quest Card
              </h2>
              <p className="text-sm text-muted mt-0.5">Point camera at your quest card QR code</p>
            </div>
            <QRScanner onResult={handleQuestCardScanned} redirectOnScan={false} />
            <Button
              size="touch"
              type="button"
              onClick={() => setStep('checkedIn')}
              variant="ghost"
              className="w-full mt-3"
            >
              Cancel
            </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Checked Out */}
        {step === 'checkedOut' && (
          <Card className="text-center">
            <CardContent className="p-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CircleCheck className="size-8 text-[var(--status-success)]" strokeWidth={2.2} aria-hidden />
            </div>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="font-bold text-foreground text-lg outline-none">
              All done!
            </h2>
            <p className="text-sm text-muted mt-1.5">
              You've checked out of <span className="font-medium text-foreground">{location.name}</span>
            </p>
            <p className="text-sm text-muted mt-1">Thanks for visiting. See you soon.</p>
            </CardContent>
          </Card>
        )}
      </div>
      </main>
    </div>
  )
}
