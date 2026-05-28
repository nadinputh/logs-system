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
  // authOnly: never show the register path (checkout screen)
  authOnly?: boolean
  // registerOnly: always show the register path (save passkey after click check-in)
  registerOnly?: boolean
  onAuthenticated?: (logId: string) => void
  onRegistered?: () => void
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
    fetch(`/api/logs/passkey/visitor/exists?sessionToken=${encodeURIComponent(sessionToken)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setHasPasskey(!!d.exists) })
      .catch(() => { if (!cancelled) setHasPasskey(false) })
    return () => { cancelled = true }
  }, [sessionToken])

  const authenticate = useCallback(async () => {
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const idempotencyKey = await buildIdempotencyKey(sessionToken, locationId, action)

      const challengeRes = await fetch('/api/logs/passkey/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, locationType, action, sessionToken, relatedLogId, idempotencyKey }),
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
        body: JSON.stringify({ response, locationId, locationType, action, sessionToken, relatedLogId, idempotencyKey, visitorName }),
      })
      const data = await verifyRes.json()
      if (!verifyRes.ok) throw new Error(data.error ?? 'Verification failed')

      const logId = data.log?._id ?? data.log?.id ?? ''
      if (data.verified || data.existing || data.already || logId) onAuthenticated?.(logId)
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? 'Biometric check-in failed')
    } finally {
      setLoading(false)
    }
  }, [locationId, locationType, action, sessionToken, relatedLogId, visitorName, onAuthenticated])

  const register = useCallback(async () => {
    setLoading(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')
      const payload = { sessionToken, visitorName, ...contactFields(visitorContact), visitorGender, visitPurpose }

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
      onRegistered?.()
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? 'Biometric registration failed')
    } finally {
      setLoading(false)
    }
  }, [sessionToken, visitorName, visitorContact, visitorGender, visitPurpose, onRegistered])

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
      <p className="text-[11px] text-center text-muted-foreground">
        Uses Face ID, Touch ID, or device PIN
      </p>
    </div>
  )
}
