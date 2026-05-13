import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`环境变量 ${key} 未配置`);
  }
  return value;
}

async function main() {
  console.log('开始数据库种子数据...');

  const superAdminPassword = requireEnv('SEED_ADMIN_PASSWORD');
  const superAdminPasswordHash = await bcrypt.hash(superAdminPassword, 12);

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

  // 创建测试用户
  const testPassword = process.env.SEED_TEST_PASSWORD || 'test123456';
  const testPasswordHash = await bcrypt.hash(testPassword, 12);

  await prisma.user.upsert({
    where: { username: 'test_user' },
    update: {},
    create: {
      username: 'test_user',
      passwordHash: testPasswordHash,
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
