/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['bcryptjs', 'node-cron'],
    instrumentationHook: true,
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
}

module.exports = nextConfig
