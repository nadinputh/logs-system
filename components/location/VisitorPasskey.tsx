'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Fingerprint, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/sonner'

interface Props {
  locationId: string
  locationType: string
  action: 'in' | 'out'
  sessionToken: string
  relatedLogId?: string
  visitorName?: string
  visitorContact?: string
  visitorGender?: string
  visitPurpose?: string
  deviceId?: string
  // authOnly: never show the register path (checkout screen)
  authOnly?: boolean
  // registerOnly: always show the register path (save passkey after click check-in)
  registerOnly?: boolean
  onAuthenticated?: (logId: string, log?: VisitorPasskeyLog) => void
  onRegistered?: () => void
}

interface VisitorPasskeyLog {
  _id?: string
  id?: string
  timestamp?: string
  visitorName?: string
  passkeyVerified?: boolean
}

// sha256(sessionToken:locationId:YYYY-MM-DD:action)
async function buildIdempotencyKey(sessionToken: string, locationId: string, action: string) {
  const date = new Date().toISOString().slice(0, 10)
  const raw = `${sessionToken}:${locationId}:${date}:${action}`
  const data = new TextEncoder().encode(raw)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function contactFields(contact?: string) {
  if (!contact) return {}
  return contact.includes('@') ? { visitorEmail: contact } : { visitorPhone: contact }
}

function passkeyVerificationMessage(data: any, action: 'in' | 'out') {
  switch (data?.code) {
    case 'PASSKEY_NOT_REGISTERED':
      return action === 'out'
        ? 'This passkey is not registered here. Use the same passkey that checked in.'
        : 'This passkey is not registered here. Save a passkey first or use normal check-in.'
    case 'PASSKEY_MISMATCH':
      return 'This is not the same passkey used to check in. Please use the original passkey.'
    case 'PASSKEY_CREDENTIAL_CONTEXT_MISSING':
      return 'This check-in is missing passkey details. Please ask staff to help check out.'
    case 'CHECKIN_NOT_PASSKEY_VERIFIED':
      return 'This check-in was not made with passkey. Please use normal checkout.'
    default:
      return data?.error ?? 'Verification failed'
  }
}

export default function VisitorPasskey({
  locationId,
  locationType,
  action,
  sessionToken,
  relatedLogId,
  visitorName,
  visitorContact,
  visitorGender,
  visitPurpose,
  deviceId,
  authOnly = false,
  registerOnly = false,
  onAuthenticated,
  onRegistered,
}: Props) {
  const [supported, setSupported] = useState(false)
  const [hasPasskey, setHasPasskey] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  useEffect(() => {
    if (!sessionToken) { setHasPasskey(false); return }
    let cancelled = false
    fetch(
      `/api/logs/passkey/visitor/exists?sessionToken=${encodeURIComponent(sessionToken)}&locationId=${encodeURIComponent(locationId)}&locationType=${encodeURIComponent(locationType)}`,
    )
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHasPasskey(!!d.exists) })
      .catch(() => { if (!cancelled) setHasPasskey(false) })
    return () => { cancelled = true }
  }, [sessionToken, locationId, locationType])

  const authenticate = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const idempotencyKey = await buildIdempotencyKey(sessionToken, locationId, action)
      const intentPayload = {
        locationId,
        locationType,
        action,
        sessionToken,
        relatedLogId,
        idempotencyKey,
        visitorName,
        ...contactFields(visitorContact),
        visitorGender,
        visitPurpose,
        deviceId,
      }

      const challengeRes = await fetch('/api/logs/passkey/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentPayload),
      })
      if (!challengeRes.ok) {
        const d = await challengeRes.json()
        throw new Error(d.error ?? 'Failed to get challenge')
      }
      const options = await challengeRes.json()
      const response = await startAuthentication({ optionsJSON: options })

      const verifyRes = await fetch('/api/logs/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, ...intentPayload }),
      })
      const data = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(passkeyVerificationMessage(data, action))

      const logId = data.log?._id ?? data.log?.id ?? ''
      if (!logId) throw new Error('Passkey verified, but no log was recorded. Please try again.')
      onAuthenticated?.(logId, data.log)
      return true
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? 'Biometric check-in failed')
      return false
    } finally {
      setLoading(false)
    }
  }, [locationId, locationType, action, sessionToken, relatedLogId, visitorName, visitorContact, visitorGender, visitPurpose, deviceId, onAuthenticated])

  const register = useCallback(async () => {
    setLoading(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const payload = {
        locationId,
        locationType,
        sessionToken,
        visitorName,
        ...contactFields(visitorContact),
        visitorGender,
        visitPurpose,
      }

      const optionsRes = await fetch('/api/logs/passkey/visitor/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!optionsRes.ok) {
        const d = await optionsRes.json()
        throw new Error(d.error ?? 'Failed to get registration options')
      }
      const options = await optionsRes.json()
      const response = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/logs/passkey/visitor/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, ...payload }),
      })
      if (!verifyRes.ok) {
        const d = await verifyRes.json()
        throw new Error(d.error ?? 'Registration failed')
      }
      setHasPasskey(true)
      if (registerOnly) {
        onRegistered?.()
      } else {
        const success = await authenticate()
        if (success) onRegistered?.()
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? 'Biometric registration failed')
    } finally {
      setLoading(false)
    }
  }, [sessionToken, visitorName, visitorContact, visitorGender, visitPurpose, registerOnly, authenticate, onRegistered])

  if (!supported) return null
  // registerOnly: hide once a passkey is already saved for this session
  if (registerOnly && hasPasskey) return null
  if (hasPasskey === null && !registerOnly) {
    return (
      <Button variant="outline" className="w-full" disabled>
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Checking…
      </Button>
    )
  }

  const useRegister = registerOnly || (!hasPasskey && !authOnly)
  const onClick = useRegister ? register : authenticate
  const baseLabel = action === 'out' ? 'Check Out' : registerOnly ? 'Save Passkey for next visit' : 'Check In'
  const label = loading
    ? (useRegister ? 'Saving…' : 'Verifying…')
    : useRegister
      ? (registerOnly ? baseLabel : `${baseLabel} & Save Passkey`)
      : baseLabel

  return (
    <div className="space-y-1.5">
      <Button variant="outline" className="w-full" onClick={onClick} disabled={loading}>
        <Fingerprint className="w-4 h-4 mr-2" />
        {label}
      </Button>
      <p className="text-xs text-center text-muted">
        Uses Face ID, Touch ID, or device PIN
      </p>
    </div>
  )
}
