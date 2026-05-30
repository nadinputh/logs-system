/** @type {import('next').NextConfig} */
const appPort = process.env.PORT || '4000'
const appUrl = process.env.NEXTAUTH_URL || `http://localhost:${appPort}`

const nextConfig = {
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
  serverExternalPackages: ['mongoose'],
}

export default nextConfig
