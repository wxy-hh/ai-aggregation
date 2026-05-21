import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@repo/shared', '@repo/providers', '@repo/storage', '@repo/logger'],
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // 配置 webpack 不要在客户端打包 Node.js 专用模块
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // 客户端构建时,将这些 Node.js 模块标记为 external
      config.resolve.fallback = {
        ...config.resolve.fallback,
        dns: false,
        net: false,
        tls: false,
        fs: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
