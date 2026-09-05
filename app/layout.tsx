import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Noto_Sans_Khmer } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  variable: '--font-sans',
  display: 'swap',
})

// Inter has no Khmer glyphs, so Khmer text would otherwise fall back to the
// platform's default (inconsistent weight/metrics across OSes and often
// missing subscript consonant shaping). Loaded unconditionally rather than
// only under the Khmer locale — the two-locale toggle here is cookie-based
// with no route split, so there's no per-locale bundle to defer this into.
const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ['khmer'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-khmer',
  display: 'swap',
})

// Geist Mono is reserved for data that must line up or be read character by
// character — hashes, ids, timestamps. Never as a "technical" costume.
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Kamnotheat',
  description: 'Secure check-in logging — passkeys, QR, and an immutable audit ledger',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0891b2',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${notoSansKhmer.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
