import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

/** @type {import('next').NextConfig} */
const appPort = process.env.PORT || '4000'
const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${appPort}`

const nextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  env: {
    NEXT_PUBLIC_APP_PORT: appPort,
    NEXT_PUBLIC_APP_URL: appUrl,
  },
  experimental: {
    devtoolSegmentExplorer: false,
  },
  // @font-face in the transactional emails (lib/email/send.ts) points here.
  // A mail client renders that HTML from its own internal origin, never this
  // app's, so the request is always cross-origin and browsers apply CORS to
  // cross-origin font fetches; without this header the file 200s over the
  // wire but the font is rejected and silently falls back, exactly like a
  // missing file would. Fonts carry no per-user data, so `*` is the same
  // trade every public font CDN (Google Fonts included) already makes.
  async headers() {
    return [
      // ponytail: frame-ancestors only. A script-src CSP needs per-request
      // nonces for Next's inline scripts; add via middleware when wanted.
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          // Camera is the in-app QR scanner; geolocation is the geofence check.
          { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ],
      },
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Access-Control-Allow-Origin', value: '*' }],
      },
    ]
  },
  // Both are node-only server packages that must not be bundled. nodemailer
  // additionally must stay external so a missing or broken mail dependency is a
  // runtime error inside the send path — catchable by the caller — rather than
  // a build-time resolution failure that takes down every route importing
  // lib/email/send.ts before it can even validate its request.
  serverExternalPackages: ['mongoose', 'nodemailer'],
}

export default withNextIntl(nextConfig)
