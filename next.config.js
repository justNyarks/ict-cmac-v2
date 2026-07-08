const os = require('os')

const DEFAULT_ALLOWED_ORIGINS = [
  'localhost:3000',
  '127.0.0.1:3000',
  '192.168.0.127:3000',
  'localhost:3001',
  '127.0.0.1:3001',
  '192.168.0.127:3001',
]

function normalizeAllowedOrigin(value) {
  if (!value) {
    return null
  }

  try {
    const url = value.includes('://') ? new URL(value) : new URL(`http://${value}`)
    return url.port ? `${url.hostname}:${url.port}` : url.hostname
  } catch {
    return null
  }
}

function getLocalNetworkOrigins() {
  const interfaces = os.networkInterfaces()
  const ports = ['3000', '3001']
  const origins = []

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== 'IPv4' || address.internal) {
        continue
      }

      for (const port of ports) {
        origins.push(`${address.address}:${port}`)
      }
    }
  }

  return origins
}

function getAllowedOrigins() {
  const envOrigins = (process.env.SERVER_ACTION_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const configuredOrigins = [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...getLocalNetworkOrigins(),
    process.env.NEXTAUTH_URL,
    ...envOrigins,
  ]
    .map(normalizeAllowedOrigin)
    .filter(Boolean)

  return [...new Set(configuredOrigins)]
}

const allowedOrigins = getAllowedOrigins()
const allowedDevOrigins = [...new Set(allowedOrigins.map(origin => origin.split(':')[0]))]
const isProduction = process.env.NODE_ENV === 'production'
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'" + (isProduction ? '' : " 'unsafe-eval'"),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'" + (isProduction ? '' : ' ws: wss:'),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  isProduction ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
      {
        source: '/uploads/pmac/:path*',
        headers: [
          {
            key: 'Content-Disposition',
            value: 'attachment',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
}

module.exports = nextConfig
