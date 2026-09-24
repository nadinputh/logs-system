import { smtpConfigured } from '@/lib/email/send'
import { stripeConfigured } from '@/lib/billing/providers/stripe'
import { mockBillingEnabled } from '@/lib/billing/provider'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'missing'

function StatusRow({
  name,
  description,
  status,
  okLabel,
  missingLabel,
}: {
  name: string
  description: string
  status: CheckStatus
  okLabel: string
  missingLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-4 last:border-0">
      <div>
        <p className="font-medium text-foreground">{name}</p>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${
          status === 'ok'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }`}
      >
        <span className={`size-1.5 rounded-full ${status === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
        {status === 'ok' ? okLabel : missingLabel}
      </span>
    </div>
  )
}

export default function PlatformAdminHealthPage() {
  const checks: Array<{ name: string; description: string; status: CheckStatus; okLabel: string; missingLabel: string }> = [
    {
      name: 'SMTP',
      description: 'Verification, set-password, and invite email delivery.',
      status: smtpConfigured() ? 'ok' : 'missing',
      okLabel: 'Configured',
      missingLabel: 'Not configured — console fallback in dev only',
    },
    {
      name: 'Stripe',
      description: 'Checkout, billing portal, and subscription webhooks.',
      status: stripeConfigured() ? 'ok' : 'missing',
      okLabel: 'Configured',
      missingLabel: mockBillingEnabled()
        ? 'Not configured — BILLING_MOCK_MODE bypass is active instead'
        : 'Not configured — billing routes are disabled',
    },
    {
      name: 'Web Push (VAPID)',
      description: 'BLE-beacon check-in prompts and background push notifications.',
      status: process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? 'ok' : 'missing',
      okLabel: 'Configured',
      missingLabel: 'Not configured',
    },
    {
      name: 'Kiosk QR signing',
      description: 'Dynamic QR tokens for the kiosk check-in loop.',
      status: process.env.KIOSK_SECRET ? 'ok' : 'missing',
      okLabel: 'Configured',
      missingLabel: 'Not configured — kiosk mode is disabled',
    },
    {
      name: 'Reverse QR signing',
      description: 'Personal session QR tokens for the terminal scanner loop.',
      status: process.env.SESSION_QR_SECRET ? 'ok' : 'missing',
      okLabel: 'Configured',
      missingLabel: 'Not configured — terminal scan mode is disabled',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">System health</h1>
        <p className="mt-1 text-sm text-muted">
          Which optional integrations are configured in this environment. This reflects environment variables at
          server start, not live connectivity.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel px-5">
        {checks.map((c) => (
          <StatusRow key={c.name} {...c} />
        ))}
      </div>
    </div>
  )
}
