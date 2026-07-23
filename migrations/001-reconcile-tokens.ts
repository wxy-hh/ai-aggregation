/**
 * 数据迁移：将 user.tokens 从"调用次数"改为"Token 余额"
 *
 * 背景：之前 user.tokens 只按调用次数扣减（每次减 1），
 * AIUsageRecord 中记录了实际消耗但未影响余额。
 * 迁移后 user.tokens 反映真实剩余：DEFAULT_QUOTA - 实际消耗。
 *
 * 运行：npx tsx migrations/001-reconcile-tokens.ts
 */
import { prisma } from '../packages/db/src/client';

const DEFAULT_QUOTA = 20000;

async function main() {
  console.log('=== Token 余额迁移开始 ===');
  console.log(`DEFAULT_QUOTA = ${DEFAULT_QUOTA}`);
  console.log('');

  // 获取所有非管理员用户
  const users = await prisma.user.findMany({
    where: { role: { not: 'admin' } },
    select: { id: true, username: true, tokens: true },
  });
  console.log(`共 ${users.length} 个非管理员用户`);
  console.log('');

  // 备份当前值
  const backup: Record<string, { oldTokens: number; newTokens: number; consumed: number }> = {};
  let updatedCount = 0;

  for (const user of users) {
    // 查询该用户所有成功的 AIUsageRecord
    const records = await prisma.aIUsageRecord.findMany({
      where: { userId: user.id, status: 'success' },
      select: { totalTokens: true, taskCount: true },
    });

    // 计算总消耗：有 token 数据的用 totalTokens，否则按 taskCount 计
    let consumed = 0;
    for (const record of records) {
      if (record.totalTokens !== null) {
        consumed += record.totalTokens;
      } else {
        consumed += record.taskCount;
      }
    }

    const oldTokens = user.tokens;
    const newTokens = Math.max(0, DEFAULT_QUOTA - consumed);

    backup[user.id] = { oldTokens, newTokens, consumed };

    if (oldTokens !== newTokens) {
      await prisma.user.update({
        where: { id: user.id },
        data: { tokens: newTokens },
      });
      console.log(
        `  [已更新] ${user.username} (${user.id.slice(0, 8)}...): ${oldTokens} → ${newTokens} (消耗 ${consumed})`
      );
      updatedCount++;
    } else {
      console.log(
        `  [不变]   ${user.username} (${user.id.slice(0, 8)}...): tokens=${oldTokens} (消耗 ${consumed})`
      );
    }
  }

  console.log('');
  console.log(`=== 迁移完成 ===`);
  console.log(`处理用户: ${users.length}`);
  console.log(`已更新:   ${updatedCount}`);
  console.log(`未变更:   ${users.length - updatedCount}`);
  console.log('');

  // 保存备份文件
  const fs = await import('fs/promises');
  const backupPath = `migrations/backup-${Date.now()}.json`;
  await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));
  console.log(`备份已保存至: ${backupPath}`);
}

main()
  .catch((e: unknown) => {
    console.error('迁移失败:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
