import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resetTransport,
  sendInviteEmail,
  sendSetPasswordEmail,
  sendVerificationEmail,
} from '@/lib/email/send'

const LINK = 'https://kamnotheat.example/set-password/ac16447a-527f-4272-86aa-7ac280345753'

/** Captures what the module handed to the transport, without a real SMTP server. */
function stubTransport() {
  const sent: Array<Record<string, any>> = []
  ;(globalThis as any)._mailer = {
    sendMail: async (opts: Record<string, unknown>) => {
      sent.push(opts)
      return { accepted: [opts.to] }
    },
  }
  process.env.SMTP_HOST = 'smtp.test'
  process.env.SMTP_USER = 'user'
  process.env.SMTP_PASS = 'pass'
  return sent
}

function unconfigure() {
  delete process.env.SMTP_HOST
  delete process.env.SMTP_USER
  delete process.env.SMTP_PASS
  resetTransport()
}

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  resetTransport()
})

afterEach(() => {
  vi.restoreAllMocks()
  process.env = { ...ORIGINAL_ENV }
  resetTransport()
})

describe('SMTP configuration is all-or-nothing', () => {
  it('does not send when only SMTP_HOST is set', async () => {
    unconfigure()
    process.env.SMTP_HOST = 'smtp.test'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await sendVerificationEmail('a@b.test', LINK)).toBe(false)
  })

  it('does not send when the password is missing', async () => {
    unconfigure()
    process.env.SMTP_HOST = 'smtp.test'
    process.env.SMTP_USER = 'user'
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await sendVerificationEmail('a@b.test', LINK)).toBe(false)
  })

  it('sends once all three are set', async () => {
    const sent = stubTransport()
    expect(await sendVerificationEmail('a@b.test', LINK)).toBe(true)
    expect(sent).toHaveLength(1)
  })
})

describe('the fallback never leaks a bearer token in production', () => {
  it('prints the link in development, where the console is the developer', async () => {
    unconfigure()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'development')
    expect(await sendVerificationEmail('a@b.test', LINK)).toBe(false)
    expect(log.mock.calls.flat().join('\n')).toContain(LINK)
    vi.unstubAllEnvs()
  })

  it('never prints the link in production, and reports the real cause', async () => {
    unconfigure()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubEnv('NODE_ENV', 'production')

    expect(await sendVerificationEmail('a@b.test', LINK)).toBe(false)

    const everything = [...log.mock.calls, ...err.mock.calls].flat().join('\n')
    // The whole point: these links are account-takeover credentials and
    // lib/verification.ts hashes them at rest so no log ever holds one.
    expect(everything).not.toContain(LINK)
    expect(everything).not.toContain('ac16447a')
    const errors = err.mock.calls.flat().join('\n')
    expect(errors).toContain('SMTP_HOST')
    expect(errors).toContain('SMTP_USER')
    expect(errors).toContain('SMTP_PASS')
    vi.unstubAllEnvs()
  })

  it('never prints the link when NODE_ENV is test or unset', async () => {
    // The gate used to be `!== "production"`, which printed the token under
    // NODE_ENV=test and — the case that matters — whenever NODE_ENV is unset:
    // the default for any process importing this module outside Next.
    for (const env of ['test', undefined]) {
      unconfigure()
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      if (env) vi.stubEnv('NODE_ENV', env)
      else vi.stubEnv('NODE_ENV', '')

      expect(await sendVerificationEmail('a@b.test', LINK)).toBe(false)

      const everything = [...log.mock.calls, ...err.mock.calls].flat().join('\n')
      expect(everything).not.toContain(LINK)
      expect(everything).not.toContain('ac16447a')
      vi.unstubAllEnvs()
      vi.restoreAllMocks()
    }
  })
})

