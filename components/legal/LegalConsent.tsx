import Link from 'next/link'
import { useTranslations } from 'next-intl'

type Action = 'register' | 'setPassword' | 'invite'

/**
 * Contract notice at the moment an account is created. The Terms say "by creating
 * an account you agree", which only holds if the sentence is in front of the
 * person doing it. Links open in a new tab so a half-filled form survives the read.
 */
export function LegalConsent({ action }: { action: Action }) {
  const t = useTranslations('common')
  const link = (href: string) => (chunks: React.ReactNode) => (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent hover:underline"
    >
      {chunks}
    </Link>
  )
  return (
    <p className="text-xs leading-relaxed text-muted">
      {t.rich('consent', {
        action: t(`consentAction.${action}`),
        terms: link('/terms'),
        privacy: link('/privacy'),
      })}
    </p>
  )
}
