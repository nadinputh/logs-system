'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Fingerprint } from 'lucide-react'
import { toast } from '@/components/ui/sonner'

interface VisitorPasskeyRegisterProps {
  sessionToken: string
  visitorName?: string
  visitorContact?: string
  visitorGender?: string
  visitPurpose?: string
  label?: string
  onSuccess: () => void
}

export default function VisitorPasskeyRegister({
  sessionToken,
  visitorName,
  visitorContact,
  visitorGender,
  visitPurpose,
  label = 'Save Face ID · Touch ID for check-out',
  onSuccess,
}: VisitorPasskeyRegisterProps) {
  const [supported, setSupported] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  // Split raw contact string into email or phone for the API
  function contactFields() {
    if (!visitorContact) return {}
    return visitorContact.includes('@')
      ? { visitorEmail: visitorContact }
      : { visitorPhone: visitorContact }
  }

  const handleRegister = useCallback(async () => {
    setLoading(true)
    try {
      const { startRegistration } = await import('@simplewebauthn/browser')

      const optionsRes = await fetch('/api/logs/passkey/visitor/register/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          visitorName,
          ...contactFields(),
          visitorGender,
          visitPurpose,
        }),
      })

      if (!optionsRes.ok) {
        const data = await optionsRes.json()
        throw new Error(data.error ?? 'Failed to get registration options')
      }

      const options = await optionsRes.json()
      const response = await startRegistration({ optionsJSON: options })

      const verifyRes = await fetch('/api/logs/passkey/visitor/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response,
          sessionToken,
          visitorName,
          ...contactFields(),
          visitorGender,
          visitPurpose,
        }),
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error ?? 'Registration failed')
      }

      onSuccess()
    } catch (err: any) {
      // NotAllowedError = user cancelled — silent dismiss
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? 'Biometric registration failed')
      }
    } finally {
      setLoading(false)
    }
  }, [sessionToken, visitorName, visitorContact, visitorGender, visitPurpose, onSuccess])

  if (!supported) return null

  return (
    <Button
      variant="outline"
      className="w-full"
      onClick={handleRegister}
      disabled={loading}
    >
      <Fingerprint className="w-4 h-4 mr-2" />
      {loading ? 'Registering…' : label}
    </Button>
  )
}
