'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Fingerprint } from 'lucide-react'
import { toast } from 'sonner'

interface PasskeyCheckInProps {
  locationId: string
  locationType: string
  action: 'in' | 'out'
  sessionToken: string
  relatedLogId?: string
  visitorName?: string
  onSuccess: (logId: string) => void
}

// Deterministic idempotency key — same algorithm as lib/idempotency.ts:buildIdempotencyKey
// sha256(sessionToken:locationId:YYYY-MM-DD:action)
async function buildIdempotencyKey(sessionToken: string, locationId: string, action: string): Promise<string> {
  const date = new Date().toISOString().slice(0, 10)
  const raw = `${sessionToken}:${locationId}:${date}:${action}`
  const data = new TextEncoder().encode(raw)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export default function PasskeyCheckIn({
  locationId,
  locationType,
  action,
  sessionToken,
  relatedLogId,
  visitorName,
  onSuccess,
}: PasskeyCheckInProps) {
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  const handlePasskeyCheckIn = useCallback(async () => {
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')

      const idempotencyKey = await buildIdempotencyKey(sessionToken, locationId, action)

      // Step 1: Request a challenge bound to this exact check-in intent
      const challengeRes = await fetch('/api/logs/passkey/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId,
          locationType,
          action,
          sessionToken,
          relatedLogId,
          idempotencyKey,
        }),
      })

      if (!challengeRes.ok) {
        const data = await challengeRes.json()
        throw new Error(data.error ?? 'Failed to get challenge')
      }

      const options = await challengeRes.json()

      // Step 2: Trigger Face ID / Touch ID — OS picks the right passkey automatically
      const response = await startAuthentication({ optionsJSON: options })

      // Step 3: Submit signed assertion — server verifies and writes the immutable log
      const verifyRes = await fetch('/api/logs/passkey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response,
          locationId,
          locationType,
          action,
          sessionToken,
          relatedLogId,
          idempotencyKey,
          visitorName,
        }),
      })

      const verifyData = await verifyRes.json()

      if (!verifyRes.ok) {
        throw new Error(verifyData.error ?? 'Verification failed')
      }

      // Call onSuccess for any recognised success shape
      const logId = verifyData.log?._id ?? verifyData.log?.id ?? ''
      if (verifyData.verified || verifyData.existing || verifyData.already || logId) {
        onSuccess(logId)
      }
    } catch (err: any) {
      // NotAllowedError = user cancelled the biometric prompt — silent dismiss
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? 'Biometric check-in failed')
      }
    } finally {
      setLoading(false)
    }
  }, [locationId, locationType, action, sessionToken, relatedLogId, visitorName, onSuccess])

  if (!supported) return null

  const label =
    action === 'in'
      ? loading ? 'Verifying…' : 'Check In with Face ID · Touch ID'
      : loading ? 'Verifying…' : 'Check Out with Face ID · Touch ID'

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={handlePasskeyCheckIn}
      disabled={loading}
    >
      <Fingerprint className="w-4 h-4 mr-2" />
      {label}
    </Button>
  )
}
