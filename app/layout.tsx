import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/sonner'

const inter = localFont({
  src: '../public/fonts/Inter-Variable.woff2',
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Location Manager',
  description: 'QR-based building check-in and quest card system',
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0891b2',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
