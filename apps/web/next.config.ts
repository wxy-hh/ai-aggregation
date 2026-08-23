import type { NextConfig } from 'next';
// 该包无官方类型定义，构建期仅作为 webpack 插件使用
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error 缺少类型声明
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

// 构建时间：年月日时分格式（北京时间），用于控制台输出判断更新是否成功
const BUILD_TIME = new Date().toLocaleString('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Shanghai',
});

const nextConfig: NextConfig = {
  // 构建时间环境变量，客户端可通过 process.env.BUILD_TIME 访问
  env: {
    BUILD_TIME,
  },
  // Docker 部署时使用 standalone 输出，大幅减小产物体积
  output: 'standalone',
  transpilePackages: ['@repo/shared', '@repo/providers', '@repo/storage', '@repo/logger'],
  // 避免 Next 打包 Prisma，确保 Query Engine 原生二进制在 Vercel 运行时可用
  serverExternalPackages: ['@prisma/client', 'prisma'],
  // monorepo + pnpm 下把 Prisma 引擎二进制纳入 Vercel 文件追踪
  outputFileTracingIncludes: {
    '/**': [
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/**/*',
      '../../node_modules/.pnpm/@prisma+client@*/node_modules/@prisma/client/**/*',
      '../../node_modules/.prisma/client/**/*',
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  // 配置 webpack 不要在客户端打包 Node.js 专用模块
  webpack: (config, { isServer }) => {
    if (isServer) {
      // monorepo 场景下复制 Prisma Query Engine 到服务端产物
      config.plugins = [...(config.plugins || []), new PrismaPlugin()];
    }
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
