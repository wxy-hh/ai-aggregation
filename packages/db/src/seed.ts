import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

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
      quotaAccount: {
        create: {
          grantedUnits: 999999,
          availableUnits: 999999,
        },
      },
    },
  });

  console.log('超管账号已就绪:', superAdmin.username, '(role:', superAdmin.role, ')');

  // 创建测试用户
  // 密码由环境变量驱动；未配置时随机生成并在下方打印一次，避免在仓库里留下固定密码。
  const configuredTestPassword = process.env.SEED_TEST_PASSWORD;
  const testPassword = configuredTestPassword ?? randomBytes(12).toString('base64url');
  const testPasswordHash = await bcrypt.hash(testPassword, 12);

  const existingTestUser = await prisma.user.findUnique({
    where: { username: 'test_user' },
    select: { id: true },
  });

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
      quotaAccount: {
        create: {
          grantedUnits: 20000,
          availableUnits: 20000,
        },
      },
    },
  });

  if (existingTestUser) {
    console.log('测试用户 test_user 已存在，密码未改动（如需重置请手动更新数据库）');
  } else if (configuredTestPassword) {
    console.log('测试用户 test_user 已创建，密码来自 SEED_TEST_PASSWORD');
  } else {
    console.log(`测试用户 test_user 已创建，随机密码（仅本次打印，请立即保存）：${testPassword}`);
  }

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
