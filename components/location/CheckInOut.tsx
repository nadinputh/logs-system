'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { LogoTile } from '@/components/Logo'
import { CircleCheck, Lock, MapPin, Star } from 'lucide-react'
import { ScanNotice } from '@/components/location/ScanNotice'
import { VisitorNotice } from '@/components/legal/VisitorNotice'
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
import { usePasskeySupport } from '@/lib/usePasskeySupport'
import { getClientCoordinates } from '@/lib/geolocation'

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
  requireDynamicQr?: boolean
  buildingId?: { name: string; address: string }
  floorId?: { name: string; number: number }
}

interface OpenLog {
  _id: string
  timestamp: string
  visitorName?: string
  passkeyVerified?: boolean
}

type Step = 'loading' | 'identity' | 'checkin' | 'checkedIn' | 'checkedOut' | 'questScan'

interface CheckInOutClientProps {
  locationId: string
  initialLocation: LocationData | null
  kioskToken?: string
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
function LiveDuration({ since, units }: { since: string; units: { h: string; m: string } }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <>{formatDuration(since, now, units)}</>
}

function formatCheckInTime(value: string | Date, locale: string) {
  return new Date(value).toLocaleTimeString(locale, {
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

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

const postJson = (url: string, body: unknown) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export default function CheckInOutClient({ locationId, initialLocation, kioskToken }: CheckInOutClientProps) {
  const t = useTranslations('checkin')
  const locale = useLocale()
  const units = { h: t('unitHour'), m: t('unitMinute') }
  const tCommon = useTranslations('common')
  const tNotice = useTranslations('scanNotice')
  const genderLabels: Record<string, string> = { male: t('genderMale'), female: t('genderFemale'), non_binary: t('genderNonBinary'), prefer_not_to_say: t('genderPreferNot') }
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
  const [loading, setLoading] = useState(false)
  const [questRecorded, setQuestRecorded] = useState(false)
  const [visitorPasskeyRegistered, setVisitorPasskeyRegistered] = useState(false)
  const [passkeySavedThisVisit, setPasskeySavedThisVisit] = useState(false)
  const [checkedInViaPasskey, setCheckedInViaPasskey] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => new Date())
  // True only across the moment a check-in is actually written this session —
  // never on a restored session — so the seal motion plays once, for the
  // write it depicts, and not every time a returning visitor's page reloads.
  const [justCheckedIn, setJustCheckedIn] = useState(false)
  const [isReturningVisitor, setIsReturningVisitor] = useState(false)
  const [lastStayDuration, setLastStayDuration] = useState<string | null>(null)
  // null while the check is in flight, so the passkey-required and passkey-
  // checkout branches don't flash an "ask staff" fallback before it resolves.
  const passkeySupport = usePasskeySupport()

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
      setIsReturningVisitor(true)
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
        setJustCheckedIn(true)
        setStep('checkedIn')
        return
      }

      if (event.relatedLogId === activeLogId || event.relatedLogId === openLog?._id) {
        setLastStayDuration(openLog ? formatDuration(openLog.timestamp, new Date(), units) : null)
        setJustCheckedIn(false)
        clearActiveCheckIn(locationId)
        setActiveLogId(null)
        setOpenLog(null)
        setStep('checkedOut')
      }
    },
    Boolean(sessionToken),
    '/api/realtime/guest-log',
    { locationId, sessionToken },
  )

