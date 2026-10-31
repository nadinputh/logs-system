import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Noto_Sans_Khmer } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import { headers } from 'next/headers'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

const publicSans = localFont({
  src: '../public/fonts/PublicSans-Variable.woff2',
  variable: '--font-sans',
  display: 'swap',
})

// Public Sans has no Khmer glyphs, so Khmer text would otherwise fall back to
// the platform's default (inconsistent weight/metrics across OSes and often
// missing subscript consonant shaping). next/font still generates this at
// build time regardless of locale (the loader call itself can't be
// conditional), but applying `.variable` to <html> only under the km locale
// (on <body>, below) means English-only sessions never get the preload link or the
// font-face request — the audit's P2 finding on shipping four unused weights.
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: 'Kamnotheat',
    description: t('description'),
    manifest: '/manifest.json',
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Follows the OS scheme; the browser reads this before any script runs, so it
  // cannot track the in-app toggle.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0891b2' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f1e' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const messages = await getMessages()
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html
      lang={locale}
      className={`${publicSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      {/* The locale-dependent font class lives on <body>, never <html>: next-themes
          adds `dark` to <html> from outside React, so a className that changes with
          the locale makes React rewrite the attribute on the post-switch render and
          wipes `dark` until the next reload. */}
      <body className={`font-sans antialiased bg-background text-foreground ${locale === 'km' ? notoSansKhmer.variable : ''}`}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <Providers nonce={nonce}>
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
