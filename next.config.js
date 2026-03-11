/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs', 'node-cron'],
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
}

module.exports = nextConfig
