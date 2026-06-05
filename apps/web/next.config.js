/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/uploads/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3001',
        pathname: '/styles/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-hk.51sux.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-ali-hk.51sux.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-video.51sux.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'v3b.fal.media',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.fal.media',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'ipo-1256346107.cos.ap-guangzhou.myqcloud.com',
        pathname: '/**',
      },
    ],
    // Allow common image sizes including 240
    deviceSizes: [240, 320, 480, 640, 768, 1024, 1280, 1536],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

module.exports = nextConfig;