'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * The icon swap is a state change, so it is shown as one: the outgoing mark
 * rotates and shrinks away while the incoming one arrives. Both glyphs are
 * always mounted and stacked, which is what makes the transition possible —
 * swapping the element instead would only ever snap.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="size-11" aria-hidden />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="press relative flex size-11 items-center justify-center rounded-full border border-border/80 bg-overlay/80 text-muted shadow-sm hover:bg-accent/10 hover:text-accent [&_svg]:text-current"
    >
      <Sun
        className={`absolute size-[18px] transition-[opacity,transform] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-opacity ${
          isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'
        }`}
        strokeWidth={2.2}
      />
      <Moon
        className={`absolute size-[18px] transition-[opacity,transform] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-opacity ${
          isDark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'
        }`}
        strokeWidth={2.2}
      />
    </button>
  )
}
