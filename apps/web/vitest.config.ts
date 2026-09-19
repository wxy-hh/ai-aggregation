import { defineConfig, configDefaults } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // 与 Next.js 同一套 JSX 运行时（自动导入 react/jsx-runtime）：
  // 组件测试直接渲染不显式 import React 的组件，不必为测试给生产组件补 import
  esbuild: { jsx: 'automatic' },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // e2e/ 是 Playwright 用例目录（*.spec.ts），不能进入 Vitest
    exclude: [...configDefaults.exclude, 'e2e/**'],
    testTimeout: 60000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/dist',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
