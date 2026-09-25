// Best-effort only — denial, timeout, or an unsupported browser all resolve
// to null rather than reject, so check-in never blocks on location. The
// server treats missing coordinates as "not evaluated", not a failed match.
export function getClientCoordinates(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 60_000 },
    )
  })
}
