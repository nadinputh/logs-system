import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { LoginForm } from './LoginForm'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Sign-in. A server component so the frame, the headline and the trust anchors
 * paint from HTML; only the form itself is a client island.
 *
 * `useSearchParams` (for `?next=`) must sit inside a Suspense boundary or Next
 * bails the whole route out of static rendering — and errors during `next build`.
 */

export const metadata: Metadata = {
  title: 'Sign in — Kamnotheat',
  description: 'Staff and admin access to the Kamnotheat console.',
  robots: { index: false },
}

// Only ever redirect within the app — an absolute or protocol-relative `next`
// would turn an already-authenticated visit into an open redirect.
function safeNext(next: string | undefined): string {
  if (next && next.startsWith('/') && !next.startsWith('//')) return next
  return '/dashboard'
}

function FormSkeleton() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="space-y-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full rounded-full" />
      </div>
    </div>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (session) {
    const { next } = await searchParams
    redirect(safeNext(next))
  }

  return (
    <AuthLayout
      headline={
        <>
          Zero-friction check-ins.
          <br />
          <span className="gradient-text">Cryptographic certainty.</span>
        </>
      }
      subhead="Sign in to manage locations, audit the ledger, and invite your team."
    >
      <Suspense fallback={<FormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
