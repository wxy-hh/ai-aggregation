/**
 * 数据修复：回填切片缺失的系统派生键（B 层）
 *
 * 背景：ADR-0032 原整体覆盖语义导致历史上经过 PATCH 编辑的文档，
 * 其切片的 sourceType / fileName / storageKey / parsedContentKey 被覆盖丢失。
 * C1（ADR-0032 2026-11-10 修订）将原地更新改为合并语义后，新增编辑已自动补齐；
 * 本脚本一次性修复存量残缺数据。
 *
 * 策略：仅补齐缺失的 B 层四键（从 documents 主表权威重算），
 * 不触碰 tags 与任何自定义键，不覆盖已有值（jsonb || 左值优先）。
 *
 * 特性：按文档游标分批、幂等可重跑（二次执行更新数为 0）、全量统计日志。
 * 核心逻辑见 chunk-store 的 reconcileChunkMetadataFields（可测试）。
 * 运行：npx tsx migrations/002-reconcile-chunk-metadata.ts
 */
import { prisma } from '../packages/db/src/client';
import { reconcileChunkMetadataFields } from '../packages/db/src/rag/chunk-store';

async function main() {
  console.log('=== 切片系统字段回填开始 (002-reconcile-chunk-metadata) ===');
  console.log('');

  const result = await reconcileChunkMetadataFields({
    onProgress: (doc, updatedChunks) => {
      console.log(`  [已修复] ${doc.name} (${doc.id.slice(0, 8)}...): 更新切片 ${updatedChunks} 个`);
    },
  });

  console.log('');
  console.log('=== 回填完成 ===');
  console.log(`处理文档: ${result.processedDocs}`);
  console.log(`更新切片: ${result.updatedChunks}`);

  const fs = await import('fs/promises');
  const backupPath = `migrations/backup-chunk-metadata-${Date.now()}.json`;
  await fs.writeFile(backupPath, JSON.stringify(result.details, null, 2));
  console.log(`修复前旧值备份已保存至: ${backupPath}`);
}

main()
  .catch((e: unknown) => {
    console.error('回填失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
