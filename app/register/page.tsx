import type { Metadata } from 'next'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { RegisterForm } from './RegisterForm'

export const metadata: Metadata = {
  title: 'Create a workspace — Kamnotheat',
  description: 'Start a new Kamnotheat team and become its owner.',
  robots: { index: false },
}

export default function RegisterPage() {
  return (
    <AuthLayout
      headline={
        <>
          One ledger for
          <br />
          <span className="gradient-text">everyone who walks in.</span>
        </>
      }
      subhead="Create a team, model your buildings and rooms, and start recording entries that cannot be quietly rewritten."
    >
      <RegisterForm />
    </AuthLayout>
  )
}
