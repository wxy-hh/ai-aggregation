import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始数据库种子数据...');

  // 创建超管账号
  const superAdminPasswordHash = await bcrypt.hash('woaini2244', 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: 'xkfy' },
    update: {
      role: 'admin',
      passwordHash: superAdminPasswordHash,
    },
    create: {
      username: 'xkfy',
      passwordHash: superAdminPasswordHash,
      name: '超级管理员',
      role: 'admin',
      status: 'active',
      tokens: 999999,
    },
  });

  console.log('超管账号已就绪:', superAdmin.username, '(role:', superAdmin.role, ')');

  // 创建测试用户（如已存在则跳过）
  await prisma.user.upsert({
    where: { username: 'test_user' },
    update: {},
    create: {
      username: 'test_user',
      name: '测试用户',
      role: 'user',
      status: 'active',
      tokens: 20000,
    },
  });

  console.log('种子数据完成!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
