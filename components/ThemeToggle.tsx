'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="size-10" aria-hidden />

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex size-10 items-center justify-center rounded-full border border-border/80 bg-overlay/80 text-muted-foreground shadow-sm outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 [&_svg]:text-current"
    >
      {isDark
        ? <Sun className="size-[18px]" strokeWidth={2.2} />
        : <Moon className="size-[18px]" strokeWidth={2.2} />}
    </button>
  )
}
