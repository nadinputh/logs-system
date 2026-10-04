/** "Safari/17.4 · iPhone" — short, readable UA for display. Not for security decisions. */
export function formatUserAgent(ua: string): string {
  const pick = (re: RegExp) => ua.match(re)?.[1]
  const ver = (v?: string) => (v ? v.split('.').slice(0, 2).join('.') : '')
  const [name, v] =
    (pick(/Edgi?A?\/([\d.]+)/) && ['Edge', pick(/Edgi?A?\/([\d.]+)/)]) ||
    (pick(/(?:Chrome|CriOS)\/([\d.]+)/) && ['Chrome', pick(/(?:Chrome|CriOS)\/([\d.]+)/)]) ||
    (pick(/(?:Firefox|FxiOS)\/([\d.]+)/) && ['Firefox', pick(/(?:Firefox|FxiOS)\/([\d.]+)/)]) ||
    (pick(/Version\/([\d.]+).*Safari/) && ['Safari', pick(/Version\/([\d.]+).*Safari/)]) || ['Browser', '']
  const device =
    /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android'
    : /Macintosh/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  const browser = v ? `${name}/${ver(v)}` : name
  return device ? `${browser} · ${device}` : browser
}
