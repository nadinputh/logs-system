import type { Metadata } from 'next'
import { Camera, Fingerprint } from 'lucide-react'
import { LegalLayout, Placeholder } from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: 'Privacy Policy — Kamnotheat',
  description: 'What Kamnotheat records at check-in and check-out, why, and for how long.',
}

const LAST_UPDATED = 'September 26, 2026'

const TOC = [
  { id: 'overview', label: 'Overview & scope' },
  { id: 'what-we-collect', label: 'What we collect' },
  { id: 'why-we-collect', label: 'Why we collect it' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'access', label: 'Who can see it' },
  { id: 'rights', label: 'Your rights & choices' },
  { id: 'security', label: 'Security measures' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact us' },
]

/**
 * Every claim below traces to CLAUDE.md's documented architecture — nothing
 * here is boilerplate. Organization identity and contact are the two facts
 * nobody but the deploying org can supply (PRODUCT.md's "never fabricate
 * proof" extended to legal claims); they ship as <Placeholder> until replaced.
 */
export default function PrivacyPolicyPage() {
  return (
    <LegalLayout title="Privacy Policy" lastUpdated={LAST_UPDATED} toc={TOC}>
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted">
        This policy covers staff and administrator accounts on the Kamnotheat console. If you're a
        one-time visitor who just scanned a QR code to check in, see the short notice shown at the
        point of check-in instead — you don't need to read this document.
      </p>

      <section id="overview">
        <h2>Overview &amp; scope</h2>
        <p>
          Kamnotheat is an internal check-in/out logging system operated by{' '}
          <Placeholder>[Organization Name]</Placeholder> ("we," "us," "the organization") for its own
          staff and facilities. It is not sold or offered to the public, and this policy describes
          only how <Placeholder>[Organization Name]</Placeholder> uses Kamnotheat's own data — it does
          not cover any other systems your employer operates.
        </p>
      </section>

      <section id="what-we-collect">
        <h2>What we collect</h2>

        <h3>Account &amp; identity</h3>
        <p>
          Your email address, name, role (Owner, Admin, Manager, Auditor, or Member), and team
          membership. If you sign in with a password, we store a salted hash of it, never the password
          itself. If you use a passkey, see below.
        </p>

        <h3>Every check-in and check-out event</h3>
        <p>
          Each time you check in or out, we record: the action (in or out), a timestamp set by our
          server (never by your device — client clocks are never trusted), the location, a persistent
          device identifier stored in your browser, your IP address, your browser's user-agent string,
          and — where a location has a mapped boundary — whether your reported position fell inside it.
          None of this is optional per-event; it's how every entry in the ledger is written.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Camera className="size-4 text-[var(--accent)]" strokeWidth={2.2} />
            Selfie capture
          </div>
          <p className="mt-2 !mt-2 text-sm">
            Where a location is configured to ask for one, a photo is captured at check-in and
            uploaded directly to our image host (Cloudinary) to confirm who checked in. It is not used
            for any other purpose, and locations that don't request it never capture one.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center gap-2.5 text-sm font-semibold">
            <Fingerprint className="size-4 text-[var(--accent)]" strokeWidth={2.2} />
            Passkeys (WebAuthn / FIDO2)
          </div>
          <p className="mt-2 !mt-2 text-sm">
            If you register a passkey, your device's secure enclave generates the credential — we only
            ever receive and store the public key, a replay-prevention counter, and device metadata
            (type, transports, when it was created and last used). We never receive, and cannot
            reconstruct, any biometric data (fingerprint, face) from your device; that stays on your
            hardware.
          </p>
        </div>

        <h3>Push notifications</h3>
        <p>
          If you opt in to notifications (e.g. from Settings), we store the push subscription your
          browser gives us so we can deliver alerts. You can unsubscribe at any time from the same
          settings page.
        </p>

        <h3>Corrections to the record</h3>
        <p>
          If an administrator corrects a log entry, we record who made the change, which field changed,
          the old and new values, the stated reason, and when it happened — see "How long we keep it"
          below for why this exists as its own separate record.
        </p>
      </section>

      <section id="why-we-collect">
        <h2>Why we collect it</h2>
        <p>
          Attendance and presence records the organization needs to operate and to meet its own
          compliance obligations; anti-spoofing signals (device, IP, geofence) so a check-in can't be
          faked from somewhere else; and safety — knowing who is on-site matters in an emergency.
        </p>
      </section>

      <section id="retention">
        <h2>How long we keep it</h2>
        <p>
          Check-in and check-out records are kept <strong>permanently, by design</strong> — the ledger
          is append-only, which means an entry is never deleted or silently edited once written; a
          correction adds a new record rather than changing the old one. This is what makes the record
          trustworthy as an audit trail, and it means retention isn't a knob we can turn down.
        </p>
        <p>Everything else is far shorter-lived:</p>
        <ul>
          <li>An open check-in with no checkout is automatically closed after 12 hours.</li>
          <li>
            Write deduplication keys (which stop a retried request from double-logging) expire after
            24 hours.
          </li>
          <li>A kiosk display's QR code is valid for 15 seconds before it rotates.</li>
          <li>Your personal QR code (shown on your Profile page) is valid for 30 seconds.</li>
          <li>
            Email links: a verification link expires in 1 hour; a set-password or team-invite link
            expires in 7 days. Every link is single-use and stored only as a cryptographic hash, never
            in plain text.
          </li>
        </ul>
      </section>

      <section id="access">
        <h2>Who can see it</h2>
        <p>
          Staff and Members see their own check-in history. Owners, Admins, Managers, and Auditors can
          see check-in records across the team they belong to, scoped by role. We do not sell your data
          or share it with third parties for advertising. It is shared with the processors this system
          relies on to function: Cloudinary (if selfie capture is enabled, for image storage) and our
          email delivery provider (to send verification, invite, and password-related mail).
        </p>
      </section>

      <section id="rights">
        <h2>Your rights &amp; choices</h2>
        <p>
          Because the ledger is append-only, we can't delete or silently edit a past entry on request —
          but an administrator can enter a correction, which is itself recorded with your name attached
          to the reason, so the record stays honest about what changed and why. To request a correction,
          contact your administrator or use the details below. Selfie capture and push notifications are
          only active where an administrator has turned them on for a given location or where you've
          opted in yourself; passkeys can be removed at any time from Settings → Security.
        </p>
      </section>

      <section id="security">
        <h2>Security measures</h2>
        <p>
          Write deduplication uses a 256-bit SHA-256 key, so a retried request can never create a
          duplicate entry. Server clocks — not client devices — set every timestamp. Passwords are
          salted and hashed; passkeys use your device's secure enclave. All traffic to Kamnotheat is
          encrypted in transit.
        </p>
      </section>

      <section id="changes">
        <h2>Changes to this policy</h2>
        <p>
          If this policy changes, we'll update the date at the top of this page. Material changes will
          be announced to staff through the console or by email.
        </p>
      </section>

      <section id="contact">
        <h2>Contact us</h2>
        <p>
          Questions about this policy or a request about your data can be sent to{' '}
          <Placeholder>[privacy contact email]</Placeholder>.
        </p>
      </section>
    </LegalLayout>
  )
}
