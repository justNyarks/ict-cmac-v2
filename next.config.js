/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.0.127'],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        '192.168.0.127:3000',
        'localhost:3001',
        '127.0.0.1:3001',
        '192.168.0.127:3001',
      ],
    },
  },
}

module.exports = nextConfig
// trigger restart
