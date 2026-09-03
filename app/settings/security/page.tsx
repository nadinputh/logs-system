import { connectDB } from '@/lib/db'
import { PasskeyCredential } from '@/lib/models/PasskeyCredential'
import { SessionInventory } from '@/lib/models/SessionInventory'
import { User } from '@/lib/models/User'
import { requireSession } from '@/lib/server/requireSession'
import Link from 'next/link'
import PasskeyManager from '@/app/settings/passkeys/PasskeyManager'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SessionsList, type SessionRow } from './SessionsList'
import { ShieldCheck, Fingerprint } from 'lucide-react'

export const metadata = {
  title: 'Account & Security — Kamnotheat',
  description: 'Passkeys and every device signed in on this account, in one place.',
  robots: { index: false },
}

export default async function SecuritySettingsPage() {
  const session = await requireSession('/settings/security')

  const userId = (session.user as any).id as string
  const currentJti = ((session.user as any).sid as string | undefined) ?? null

  await connectDB()
  const [user, passkeys, rows] = await Promise.all([
    User.findById(userId).select('name email role createdAt').lean(),
    PasskeyCredential.find({ userId }).select('-publicKey').sort({ createdAt: -1 }).lean(),
    SessionInventory.find({ userId })
      .select('jti createdAt lastSeenAt ipAddress userAgent provider')
      .sort({ createdAt: -1 })
      .lean(),
  ])

  const u = user as any
  const initials = (u?.name ?? u?.email ?? '?')[0].toUpperCase()

  const initialSessions: SessionRow[] = rows.map((r: any) => ({
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
        <h1 className="text-2xl font-bold text-foreground">Account &amp; Security</h1>
        <p className="text-sm text-muted mt-0.5 max-w-md">
          Your sign-in methods and every device signed in on this account — the same
          ledger Kamnotheat keeps for every check-in, now covering your own account.
        </p>
      </div>

      {/* Identity card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Avatar color="accent" size="lg" variant="soft">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground truncate">{u?.name}</p>
              <p className="text-sm text-muted truncate">{u?.email}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <span
                  className={
                    u?.role === 'admin'
                      ? 'inline-flex items-center text-xs font-medium text-cyan-500 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full'
                      : 'inline-flex items-center text-xs font-medium text-muted bg-default border border-border px-2 py-0.5 rounded-full'
                  }
                >
                  {u?.role === 'admin' ? 'Admin' : 'Staff'}
                </span>
                {u?.createdAt && (
                  <span className="text-xs text-muted">
                    Member since {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Fingerprint className="w-4 h-4 text-sky-500" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Passkeys</h2>
              <p className="text-xs text-muted mt-0.5 max-w-md">
                Use your device biometrics or PIN to verify your identity — no password needed.
              </p>
            </div>
          </div>
          <PasskeyManager initialPasskeys={JSON.parse(JSON.stringify(passkeys))} />
        </CardContent>
      </Card>

      {/* Active sessions */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-accent" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">Active sessions</h2>
              <p className="text-xs text-muted mt-0.5 max-w-md">
                Revoke one row to end that device only. Every session is a JWT stamped
                with a session-inventory row (jti) and the account&apos;s{' '}
                <span className="font-mono text-xs">sessionsVersion</span>; either
                gate can end it.
              </p>
            </div>
          </div>
          <SessionsList initial={initialSessions} />
        </CardContent>
      </Card>
    </div>
  )
}
