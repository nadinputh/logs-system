'use client'

import { useTheme } from 'next-themes'
import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMounted } from '@/lib/useMounted'

/**
 * The icon swap is a state change, so it is shown as one — but as a keyframe
 * animation, not a CSS transition. The provider runs with
 * `disableTransitionOnChange`, which injects `transition: none !important`
 * everywhere for a tick on every theme change; that cancels any transition
 * (so the old rotate/scale swap never played) and leaves animations alone. It
 * only runs after a click, so the first paint is still static.
 */
export function ThemeToggle() {
  const t = useTranslations('common')
  const { resolvedTheme, systemTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const [swapped, setSwapped] = useState(false)

  if (!mounted) return <div className="size-11" aria-hidden />

  const isDark = resolvedTheme === 'dark'
  const Icon = isDark ? Sun : Moon

  return (
    <button
      type="button"
      onClick={() => {
        const next = isDark ? 'light' : 'dark'
        // Landing back on the OS theme hands control back to it, so a manual
        // choice is not a permanent opt-out from following the system.
        setTheme(next === systemTheme ? 'system' : next)
        setSwapped(true)
      }}
      aria-label={isDark ? t('themeToLight') : t('themeToDark')}
      className="press relative flex size-11 items-center justify-center rounded-full border border-border/80 bg-overlay/80 text-muted shadow-sm hover:bg-accent/10 hover:text-accent [&_svg]:text-current"
    >
      <Icon
        key={isDark ? 'sun' : 'moon'}
        className={`size-[18px] ${swapped ? 'animate-icon-swap' : ''}`}
        strokeWidth={2.2}
      />
    </button>
  )
}
