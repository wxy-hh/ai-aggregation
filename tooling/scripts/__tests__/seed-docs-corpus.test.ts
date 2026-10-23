/**
 * docs/ 首发语料 seed 脚本核心逻辑单元测试 (工单 07)
 */

import { describe, it, expect, vi } from 'vitest';
import { resolve, basename } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import {
  collectCoreDocPaths,
  CORE_DOC_PATTERNS,
  locateOrInitSeedUser,
  locateOrInitKnowledgeBase,
} from '../seed-docs-corpus.mts';
import { RAG_CAPACITY_LIMITS } from '../../../packages/shared/src/index';

describe('seed-docs-corpus 核心工具与语料收集测试', () => {
  it('collectCoreDocPaths 应成功收集到仓库核心文档且总数符合单库容量上限 (<= 50)', () => {
    const files = collectCoreDocPaths();

    // 1. 数量必须 > 0 且严格不超过 50 篇（单库容量硬约束）
    expect(files.length).toBeGreaterThan(0);
    expect(files.length).toBeLessThanOrEqual(RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase);

    // 2. 关键核心文档必须被覆盖
    expect(files).toContain('docs/agent-engineering-roadmap.md');
    expect(files).toContain('docs/project-guide.md');
    expect(files).toContain('docs/architecture.md');
    expect(files).toContain('docs/agents/qa-workflow.md');

    // 3. 至少包含 15 篇以上的 ADR 架构决策记录
    const adrFiles = files.filter((f) => f.startsWith('docs/adr/'));
    expect(adrFiles.length).toBeGreaterThanOrEqual(15);

    // 4. 所有文件在本地磁盘上必须真实存在且非空
    for (const f of files) {
      const fullPath = resolve(process.cwd(), f);
      expect(existsSync(fullPath)).toBe(true);
      const content = readFileSync(fullPath, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(10);
    }
  });

  it('语料库中必须高密度覆盖评测抽查关键词（ADR-0008、ADR-0014、连败熔断）', () => {
    const files = collectCoreDocPaths();
    let hasAdr0008 = false;
    let hasAdr0014 = false;
    let hasCircuitBreaker = false;

    for (const f of files) {
      const content = readFileSync(resolve(process.cwd(), f), 'utf-8');
      if (content.includes('ADR-0008') || f.includes('0008')) {
        hasAdr0008 = true;
      }
      if (content.includes('ADR-0014') || f.includes('0014')) {
        hasAdr0014 = true;
      }
      if (content.includes('连败熔断')) {
        hasCircuitBreaker = true;
      }
    }

    expect(hasAdr0008).toBe(true);
    expect(hasAdr0014).toBe(true);
    expect(hasCircuitBreaker).toBe(true);
  });

  it('所有收集文档的文件名 (basename) 必须互不冲突', () => {
    const files = collectCoreDocPaths();
    const basenames = files.map((f) => basename(f));
    const uniqueBasenames = new Set(basenames);

    expect(uniqueBasenames.size).toBe(basenames.length);
  });

  it('locateOrInitSeedUser 应优先返回现有管理员用户', async () => {
    const mockPrisma = {
      user: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where?.role === 'admin') {
            return { id: 'admin_1', username: 'superadmin', role: 'admin' };
          }
          return null;
        }),
        create: vi.fn(),
      },
    };

    const user = await locateOrInitSeedUser(mockPrisma);
    expect(user.id).toBe('admin_1');
    expect(user.role).toBe('admin');
    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it('locateOrInitSeedUser 在用户不存在时安全创建系统语料管理员账号', async () => {
    const mockPrisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'new_admin_1',
          username: 'system_docs_admin',
          email: 'system_docs_admin@internal.system',
          role: 'admin',
          status: 'active',
        }),
      },
    };

    const user = await locateOrInitSeedUser(mockPrisma);
    expect(user.id).toBe('new_admin_1');
    expect(user.role).toBe('admin');
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        username: 'system_docs_admin',
        email: 'system_docs_admin@internal.system',
        role: 'admin',
        status: 'active',
      },
    });
  });

  it('locateOrInitKnowledgeBase 应复用已有的「工程文档」知识库或在不存在时创建', async () => {
    const mockExistingKb = {
      id: 'kb_existing_1',
      userId: 'user_1',
      name: '工程文档',
    };

    const mockPrismaExisting = {
      knowledgeBase: {
        findFirst: vi.fn().mockResolvedValue(mockExistingKb),
        create: vi.fn(),
      },
    };

    // 已存在场景：直接复用
    const kb1 = await locateOrInitKnowledgeBase(mockPrismaExisting, 'user_1', '工程文档');
    expect(kb1.id).toBe('kb_existing_1');
    expect(mockPrismaExisting.knowledgeBase.create).not.toHaveBeenCalled();

    // 不存在场景：创建新知识库
    const mockPrismaNew = {
      knowledgeBase: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'kb_new_1',
          userId: 'user_1',
          name: '工程文档',
        }),
      },
    };

    const kb2 = await locateOrInitKnowledgeBase(mockPrismaNew, 'user_1', '工程文档');
    expect(kb2.id).toBe('kb_new_1');
    expect(mockPrismaNew.knowledgeBase.create).toHaveBeenCalledWith({
      data: {
        userId: 'user_1',
        name: '工程文档',
        description: '本平台研发工程核心文档库（架构、路线图、ADR、规范与工作流）',
      },
    });
  });
});