describe('the rendered message carries what a mail client needs', () => {
  it('implements the dark mode its color-scheme meta claims to support', async () => {
    const sent = stubTransport()
    await sendVerificationEmail('a@b.test', LINK)
    const html = sent[0].html as string
    // Declaring color-scheme without implementing it is worse than declaring
    // nothing: Apple Mail suppresses auto-inversion and leaves a white card.
    expect(html).toContain('name="color-scheme"')
    expect(html).toContain('prefers-color-scheme: dark')
    expect(html).toContain('#0f0f1e !important')
  })

  it('carries the legacy word-wrap alias Outlook understands', async () => {
    const sent = stubTransport()
    await sendInviteEmail('a@b.test', LINK, { teamName: 'A'.repeat(200), role: 'member' })
    // Outlook's Word engine reads word-wrap, not overflow-wrap.
    expect(sent[0].html as string).toContain('word-wrap:break-word')
  })

  it('ships a real head, a preheader and an explicit heading colour', async () => {
    const sent = stubTransport()
    await sendVerificationEmail('a@b.test', LINK)
    const html = sent[0].html as string

    expect(html).toContain('<html lang="en"')
    expect(html).toContain('charset="utf-8"')
    expect(html).toContain('name="viewport"')
    // Without color-scheme AND an explicit heading colour, Gmail on iOS keeps
    // the card's white background and remaps inherited text to white.
    expect(html).toContain('name="color-scheme"')
    expect(html).toMatch(/<h1[^>]*color:#0f0f1e/)
    expect(html).toMatch(/<h1[^>]*font-weight:800/)
    expect(html).toContain('role="presentation"')
    expect(html).toContain('min-height:48px')
  })

  it('makes the fallback URL a link, not unreachable grey text', async () => {
    const sent = stubTransport()
    await sendVerificationEmail('a@b.test', LINK)
    const html = sent[0].html as string
    // 2.56:1 bare text was both unclickable and below any contrast floor.
    expect(html).not.toContain('#94a3b8')
    expect(html).toContain('#57575e')
    const anchors = html.match(/<a /g) ?? []
    expect(anchors.length).toBeGreaterThanOrEqual(2)
  })

  it('tells the recipient what to do if they were not expecting it', async () => {
    const sent = stubTransport()
    await sendVerificationEmail('a@b.test', LINK)
    // The apostrophe is entity-escaped in the HTML part and literal in the
    // text part, so assert on the clause that has neither.
    for (const field of ['html', 'text']) {
      expect(sent[0][field] as string).toContain(
        'expecting this, you can ignore this email',
      )
    }
  })
})

describe('untrusted values cannot break out of the markup or the headers', () => {
  const HOSTILE = `Acme" onmouseover="alert(1)" x="<img src=x onerror=alert(2)><b>BOLD</b> & 'quoted'`

  it('neutralises a hostile team name in the body', async () => {
    const sent = stubTransport()
    await sendInviteEmail('a@b.test', LINK, {
      teamName: HOSTILE,
      role: 'manager',
      expiresAt: new Date('2026-09-03T00:00:00Z'),
    })
    const html = sent[0].html as string
    expect(html).not.toContain('onmouseover="alert(1)"')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>BOLD</b>')
    expect(html).toContain('&lt;img')
  })

  it('strips CRLF from the subject so a team name cannot forge a header', async () => {
    const sent = stubTransport()
    await sendInviteEmail('a@b.test', LINK, {
      teamName: 'Acme\r\nBcc: attacker@evil.test',
      role: 'member',
    })
    const subject = sent[0].subject as string
    expect(subject).not.toMatch(/[\r\n]/)
    expect(subject).toContain('Bcc: attacker@evil.test')
  })

  it('marks user-supplied names dir="auto" so RTL text is not forced LTR', async () => {
    const sent = stubTransport()
    await sendInviteEmail('a@b.test', LINK, { teamName: 'قسم الأمن', role: 'auditor' })
    expect(sent[0].html as string).toContain('dir="auto"')
  })
})

describe('the copy states what the code actually does', () => {
  it('gives the invite a real date instead of "expires soon"', async () => {
    const sent = stubTransport()
    await sendInviteEmail('a@b.test', LINK, {
      teamName: 'Acme HQ',
      role: 'auditor',
      invitedByName: 'Priya Raman',
      expiresAt: new Date('2026-09-03T09:00:00Z'),
    })
    const html = sent[0].html as string
    expect(html).not.toContain('expires soon')
    expect(html).toContain('Thursday 3 September')
    // The actor is the fact a recipient needs to judge legitimacy.
    expect(html).toContain('Priya Raman')
    // The raw enum told the recipient nothing about what they were accepting.
    expect(html).toContain('read-only access to logs and reports')
  })

  it('names who created an admin-provisioned account', async () => {
    const sent = stubTransport()
    await sendSetPasswordEmail('a@b.test', LINK, {
      teamName: 'Acme HQ',
      invitedByName: 'Priya Raman',
      expiresAt: new Date('2026-09-03T09:00:00Z'),
    })
    expect(sent[0].html as string).toContain('Priya Raman')
    expect(sent[0].text as string).toContain('Priya Raman')
    expect(sent[0].html as string).toContain('Thursday 3 September')
  })

  it('leads every subject with the brand so truncation cannot hide it', async () => {
    const sent = stubTransport()
    await sendVerificationEmail('a@b.test', LINK)
    await sendSetPasswordEmail('a@b.test', LINK)
    await sendInviteEmail('a@b.test', LINK, { teamName: 'A'.repeat(100), role: 'member' })
    for (const msg of sent) {
      expect((msg.subject as string).startsWith('Kamnotheat')).toBe(true)
    }
  })
})
