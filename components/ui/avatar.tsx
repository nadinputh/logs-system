'use client'

import { Avatar as HeroUIAvatar, AvatarFallback as HeroUIAvatarFallback } from '@heroui/react'

/**
 * Avatar adapter: HeroUI's Avatar pulls in client-only internals, so it can't
 * be imported directly into a Server Component (see app/settings/security/page.tsx,
 * which renders the identity card server-side). This 'use client' boundary is
 * the same fix every other components/ui/* adapter already applies.
 *
 * Export `AvatarFallback` by name rather than relying on `Avatar.Fallback` —
 * a compound static property doesn't survive the server/client reference
 * boundary when accessed from a Server Component's JSX (`<Avatar.Fallback>`
 * resolved to undefined there even though the same access works fine from a
 * 'use client' file like NavBar.tsx).
 */
export const Avatar = HeroUIAvatar
export const AvatarFallback = HeroUIAvatarFallback
