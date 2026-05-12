import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始数据库种子数据...');

  // 创建测试用户
  const user = await prisma.user.upsert({
    where: { username: 'test_user' },
    update: {},
    create: {
      username: 'test_user',
      name: '测试用户',
    },
  });

  console.log('创建用户:', user);

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
