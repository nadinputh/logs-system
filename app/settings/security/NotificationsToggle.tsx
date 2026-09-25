'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { urlBase64ToUint8Array } from '@/lib/pushClient'

type Status = 'checking' | 'unsupported' | 'off' | 'denied' | 'on'

async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager.getSubscription()) ?? null
}

export default function NotificationsToggle() {
  const [status, setStatus] = useState<Status>('checking')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setStatus('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setStatus('denied')
      return
    }
    getExistingSubscription()
      .then((sub) => setStatus(sub ? 'on' : 'off'))
      .catch(() => setStatus('off'))
  }, [])

  const handleEnable = useCallback(async () => {
    setLoading(true)
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!publicKey) throw new Error('Push notifications are not configured for this deployment')

      const registration = await navigator.serviceWorker.register('/sw.js')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'off')
        return
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's lib.dom typings want ArrayBuffer-backed BufferSource; the
        // runtime value is fine, only the generic parameter is too loose.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const { endpoint, keys } = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, keys }),
      })
      if (!res.ok) throw new Error('Failed to save subscription')

      setStatus('on')
      toast.success('Notifications enabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not enable notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDisable = useCallback(async () => {
    setLoading(true)
    try {
      const subscription = await getExistingSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        const res = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
        if (!res.ok) throw new Error('Failed to remove subscription')
      }
      setStatus('off')
      toast.success('Notifications disabled')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not disable notifications')
    } finally {
      setLoading(false)
    }
  }, [])

  if (status === 'unsupported') {
    return <p className="text-sm text-muted">Not supported in this browser.</p>
  }

  if (status === 'denied') {
    return (
      <p className="text-sm text-muted">
        Blocked — enable notifications for this site in your browser settings to turn this on.
      </p>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-muted">
        {status === 'on' ? "You'll get a push when there's activity to review." : 'Get a push notification instead of checking back here.'}
      </p>
      <Button
        variant={status === 'on' ? 'outline' : 'default'}
        size="sm"
        onPress={status === 'on' ? handleDisable : handleEnable}
        isDisabled={status === 'checking' || loading}
        isLoading={loading}
      >
        {status === 'on' ? 'Disable' : 'Enable'}
      </Button>
    </div>
  )
}
