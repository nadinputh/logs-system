import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { PasskeyCredential } from '@/lib/models/PasskeyCredential'
import { User } from '@/lib/models/User'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PasskeyManager from './PasskeyManager'
import { Card, CardContent } from '@/components/ui/card'

export default async function PasskeysSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  await connectDB()
  const userId = (session.user as any).id
  const [user, passkeys] = await Promise.all([
    User.findById(userId).select('name email role createdAt').lean(),
    PasskeyCredential.find({ userId }).select('-publicKey').sort({ createdAt: -1 }).lean(),
  ])

  const u = user as any
  const initials = (u?.name ?? u?.email ?? '?')[0].toUpperCase()

  return (
    <div className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your account security and sign-in methods.
        </p>
      </div>

      {/* Account card */}
      <Card>
        <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-accent to-cyan-600 flex items-center justify-center text-white text-lg font-semibold shadow-sm shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-foreground truncate">{u?.name}</p>
            <p className="text-sm text-muted-foreground truncate">{u?.email}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={
                  u?.role === 'admin'
                    ? 'inline-flex items-center text-[11px] font-medium text-cyan-700 bg-cyan-50 border border-cyan-200/60 px-2 py-0.5 rounded-full'
                    : 'inline-flex items-center text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-full'
                }
              >
                {u?.role === 'admin' ? 'Admin' : 'Staff'}
              </span>
              {u?.createdAt && (
                <span className="text-[11px] text-muted-foreground">
                  Member since {new Date(u.createdAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        </div>
        </CardContent>
      </Card>

      {/* Passkeys card */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="mb-4 flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-foreground text-sm">Passkeys</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use your device biometrics or PIN to verify your identity — no password needed.
              </p>
            </div>
          </div>
          <PasskeyManager initialPasskeys={JSON.parse(JSON.stringify(passkeys))} />
        </CardContent>
      </Card>
    </div>
  )
}
