import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 部分模拟 bullmq，桩化 Worker 实例化过程以避免真实的 Redis 连接
vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Worker: vi.fn().mockImplementation(function (name: string) {
      return { name, close: vi.fn().mockResolvedValue(undefined) };
    }),
  };
});

import { activeWorkers } from '../index';

describe('Worker 注册中心与瘦身验收 (TC06)', () => {
  it('TC06-1: 导出的启动 Workers 列表中不包含 stt、ppt、image 实例', () => {
    const queueNames = activeWorkers.map((w) => w.name);
    expect(queueNames).not.toContain('stt');
    expect(queueNames).not.toContain('ppt');
    expect(queueNames).not.toContain('image');
  });

  it('TC06-2: Workers 列表中包含且仅包含 5 个真实消费 Worker', () => {
    const queueNames = activeWorkers.map((w) => w.name);
    expect(activeWorkers).toHaveLength(5);
    expect(queueNames).toEqual(
      expect.arrayContaining([
        'qimen-base',
        'qimen-section',
        'rag-index',
        'memory-index',
        'maintenance',
      ])
    );
  });

  it('TC06-3: apps/worker/package.json 已彻底移除 pptxgenjs 依赖声明', () => {
    const pkgPath = path.resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    expect(pkg.dependencies).not.toHaveProperty('pptxgenjs');
  });
});
