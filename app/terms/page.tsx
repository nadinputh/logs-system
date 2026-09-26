import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalLayout, Placeholder } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Terms of Use — Kamnotheat',
  description: 'The rules that govern staff and administrator use of the Kamnotheat console.',
}

const LAST_UPDATED = 'September 26, 2026'

const TOC = [
  { id: 'acceptance', label: 'Acceptance & eligibility' },
  { id: 'acceptable-use', label: 'Acceptable use' },
  { id: 'checkin-obligations', label: 'Check-in / check-out' },
  { id: 'data-accuracy', label: 'Data accuracy & corrections' },
  { id: 'account-security', label: 'Account security' },
  { id: 'termination', label: 'Termination & suspension' },
  { id: 'liability', label: 'Disclaimers & liability' },
  { id: 'governing-law', label: 'Governing law' },
  { id: 'changes', label: 'Changes to these terms' },
  { id: 'contact', label: 'Contact us' },
]

export default function TermsOfUsePage() {
  return (
    <LegalLayout title="Terms of Use" lastUpdated={LAST_UPDATED} toc={TOC}>
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted">
        These terms cover staff and administrator accounts on the Kamnotheat console. See the{' '}
        <Link href="/privacy" className="font-medium text-accent hover:underline">
          Privacy Policy
        </Link>{' '}
        for what we collect and why.
      </p>

      <section id="acceptance">
        <h2>Acceptance &amp; eligibility</h2>
        <p>
          An account on this system is created or invited by an administrator at{' '}
          <Placeholder>[Organization Name]</Placeholder> — you cannot self-register a staff or
          administrator account. By signing in, you agree to these terms for as long as your account
          remains active.
        </p>
      </section>

      <section id="acceptable-use">
        <h2>Acceptable use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>
            Check in or out on behalf of someone else, or from a location, device, or reported position
            that does not reflect where you actually are.
          </li>
          <li>Share your password or passkey with anyone else, or attempt to use another person's.</li>
          <li>
            Attempt to bypass, spoof, or interfere with device identification, geofence checks, or the
            write-deduplication system.
          </li>
          <li>
            Use administrative correction powers to alter a record for any reason other than fixing a
            genuine error, with the reason honestly stated.
          </li>
        </ul>
      </section>

      <section id="checkin-obligations">
        <h2>Check-in / check-out obligations</h2>
        <p>
          If you check in, you're expected to check out when you leave. If you don't, the system closes
          the entry automatically after 12 hours and flags it as auto-closed rather than leaving it
          open indefinitely — this is a system safeguard, not a substitute for checking out yourself.
        </p>
      </section>

      <section id="data-accuracy">
        <h2>Data accuracy &amp; corrections</h2>
        <p>
          The check-in ledger is append-only: once written, an entry is never edited or deleted.
          If something was recorded incorrectly, an administrator enters a correction — a new record
          stating what changed and why — rather than altering the original. See the{' '}
          <Link href="/privacy" className="font-medium text-accent hover:underline">
            Privacy Policy
          </Link>{' '}
          for how long records are kept.
        </p>
      </section>

      <section id="account-security">
        <h2>Account security</h2>
        <p>
          You're responsible for keeping your password and any registered passkeys confidential and
          for reporting a lost device or suspected compromise to your administrator right away. You can
          review and revoke active sessions, and remove passkeys, at any time from Settings → Security.
        </p>
      </section>

      <section id="termination">
        <h2>Termination &amp; suspension</h2>
        <p>
          An administrator may suspend or remove your account, including for a violation of the
          acceptable-use terms above. Removing an account does not remove or alter any check-in record
          already written to the ledger.
        </p>
      </section>

      <section id="liability">
        <h2>Disclaimers &amp; limitation of liability</h2>
        <p>
          This system is provided by <Placeholder>[Organization Name]</Placeholder> as an internal
          operational tool, on an "as is" basis, without warranties of any kind. To the fullest extent
          permitted by law, <Placeholder>[Organization Name]</Placeholder> disclaims liability for
          indirect, incidental, or consequential damages arising from its use.{' '}
          <Placeholder>[This section is a standard placeholder shape, not legal advice — have counsel confirm the exact language before publishing.]</Placeholder>
        </p>
      </section>

      <section id="governing-law">
        <h2>Governing law</h2>
        <p>
          These terms are governed by the laws of <Placeholder>[Jurisdiction]</Placeholder>, without
          regard to its conflict-of-laws principles.
        </p>
      </section>

      <section id="changes">
        <h2>Changes to these terms</h2>
        <p>
          If these terms change, we'll update the date at the top of this page. Material changes will
          be announced to staff through the console or by email.
        </p>
      </section>

      <section id="contact">
        <h2>Contact us</h2>
        <p>
          Questions about these terms can be sent to <Placeholder>[privacy contact email]</Placeholder>.
        </p>
      </section>
    </LegalLayout>
  )
}
