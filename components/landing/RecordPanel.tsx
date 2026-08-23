import { Lock, ShieldCheck } from 'lucide-react'

/**
 * RecordPanel — the anatomy of one check-in, as the ledger actually stores it.
 *
 * This is the landing page's central argument: rather than *claiming* the record
 * is tamper-evident, it shows the fields that make it so — server-set time, the
 * anti-spoofing triple (device / ip / geofence), the sha-256 idempotency key,
 * and the note that corrections append rather than overwrite.
 *
 * It is a labelled schema illustration, not a live feed: PRODUCT.md forbids
 * fabricating usage or adoption, so the values are generic and the panel says
 * so in its own footnote.
 *
 * Deliberately a server component. The only motion is a CSS sweep, so this
 * whole artifact costs zero client JS.
 */

type Field = {
  label: string
  value: string
  note?: string
  mono?: boolean
}

const fields: Field[] = [
  { label: 'action', value: 'in' },
  {
    label: 'timestamp',
    value: '2026-08-22T09:14:07.318Z',
    note: 'server clock',
    mono: true,
  },
  { label: 'location', value: 'Atrium · Floor 2 · Room 214' },
  { label: 'device_id', value: '7f3a1c04-9c21', mono: true },
  { label: 'ip_address', value: '10.24.6.118', mono: true },
  { label: 'geofence_status', value: 'inside', note: 'verified against polygon' },
  { label: 'passkey_verified', value: 'true', note: 'secure enclave' },
  {
    label: 'idempotency_key',
    value: 'sha256 a41f…c7d2',
    note: '24h TTL',
    mono: true,
  },
]

export function RecordPanel() {
  return (
    <figure className="glass shadow-signal relative isolate overflow-hidden rounded-3xl">
      {/* The focal moment: the write path, performed once. Rows land, the sweep
          crosses as the sealing pass, then the chip locks behind it. Pure CSS,
          so it cannot strand the panel invisible if scripts fail. */}
      <div
        aria-hidden
        className="animate-seal-sweep pointer-events-none absolute inset-y-0 -left-1/3 z-10 w-1/3 bg-gradient-to-r from-transparent via-[var(--accent)]/14 to-transparent"
      />

      <figcaption className="flex items-center justify-between gap-4 border-b border-[var(--panel-border)] px-6 py-4 sm:px-7">
        <span className="text-sm font-semibold tracking-tight">One record, sealed</span>
        {/* Lands after the sweep has passed — the seal is its consequence. */}
        <span className="animate-seal-lock inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
          <Lock className="size-3" strokeWidth={2.5} />
          Append-only
        </span>
      </figcaption>

      <dl className="divide-y divide-[var(--panel-border)]">
        {fields.map(({ label, value, note, mono }, i) => (
          <div
            key={label}
            // A record is a list, so a sibling stagger is honest here. Capped at
            // ~0.24s total so the panel is never something you wait through.
            style={{ animationDelay: `${i * 0.03}s` }}
            className="animate-record-row grid gap-x-4 gap-y-1 px-6 py-3 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-baseline sm:px-7"
          >
            <dt className="font-data text-xs uppercase tracking-[0.1em] text-muted">
              {label}
            </dt>
            <dd
              className={`min-w-0 text-sm ${mono ? 'font-data' : 'font-medium'} truncate text-foreground`}
            >
              {value}
              {note ? (
                <span className="ml-2 font-sans text-xs font-normal normal-case text-muted">
                  {note}
                </span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="space-y-3 border-t border-[var(--panel-border)] px-6 py-5 sm:px-7">
        <p className="flex items-start gap-2.5 text-sm text-muted">
          <ShieldCheck
            className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
            strokeWidth={2.3}
          />
          <span>
            This row is never rewritten. Check-out appends a second record; an admin
            correction writes to a separate ledger and leaves this one intact.
          </span>
        </p>
        <p className="text-xs text-muted">
          Example record — field names and capture rules are the ones the engine uses.
        </p>
      </div>
    </figure>
  )
}
