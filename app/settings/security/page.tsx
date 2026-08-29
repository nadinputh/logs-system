import { connectDB } from '@/lib/db'
import { SessionInventory } from '@/lib/models/SessionInventory'
import { requireSession } from '@/lib/server/requireSession'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { SessionsList, type SessionRow } from './SessionsList'
import { ShieldCheck } from 'lucide-react'

export const metadata = {
  title: 'Security — Kamnotheat',
  description: 'Every device signed in on this account, with per-device revoke.',
  robots: { index: false },
}

export default async function SecuritySettingsPage() {
  const session = await requireSession('/settings/security')

  const userId = (session.user as any).id as string
  const currentJti = ((session.user as any).sid as string | undefined) ?? null

  await connectDB()
  const rows = await SessionInventory.find({ userId })
    .select('jti createdAt lastSeenAt ipAddress userAgent provider')
    .sort({ createdAt: -1 })
    .lean()

  const initial: SessionRow[] = rows.map((r: any) => ({
    id: r._id.toString(),
    jti: r.jti as string,
    createdAt: (r.createdAt as Date).toISOString(),
    lastSeenAt: ((r.lastSeenAt as Date) ?? (r.createdAt as Date)).toISOString(),
    ipAddress: r.ipAddress as string,
    userAgent: r.userAgent as string,
    provider: r.provider as 'credentials' | 'passkey',
    current: currentJti ? r.jti === currentJti : false,
  }))

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted mt-0.5">
          Every device signed in on this account. The ledger that Kamnotheat keeps for
          every check-in — IP, device, when — now runs for your own sessions too.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-accent" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Active sessions</h2>
              <p className="text-xs text-muted mt-0.5">
                Revoke one row to end that device only. Every session is a JWT stamped
                with a session-inventory row (jti) and the account&apos;s{' '}
                <span className="font-mono text-xs">sessionsVersion</span>; either
                gate can end it.
              </p>
            </div>
          </div>
          <SessionsList initial={initial} />
        </CardContent>
      </Card>
    </div>
  )
}
