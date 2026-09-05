import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { getTranslations } from 'next-intl/server'
import { authOptions } from '@/lib/auth'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { RegisterForm } from './RegisterForm'

export const metadata: Metadata = {
  title: 'Create a workspace — Kamnotheat',
  description: 'Start a new Kamnotheat team and become its owner.',
  robots: { index: false },
}

export default async function RegisterPage() {
  // Registering while signed in mints a wholly separate account — it does not
  // add a workspace to the current user — so an authenticated visitor here is
  // steered back to their existing dashboard instead of an orphaned account.
  const session = await getServerSession(authOptions)
  if (session) redirect('/dashboard')

  const t = await getTranslations('register')

  return (
    <AuthLayout
      headline={
        <>
          {t('headlineLine1')}
          <br />
          <span className="gradient-text">{t('headlineLine2')}</span>
        </>
      }
      subhead={t('authSubhead')}
    >
      <RegisterForm />
    </AuthLayout>
  )
}
