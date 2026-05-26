'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { getPredictedAction, formatDuration } from '@/lib/predictive'

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
  const [checkedInViaPasskey, setCheckedInViaPasskey] = useState(false)

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

  async function checkOpenLog(token: string) {
    try {
      const [logRes, pkRes] = await Promise.all([
        fetch(`/api/logs/open?locationId=${locationId}&sessionToken=${token}`),
        fetch(`/api/logs/passkey/visitor/exists?sessionToken=${encodeURIComponent(token)}`),
      ])
      const data = await logRes.json()
      const pkData = await pkRes.json()
      if (pkData.exists) setVisitorPasskeyRegistered(true)
      if (data.openLog) {
        setOpenLog(data.openLog)
        setActiveLogId(data.openLog._id)
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
    setLoading(true)
    setCheckedInViaPasskey(false)
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      const logId = data.existing ? data.log._id : data._id
      setActiveLogId(logId)
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
    if (!activeLogId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/logs/${activeLogId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  if (!location) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20">
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-bold text-foreground">Location not found</h2>
          <p className="text-sm text-muted-foreground mt-1.5">This QR code may be invalid or expired.</p>
        </div>
      </div>
    )
  }

  const locTypeColor = location.locationType === 'room'
    ? 'text-indigo-600 bg-indigo-50'
    : location.locationType === 'floor'
    ? 'text-violet-600 bg-violet-50'
    : 'text-amber-600 bg-amber-50'

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-start justify-center p-4 pt-8 pb-16">
      <div className="w-full max-w-sm space-y-3">

        {/* Loading skeleton */}
        {step === 'loading' && (
          <>
            <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden animate-pulse">
              <div className="h-1.5 w-full bg-gradient-to-r from-indigo-200 via-violet-200 to-indigo-200" />
              <div className="p-5">
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
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5 space-y-3 animate-pulse">
              <div className="h-10 w-full bg-muted rounded-xl" />
              <div className="h-10 w-full bg-muted/60 rounded-xl" />
            </div>
          </>
        )}

        {/* Location card */}
        {step !== 'loading' && (
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full gradient-primary" />
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${locTypeColor}`}>
                    {{ building: 'Building', floor: 'Floor', room: 'Room' }[location.locationType] ?? location.locationType}
                  </span>
                  {step === 'checkedIn' && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      Checked In
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-foreground leading-tight">{location.name}</h2>
                <p className="text-sm text-muted-foreground mt-0.5">{locationLabel}</p>
                {location.description && (
                  <p className="text-xs text-muted-foreground mt-1.5">{location.description}</p>
                )}
                {(location as any).capacity && (
                  <p className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">Capacity:</span> {(location as any).capacity}
                  </p>
                )}
              </div>
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
        )} {/* end location card */}

        {/* Step: Identity — step 1 */}
        {step === 'identity' && identitySubStep === 1 && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">Who are you?</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Enter your name to check in</p>
            </div>
            <form onSubmit={handleIdentityStep1} className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="visitor-name" className="text-sm font-medium text-foreground">
                  Full name <span className="text-red-500">*</span>
                </label>
                <input
                  id="visitor-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="visitor-contact" className="text-sm font-medium text-foreground">
                  Email or phone <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <input
                  id="visitor-contact"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@example.com or +1 555…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <button
                type="submit"
                className="w-full gradient-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm shadow-indigo-200"
              >
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* Step: Identity — step 2 */}
        {step === 'identity' && identitySubStep === 2 && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">A couple more details</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Optional — you can skip these</p>
            </div>
            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor="visit-purpose" className="text-sm font-medium text-foreground">
                  Purpose of visit
                </label>
                <input
                  id="visit-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Meeting, interview, delivery…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitor-gender">Gender</Label>
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
              <button
                onClick={() => completeIdentity(false)}
                className="w-full gradient-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm shadow-indigo-200"
              >
                Continue →
              </button>
              <button
                onClick={() => completeIdentity(true)}
                className="w-full text-sm text-muted-foreground hover:text-foreground py-2 rounded-xl hover:bg-muted/50 transition-all"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Step: Check-in */}
        {step === 'checkin' && (() => {
          const passkeyRequired = location.checkInMode === 'passkey'
          return (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5 space-y-3">
            <div className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3.5 py-2.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {name[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{name}</p>
                {contact && <p className="text-xs text-muted-foreground truncate">{contact}</p>}
                {(gender || purpose) && (
                  <p className="text-xs text-muted-foreground/70 truncate">
                    {[purpose, gender && ({ male: 'Male', female: 'Female', non_binary: 'Non-binary', prefer_not_to_say: 'Prefer not to say' } as Record<string,string>)[gender]].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setIdentitySubStep(1); setStep('identity') }}
                className="shrink-0 text-xs text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                title="Edit your information"
              >
                Edit
              </button>
            </div>
            {passkeyRequired ? (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200/60 rounded-xl px-3 py-2">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>This location requires a passkey (Face ID, Touch ID, or PIN) to check in.</span>
              </div>
            ) : (
              <button
                onClick={() => setStep('selfie')}
                className="w-full gradient-primary text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm shadow-indigo-200 text-base"
              >
                Check In
              </button>
            )}
            {!passkeyRequired && (
              <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
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
              onAuthenticated={(logId) => {
                setActiveLogId(logId)
                setActiveCheckIn(locationId, logId, true)
                if (questToken) recordQuestProgress(logId)
                setCheckedInViaPasskey(true)
                setStep('checkedIn')
                toast.success(`Checked in`)
              }}
              onRegistered={() => {
                setVisitorPasskeyRegistered(true)
                handleCheckIn()
              }}
            />
          </div>
          )
        })()}

        {/* Step: Selfie */}
        {step === 'selfie' && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">Optional Selfie</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Take a photo or skip</p>
            </div>
            <SelfieCapture
              onCapture={(url) => {
                setPhotoUrl(url)
                handleCheckIn(url)
              }}
              onSkip={() => handleCheckIn()}
            />
          </div>
        )}

        {/* Step: Checked In */}
        {step === 'checkedIn' && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5 space-y-3">
            {openLog && (
              <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl px-4 py-3 space-y-1">
                <p className="text-xs text-emerald-700 font-medium">
                  Checked in at {new Date(openLog.timestamp).toLocaleTimeString()} · {formatDuration(openLog.timestamp)}
                </p>
                {getPredictedAction(openLog.timestamp) === 'checkout_suggested' && (
                  <p className="text-xs font-semibold text-amber-700">
                    ⏰ Time to check out?
                  </p>
                )}
              </div>
            )}
            {/* Click checkout — only if guest checked in by clicking */}
            {!checkedInViaPasskey && (
              <button
                onClick={handleCheckOut}
                disabled={loading}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-semibold py-3 rounded-xl active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed text-base"
              >
                {loading ? 'Checking out…' : 'Check Out'}
              </button>
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
                authOnly
                onAuthenticated={() => {
                  clearActiveCheckIn(locationId)
                  setStep('checkedOut')
                  toast.success(`Checked out`)
                }}
              />
            )}

            {/* Offer to save passkey only if location is click-mode and passkey not yet registered */}
            {location.checkInMode !== 'passkey' && !visitorPasskeyRegistered && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
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
                  registerOnly
                  onRegistered={() => setVisitorPasskeyRegistered(true)}
                />
              </>
            )}
            {visitorPasskeyRegistered && (
              <div className="flex items-center justify-center gap-1.5 text-xs text-emerald-600 font-medium">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Passkey saved
              </div>
            )}

            {!questRecorded && (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground/60">
                  <div className="flex-1 h-px bg-border" />
                  <span>quest</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <button
                  onClick={() => setStep('questScan')}
                  className="w-full text-sm text-muted-foreground border border-border/60 hover:bg-muted/40 hover:text-foreground py-2.5 rounded-xl transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  Scan Quest Card
                </button>
              </>
            )}
            {questRecorded && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-emerald-600 font-semibold">
                ✨ Quest step recorded!
              </div>
            )}
          </div>
        )}

        {/* Step: Quest scan */}
        {step === 'questScan' && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-5">
            <div className="mb-4">
              <h3 className="font-semibold text-foreground">Scan Quest Card</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Point camera at your quest card QR code</p>
            </div>
            <QRScanner onResult={handleQuestCardScanned} redirectOnScan={false} />
            <button
              onClick={() => setStep('checkedIn')}
              className="w-full mt-3 text-sm text-muted-foreground hover:text-foreground py-2 rounded-xl hover:bg-muted/50 transition-all"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Step: Checked Out */}
        {step === 'checkedOut' && (
          <div className="bg-white rounded-2xl border border-border/60 shadow-sm p-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-foreground text-lg">All done!</h3>
            <p className="text-sm text-muted-foreground mt-1.5">
              You've checked out of <span className="font-medium text-foreground">{location.name}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">Thanks for visiting. See you soon! 👋</p>
          </div>
        )}
      </div>
    </div>
  )
}
