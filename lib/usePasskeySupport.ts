'use client'

import { useEffect, useState } from 'react'

/**
 * Whether this browser has a platform authenticator (Face ID, Touch ID, Windows
 * Hello, a device PIN) available for WebAuthn. `null` while the async check is
 * still in flight, so a caller can tell "still checking" apart from "confirmed
 * unsupported" instead of treating both the same.
 */
export function usePasskeySupport(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setSupported(false)
      return
    }
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      .then(setSupported)
      .catch(() => setSupported(false))
  }, [])

  return supported
}
