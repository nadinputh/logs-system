import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @type {import('next').NextConfig} */
const appPort = process.env.PORT || '4000'
const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${appPort}`

const nextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  env: {
    NEXT_PUBLIC_APP_PORT: appPort,
    NEXT_PUBLIC_APP_URL: appUrl,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
    ],
  },
  experimental: {
    devtoolSegmentExplorer: false,
  },
  // Both are node-only server packages that must not be bundled. nodemailer
  // additionally must stay external so a missing or broken mail dependency is a
  // runtime error inside the send path — catchable by the caller — rather than
  // a build-time resolution failure that takes down every route importing
  // lib/email/send.ts before it can even validate its request.
  serverExternalPackages: ['mongoose', 'nodemailer'],
}

export default nextConfig
