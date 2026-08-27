import type { ReactNode } from 'react'
import { AlertCircle, MailCheck, MailWarning } from 'lucide-react'

/**
 * Inline form feedback, in the same shape the scanner uses: a named problem and
 * a recovery, on a semantic status colour rather than a raw Tailwind red.
 *
 * Both auth surfaces previously used `text-red-500` on a `red-500/10` wash —
 * 3.04:1, i.e. the error message on a sign-in form was the least legible text on
 * the page. `--status-danger` clears AA in both themes.
 *
 * Announcement is the caller's job: wrap the slot in one `aria-live` region so
 * the region exists before the notice appears, or a screen reader will not
 * announce it.
 */
export function FormNotice({
  tone,
  title,
  children,
}: {
  tone: 'danger' | 'warning' | 'success'
  title: string
  children?: ReactNode
}) {
  const color =
    tone === 'danger'
      ? 'var(--status-danger)'
      : tone === 'success'
        ? 'var(--status-success)'
        : 'var(--status-warning)'
  const Icon = tone === 'danger' ? AlertCircle : tone === 'success' ? MailCheck : MailWarning
  return (
    <div
      className="animate-notice flex items-start gap-3 rounded-2xl border p-3.5"
      style={{ borderColor: `color-mix(in oklab, ${color} 28%, transparent)`, backgroundColor: `color-mix(in oklab, ${color} 8%, transparent)` }}
    >
      <Icon className="mt-0.5 size-4 shrink-0" strokeWidth={2.3} style={{ color }} />
      <div className="min-w-0 text-sm">
        <p className="font-semibold" style={{ color }}>
          {title}
        </p>
        {children ? <div className="mt-1 text-muted">{children}</div> : null}
      </div>
    </div>
  )
}
