self.addEventListener('push', (event) => {
  if (!event.data) return

  let data = {}
  try {
    data = event.data.json()
  } catch {
    data = { title: 'Notification', message: event.data.text(), url: '/' }
  }

  const { title, message, url } = data

  event.waitUntil(
    self.registration.showNotification(title || 'Check-In System', {
      body: message,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url || '/' },
      actions: [
        { action: 'open', title: 'Open' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') return

  // The payload is server-signed, but the worker is the last stop before
  // openWindow: never navigate off-origin whatever the payload says.
  const target = new URL(event.notification.data?.url || '/', self.location.origin)
  const url = target.origin === self.location.origin ? target.href : self.location.origin + '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
