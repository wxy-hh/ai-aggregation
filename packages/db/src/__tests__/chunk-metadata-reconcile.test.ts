import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

vi.hoisted(() => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://weixiaoyu@localhost:5432/ai_aggregation';
  }
});

import { prisma } from '../client';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function runReconcileScript() {
  return execSync('npx tsx migrations/002-reconcile-chunk-metadata.ts', {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: { ...process.env },
  });
}

describe('migrations/002 切片系统字段回填脚本 (TC09)', () => {
  let userId: string;
  let docId: string;
  let backupBefore: Set<string>;

  const expectedStorageKeySuffix = (kbId: string) => `docs/${userId}/${kbId}/v1/tc09-dirty.md`;

  beforeAll(async () => {
    backupBefore = new Set(readdirSync(resolve(repoRoot, 'migrations')));

    const user = await prisma.user.create({
      data: { username: `tc09_reconcile_${Date.now()}`, tokens: 10000 },
    });
    userId = user.id;
    const kb = await prisma.knowledgeBase.create({ data: { userId, name: 'TC09回填测试库' } });
    const doc = await prisma.document.create({
      data: {
        knowledgeBaseId: kb.id,
        userId,
        name: 'tc09-dirty.md',
        storageKey: expectedStorageKeySuffix(kb.id),
        version: 1,
        status: 'ready',
        sourceType: 'file',
      },
    });
    docId = doc.id;
    // 构造存量脏数据：metadata 完全为空（缺失全部 B 层键）
    await prisma.$executeRaw`
      INSERT INTO "document_chunks" (
        "id", "document_id", "knowledge_base_id", "user_id",
        "document_version", "chunk_index", "content", "content_segmented",
        "heading_path", "page_number", "token_count", "metadata", "embedding", "created_at"
      ) VALUES (
        ${'tc09_chk_1'}, ${doc.id}, ${kb.id}, ${userId},
        1, 0, '回填脚本的验证内容。', '回填 脚本 的 验证 内容',
        NULL, NULL, 10, '{}'::jsonb, ${'[' + new Array(1023).fill(0).join(',') + ',1]'}::vector, CURRENT_TIMESTAMP
      );
    `;
  });

  afterAll(async () => {
    // 清理测试数据与脚本产生的备份文件（保留真实回填的审计备份除外）
    try {
      if (userId) {
        await prisma.user.delete({ where: { id: userId } });
      }
      const backupsAfter = readdirSync(resolve(repoRoot, 'migrations'));
      for (const f of backupsAfter) {
        if (!backupBefore.has(f) && f.startsWith('backup-chunk-metadata-') && existsSync(resolve(repoRoot, 'migrations', f))) {
          unlinkSync(resolve(repoRoot, 'migrations', f));
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  it('TC09-1 断言1: 执行 002 脚本后脏切片 B 层键补齐且等于主表派生值', () => {
    runReconcileScript();

    return (async () => {
      const rows = await prisma.$queryRaw<Array<{ metadata: Record<string, unknown> }>>`
        SELECT "metadata" FROM "document_chunks" WHERE "document_id" = ${docId};
      `;
      const meta = rows[0].metadata;
      expect(meta.sourceType).toBe('file');
      expect(meta.fileName).toBe('tc09-dirty.md');
      expect(meta.storageKey).toContain('/v1/tc09-dirty.md');
      expect(meta.parsedContentKey).toContain('/v1/content.md');
    })();
  });

  it('TC09-2 断言2: 立即重复执行脚本更新切片数为 0（幂等）', () => {
    const out = runReconcileScript();
    const m = out.match(/更新切片:\s*(\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(0);
  });

  it('TC09-3 断言3: 脚本终端输出含处理文档数与更新切片数统计行', () => {
    // 重新构造一个脏文档以产生非零统计，再执行脚本观察统计行
    return (async () => {
      const kb = await prisma.knowledgeBase.create({ data: { userId, name: 'TC09统计行测试库' } });
      const doc = await prisma.document.create({
        data: {
          knowledgeBaseId: kb.id,
          userId,
          name: 'tc09-stats.md',
          storageKey: `docs/${userId}/${kb.id}/v1/tc09-stats.md`,
          version: 1,
          status: 'ready',
          sourceType: 'file',
        },
      });
      await prisma.$executeRaw`
        INSERT INTO "document_chunks" (
          "id", "document_id", "knowledge_base_id", "user_id",
          "document_version", "chunk_index", "content", "content_segmented",
          "heading_path", "page_number", "token_count", "metadata", "embedding", "created_at"
        ) VALUES (
          ${'tc09_chk_2'}, ${doc.id}, ${kb.id}, ${userId},
          1, 0, '统计行验证内容。', '统计行 验证 内容',
          NULL, NULL, 8, '{}'::jsonb, ${'[' + new Array(1023).fill(0).join(',') + ',1]'}::vector, CURRENT_TIMESTAMP
        );
      `;

      const out = runReconcileScript();
      expect(/处理文档:\s*\d+/.test(out)).toBe(true);
      expect(/更新切片:\s*\d+/.test(out)).toBe(true);
      const m = out.match(/更新切片:\s*(\d+)/);
      expect(Number(m![1])).toBe(1);
    })();
  });
});
