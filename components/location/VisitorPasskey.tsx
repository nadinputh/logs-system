'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Fingerprint } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { buildIdempotencyKey } from '@/lib/idempotency-key'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'
import { usePasskeySupport } from '@/lib/usePasskeySupport'
import { getClientCoordinates } from '@/lib/geolocation'

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
  kioskToken?: string
  // Whether this session already has a passkey registered at this location —
  // the parent already resolves this (checkOpenLog fetches
  // /api/logs/passkey/visitor/exists once for the whole flow), so this
  // component no longer re-fetches the same answer for itself.
  hasPasskey: boolean
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
  deviceId,
  kioskToken,
  hasPasskey,
  authOnly = false,
  registerOnly = false,
  onAuthenticated,
  onRegistered,
}: Props) {
  const t = useTranslations('visitorPasskey')
  const apiError = useApiError()
  const passkeyVerificationMessage = (data: any, act: 'in' | 'out') =>
    data?.code === 'PASSKEY_NOT_REGISTERED'
      ? t(act === 'out' ? 'notRegisteredOut' : 'notRegisteredIn')
      : apiError(data, t('verifyFailed'))

  const supported = usePasskeySupport()
  const [loading, setLoading] = useState(false)

  const authenticate = useCallback(async (): Promise<boolean> => {
    setLoading(true)
    try {
      const { startAuthentication } = await import('@simplewebauthn/browser')
      const idempotencyKey = await buildIdempotencyKey(sessionToken, locationId, action)
      // Checkout doesn't re-validate location, so coordinates are only worth
      // capturing (and asking permission for) on the check-in leg.
      const coords = action === 'in' ? await getClientCoordinates() : null
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
        kioskToken,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      }

      const challengeRes = await fetch('/api/logs/passkey/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(intentPayload),
      })
      if (!challengeRes.ok) {
        const d = await challengeRes.json()
        throw new Error(apiError(d, t('challengeFailed')))
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
      if (!logId) throw new Error(t('noLog'))
      onAuthenticated?.(logId, data.log)
      return true
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? t('authFailed'))
      return false
    } finally {
      setLoading(false)
    }
  }, [locationId, locationType, action, sessionToken, relatedLogId, visitorName, visitorContact, visitorGender, visitPurpose, deviceId, kioskToken, onAuthenticated])

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
        throw new Error(apiError(d, t('regOptionsFailed')))
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
        throw new Error(apiError(d, t('regFailed')))
      }
      if (registerOnly) {
        onRegistered?.()
      } else {
        const success = await authenticate()
        if (success) onRegistered?.()
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') toast.error(err.message ?? t('regAuthFailed'))
    } finally {
      setLoading(false)
    }
  }, [sessionToken, visitorName, visitorContact, visitorGender, visitPurpose, registerOnly, authenticate, onRegistered])

  // supported === null mid-check reads as unsupported here too — nothing to
  // show yet, and the alternative (flashing this control on then off a beat
  // later while the check resolves) is worse than the brief blank moment.
  if (supported !== true) return null
  // registerOnly: hide once a passkey is already saved for this session
  if (registerOnly && hasPasskey) return null

  const useRegister = registerOnly || (!hasPasskey && !authOnly)
  const performAction = useRegister ? register : authenticate
  // Re-entry guard at the interaction boundary, not inside authenticate/
  // register themselves — register() calls authenticate() internally as its
  // own second step, and a guard inside authenticate would silently no-op
  // that call the moment register() sets loading. Guarding the click instead
  // stops a double-tap from starting a second concurrent WebAuthn ceremony
  // (browsers don't reliably reject overlapping navigator.credentials.get()
  // calls) without touching that internal call at all.
  const handleClick = () => {
    if (loading) return
    void performAction()
  }
  const baseLabel = action === 'out' ? t('checkOut') : registerOnly ? t('saveForNext') : t('checkIn')
  const label = loading
    ? (useRegister ? t('saving') : t('verifying'))
    : useRegister
      ? (registerOnly ? baseLabel : t('andSave', { label: baseLabel }))
      : baseLabel

  return (
    <div className="space-y-1.5">
      <Button size="touch" variant="outline" className="w-full" onClick={handleClick} isLoading={loading} loadingBehavior="busy">
        <Fingerprint className="w-4 h-4 mr-2" aria-hidden />
        {label}
      </Button>
      <p className="text-xs text-center text-muted">
        {t('uses')}
      </p>
    </div>
  )
}