  async function checkOpenLog(token: string) {
    try {
      const [logRes, pkRes] = await Promise.all([
        // POST so the session token travels in the body, not in a URL that
        // lands in access logs, history and Referer.
        postJson('/api/logs/open', { locationId, sessionToken: token }),
        postJson('/api/logs/passkey/visitor/exists', {
          sessionToken: token,
          locationId,
          locationType: location?.locationType ?? '',
        }),
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

  async function handleCheckIn() {
    // The write is irreversible and the ledger cannot delete a duplicate, so
    // re-entry is refused here as well as deduplicated on the server.
    if (loading) return
    setLoading(true)
    setCheckedInViaPasskey(false)
    setPasskeySavedThisVisit(false)
    try {
      const coords = await getClientCoordinates()
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
          kioskToken,
          latitude: coords?.latitude,
          longitude: coords?.longitude,
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
        await recordQuestProgress()
      }

      setJustCheckedIn(true)
      setStep('checkedIn')
      toast.success(t('toastCheckedInTo', { location: location?.name ?? '' }))
    } catch {
      toast.error(t('toastCheckInFailed'))
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
      setLastStayDuration(openLog ? formatDuration(openLog.timestamp, new Date(), units) : null)
      setJustCheckedIn(false)
      clearActiveCheckIn(locationId)
      setStep('checkedOut')
      toast.success(t('toastCheckedOutOf', { location: location?.name ?? '' }))
    } catch (err: any) {
      toast.error(err.message ?? t('toastCheckOutFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function postQuestProgress(token: string) {
    const res = await fetch(`/api/quests/${token}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locationId,
        locationType: location!.locationType,
        sessionToken,
        kioskToken,
      }),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  // Distinguishes "already recorded" from a fresh completion so a re-scan or
  // a returning visitor isn't told something new just happened when it
  // didn't — both quest-progress call sites below share this outcome.
  async function submitQuestProgress(token: string) {
    try {
      const { ok, data } = await postQuestProgress(token)
      if (!ok) {
        toast.error(data.error ?? t('toastQuestFailed'))
        return
      }
      setQuestRecorded(true)
      if (data.message === 'Already recorded') {
        toast.success(t('toastQuestAlready'))
      } else {
        toast.success(data.completed ? t('toastQuestDone') : t('questStepRecorded'))
      }
    } catch {
      toast.error(t('toastQuestOffline'))
    }
  }

  async function recordQuestProgress() {
    if (!questToken || !location) return
    await submitQuestProgress(questToken)
  }

  async function handleQuestCardScanned(url: string) {
    let token: string | undefined
    try {
      token = new URL(url).pathname.split('/quest/')[1]
    } catch {
      token = undefined
    }
    if (!token || !location) {
      toast.error(t('toastNotQuestCard'))
      setStep('checkedIn')
      return
    }

    await submitQuestProgress(token)
    setStep('checkedIn')
  }

  const locationLabel =
    location?.locationType === 'room'
      ? `${(location as any).buildingId?.name ?? ''} › ${t('floorLabel', { number: (location as any).floorId?.number ?? '' })} › ${location.name}`
      : location?.locationType === 'floor'
      ? `${(location as any).buildingId?.name ?? ''} › ${location.name}`
      : location?.name ?? t('locationFallback')

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

  const locName = location?.name ?? t('thisLocation')
  const stepAnnouncement =
    step === 'identity'
      ? identitySubStep === 1
        ? t('annEnterName')
        : t('annOptional')
      : step === 'checkin'
        ? isReturningVisitor
          ? t('annReadyReturning', { name: firstNameOf(name), location: locName })
          : t('annReady', { location: locName })
        : step === 'checkedIn'
            ? t('annCheckedIn', { location: locName })
            : step === 'checkedOut'
              ? lastStayDuration && lastStayDuration !== `0${units.m}`
                ? t('annCheckedOutAfter', { location: locName, duration: lastStayDuration })
                : t('annCheckedOut', { location: locName })
              : step === 'questScan'
                ? t('annQuest')
                : ''

  const passkeyRequired = location?.checkInMode === 'passkey'
  // Live-QR locations need proof of presence to check in, not to check out.
  const needsLiveQr =
    !!location?.requireDynamicQr && !kioskToken && (step === 'identity' || step === 'checkin')
  const checkoutSuggested = openLog
    ? getPredictedAction(openLog.timestamp, currentTime) === 'checkout_suggested'
    : false

  if (!location) {
    return (
      <ScanNotice
        tone="danger"
        icon="missing"
        title={t('missingTitle')}
        detail={t('missingDetail')}
      />
    )
  }

  if (needsLiveQr) {
    return (
      <ScanNotice
        tone="warning"
        icon="expired"
        title={tNotice('liveOnlyTitle')}
        detail={tNotice('liveOnlyDetail')}
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
    // white page, mid-flow, on the screen that takes their name. The
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
        {t('skipToContent')}
      </a>

      <header className="relative z-10 border-b border-[var(--panel-border)]">
        <nav aria-label={t('primaryNav')} className="shell">
          <div className="mx-auto flex h-16 w-full max-w-sm items-center sm:h-[4.5rem] [@media(max-height:540px)]:h-12">
          <Link
            href="/landing"
            aria-label={tCommon('homeAriaLabel')}
            className="group flex items-center gap-3 rounded-2xl"
          >
            <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
            <span>
              <span className="block text-sm font-semibold tracking-tight">Kamnotheat</span>
              <span className="block text-xs text-muted">{tCommon('tagline')}</span>
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
            <h1 className="sr-only">{t('loadingLocation')}</h1>
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
        <Card className="relative overflow-hidden">
          {/* The same write-then-seal motion RecordPanel only illustrates on
              the landing page, played for real over the visitor's own record
              at the moment it is actually written. Once per genuine write —
              justCheckedIn stays false on a restored session, so reloading an
              already-open check-in never replays it. */}
          {step === 'checkedIn' && justCheckedIn && (
            <div
              aria-hidden
              className="animate-seal-sweep pointer-events-none absolute inset-y-0 -left-1/3 z-10 w-1/3 bg-gradient-to-r from-transparent via-[var(--accent)]/14 to-transparent"
            />
          )}
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${locTypeColor}`}>
                    {({ building: t('typeBuilding'), floor: t('typeFloor'), room: t('typeRoom') } as Record<string, string>)[location.locationType] ?? location.locationType}
                  </span>
                  {step === 'checkedIn' && (
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-success)] bg-emerald-500/10 px-2 py-0.5 rounded-full ${justCheckedIn ? 'animate-seal-lock' : ''}`}
                    >
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      {t('badgeCheckedIn')}
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
                    <span className="font-medium">{t('capacity')}</span> {(location as any).capacity}
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
                {t('whoAreYou')}
              </h2>
              <p className="text-sm text-muted mt-0.5">{t('whoAreYouHint')}</p>
            </div>
            <form onSubmit={handleIdentityStep1} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="visitor-name">
                  {t('fullName')} <span className="text-[var(--status-danger)]">*</span>
                </Label>
                <Input
                  id="visitor-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('fullNamePlaceholder')}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitor-contact">{t('contactLabel')}</Label>
                <Input
                  id="visitor-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={t('contactPlaceholder')}
                />
              </div>
              <Button
                size="touch"
                type="submit"
                className="w-full"
              >
                {t('continue')}
              </Button>
            </form>
            <div className="mt-3.5">
              <VisitorNotice />
            </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Identity — step 2 */}
        {step === 'identity' && identitySubStep === 2 && (
          <Card>
            <CardContent className="p-4">
            <div className="mb-4">
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                {t('moreDetails')}
              </h2>
              <p className="text-sm text-muted mt-0.5">{t('moreDetailsHint')}</p>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="visit-purpose">
                  {t('purposeLabel')}
                </Label>
                <Input
                  id="visit-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder={t('purposePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitor-gender">{t('genderLabel')}</Label>
                <Select value={gender} onValueChange={v => setGender(v ?? '')}>
                  <SelectTrigger id="visitor-gender" className="w-full">
                    <SelectValue placeholder={t('selectPlaceholder')}>
                      {gender ? genderLabels[gender] : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">{t('genderMale')}</SelectItem>
                    <SelectItem value="female">{t('genderFemale')}</SelectItem>
                    <SelectItem value="non_binary">{t('genderNonBinary')}</SelectItem>
                    <SelectItem value="prefer_not_to_say">{t('genderPreferNot')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="touch"
                type="button"
                onClick={() => completeIdentity(false)}
                className="w-full"
              >
                {t('continue')}
              </Button>
              <Button
                size="touch"
                type="button"
                onClick={() => completeIdentity(true)}
                variant="ghost"
                className="w-full"
              >
                {t('skip')}
              </Button>
            </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Check-in */}
        {step === 'checkin' && (
          <Card>
            <CardContent className="p-4 space-y-3">
            <div>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="font-semibold text-foreground outline-none">
                {isReturningVisitor ? t('welcomeBack', { name: firstNameOf(name) }) : t('readyTitle')}
              </h2>
              <p className="text-sm text-muted mt-0.5">
                {isReturningVisitor
                  ? t('readyReturningHint')
                  : t('readyNewHint')}
              </p>
            </div>
            <div className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3.5 py-2.5">
              <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center text-sm font-semibold text-accent shrink-0">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                {contact && <p className="text-xs text-muted truncate">{contact}</p>}
                {(gender || purpose) && (
                  <p className="text-xs text-muted truncate">
                    {[purpose, gender && genderLabels[gender]].filter(Boolean).join(' · ')}
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
                aria-label={t('editAria')}
              >
                {t('edit')}
              </Button>
            </div>
            {passkeyRequired ? (
              <div className="flex items-center gap-2 text-xs text-[var(--status-warning)] bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                <Lock className="size-3.5 shrink-0" strokeWidth={2.3} aria-hidden />
                {/* A device without a platform authenticator used to leave this
                    branch entirely silent — the warning above, then nothing:
                    no button, no explanation, no way to complete the one
                    action this location allows. The message now names the
                    actual constraint and the one path still open: a person. */}
                <span>
                  {passkeySupport === false
                    ? t('passkeyRequiredNoSupport')
                    : t('passkeyRequired')}
                </span>
              </div>
            ) : (
              <Button
                size="touch"
                type="button"
                onClick={handleCheckIn}
                isLoading={loading}
                className="w-full"
              >
                {t('checkIn')}
              </Button>
            )}
            {!passkeyRequired && passkeySupport !== false && (
              <div className="flex items-center gap-3 text-xs text-muted">
                <div className="flex-1 h-px bg-border" />
                <span>{t('orBiometrics')}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <VisitorPasskey
              locationId={locationId}
              locationType={location.locationType}
              action="in"
              sessionToken={sessionToken}
              kioskToken={kioskToken}
              hasPasskey={visitorPasskeyRegistered}
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
                if (questToken) recordQuestProgress()
                setVisitorPasskeyRegistered(true)
                setPasskeySavedThisVisit(false)
                setCheckedInViaPasskey(true)
                setJustCheckedIn(true)
                setStep('checkedIn')
                toast.success(t('toastCheckedIn'))
              }}
              onRegistered={() => {
                setVisitorPasskeyRegistered(true)
                setPasskeySavedThisVisit(true)
              }}
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
                  {t('checkedInAt', { time: formatCheckInTime(openLog.timestamp, locale) })}{' '}
                  <LiveDuration since={openLog.timestamp} units={units} />
                </p>
                {checkoutSuggested && (
                  <p className="text-xs font-semibold text-[var(--status-warning)]">
                    {t('suggestedCheckout')}
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
                {loading ? t('checkingOut') : checkoutSuggested ? t('checkOutSuggested') : t('checkOut')}
              </Button>
            )}
            {/* Passkey checkout — only if guest checked in by passkey. When this
                device has no platform authenticator, VisitorPasskey rendered
                nothing at all here: a visitor who checked in with a passkey on
                one device, or lost the credential, had no way to check out —
                the ledger's promise of a matched exit for every entry broken
                by the one path meant to guarantee it. */}
            {checkedInViaPasskey && passkeySupport === false && (
              <div className="flex items-center gap-2 text-xs text-[var(--status-warning)] bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                <Lock className="size-3.5 shrink-0" strokeWidth={2.3} aria-hidden />
                <span>{t('passkeyCheckoutNoSupport')}</span>
              </div>
            )}
            {checkedInViaPasskey && passkeySupport !== false && (
              <VisitorPasskey
                locationId={locationId}
                locationType={location.locationType}
                action="out"
                sessionToken={sessionToken}
                relatedLogId={activeLogId ?? undefined}
                hasPasskey={visitorPasskeyRegistered}
                visitorName={name}
                visitorContact={contact || undefined}
                visitorGender={gender || undefined}
                visitPurpose={purpose || undefined}
                deviceId={deviceId || undefined}
                authOnly
                onAuthenticated={() => {
                  setLastStayDuration(openLog ? formatDuration(openLog.timestamp, new Date(), units) : null)
                  setJustCheckedIn(false)
                  clearActiveCheckIn(locationId)
                  setStep('checkedOut')
                  toast.success(t('toastCheckedOut'))
                }}
              />
            )}

            {/* Offer to save passkey only if location is click-mode and passkey not yet registered */}
            {location.checkInMode !== 'passkey' && !checkedInViaPasskey && !visitorPasskeyRegistered && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <div className="flex-1 h-px bg-border" />
                  <span>{t('saveForNextTime')}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <VisitorPasskey
                  locationId={locationId}
                  locationType={location.locationType}
                  action="in"
                  sessionToken={sessionToken}
                  hasPasskey={visitorPasskeyRegistered}
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
                {t('passkeySaved')}
              </div>
            )}

            {!questRecorded && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <div className="flex-1 h-px bg-border" />
                  <span>{t('questDivider')}</span>
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
                  {t('scanQuestCard')}
                </Button>
              </>
            )}
            {questRecorded && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-[var(--status-success)] font-semibold">
                <Star className="size-4" strokeWidth={2.3} aria-hidden /> {t('questStepRecorded')}
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
                {t('scanQuestCard')}
              </h2>
              <p className="text-sm text-muted mt-0.5">{t('questPointCamera')}</p>
            </div>
            <QRScanner onResult={handleQuestCardScanned} redirectOnScan={false} />
            <Button
              size="touch"
              type="button"
              onClick={() => setStep('checkedIn')}
              variant="ghost"
              className="w-full mt-3"
            >
              {t('cancel')}
            </Button>
            </CardContent>
          </Card>
        )}

        {/* Step: Checked Out */}
        {step === 'checkedOut' && (
          <Card className="text-center">
            <CardContent className="p-4">
            <div className="animate-notice w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
              <CircleCheck className="size-8 text-[var(--status-success)]" strokeWidth={2.2} aria-hidden />
            </div>
            <h2 ref={stepHeadingRef} tabIndex={-1} className="font-bold text-foreground text-lg outline-none">
              {t('allDone')}
            </h2>
            <p className="text-sm text-muted mt-1.5">
              {t.rich('checkedOutOf', { location: location.name, b: (c) => <span className="font-medium text-foreground">{c}</span> })}
            </p>
            {/* Duration is carried from the sealed timestamps that were already
                on screen a moment ago — a receipt, not a new claim. Omitted
                under a minute, where "0m" would read as broken rather than true. */}
            {lastStayDuration && lastStayDuration !== `0${units.m}` && (
              <p className="text-sm text-muted mt-1">{t('stayDuration', { duration: lastStayDuration })}</p>
            )}
            <p className="text-sm text-muted mt-1">{t('thanks')}</p>
            </CardContent>
          </Card>
        )}
      </div>
      </main>
    </div>
  )
}
