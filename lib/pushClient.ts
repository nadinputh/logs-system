// The standard base64url -> Uint8Array conversion pushManager.subscribe()
// needs for applicationServerKey (it won't accept a raw base64 string).
export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
