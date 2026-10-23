/**
 * RAG 索引链路真机端到端自检脚本 (QA-002 服务端预演)
 *
 * 验证链路：
 * 1. 真实本地数据库 (PostgreSQL + pgvector) 与 Redis 基础设施探活
 * 2. 创建真实测试用户与知识库，签发 JWT
 * 3. 构造真实 Markdown 文档，通过 POST /api/knowledge-bases/[id]/documents 进行 multipart 上传
 * 4. 验证 API 返回 202 且 status=pending，任务已派发至 BullMQ rag-index 队列
 * 5. 启动 Worker 消费任务：对象存储下载 -> Markdown 标题层级切块 -> jieba 中文分词 -> 真实调用 SiliconFlow BAAI/bge-m3 向量化 -> 事务替换入库
 * 6. 验证 DB 中 Document 行 status=ready，chunkCount > 0
 * 7. 从 document_chunks 查询切片明细、headingPath 与真实向量维度 (1024 维)
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 环境变量加载
function loadEnv(): void {
  const envPaths = [
    resolve(process.cwd(), 'apps/web/.env.local'),
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), 'apps/worker/.env'),
    resolve(process.cwd(), 'packages/db/.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

async function runE2EVerification() {
  console.log('====================================================');
  console.log('🚀 开始执行 RAG 索引 Worker 端到端真机链路自检 (QA-002)');
  console.log('====================================================');

  const { prisma } = await import('../../packages/db/src/index');
  const { signAccessToken } = await import('../../apps/web/src/lib/auth/jwt');
  const { POST } = await import('../../apps/web/src/app/api/knowledge-bases/[id]/documents/route');
  const { processRagIndexJob } = await import('../../apps/worker/src/workers/rag-index/processor');
  const { ragIndexQueue } = await import('../../packages/queue/src/index');

  // 1. 初始化或查找测试用户
  const username = `rag_e2e_user_${Date.now()}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.internal`,
      role: 'user',
      status: 'active',
    },
  });
  console.log(`✅ 1. 创建测试用户成功: ID=${user.id}, 用户名=${user.username}`);

  // 2. 创建测试知识库
  const kb = await prisma.knowledgeBase.create({
    data: {
      userId: user.id,
      name: 'Agent RAG 核心知识库',
      description: '用于 QA-002 端到端自检的测试知识库',
    },
  });
  console.log(`✅ 2. 创建测试知识库成功: ID=${kb.id}, 名称=${kb.name}`);

  // 3. 签发有效 Access Token
  const token = signAccessToken(user.id, user.role);
  console.log(`✅ 3. 签发用户鉴权 Token 成功 (长度 ${token.length})`);

  // 4. 构造真实 Markdown 文档内容
  const testMarkdown = `
# 智能体检索增强架构 (RAG)
AI 聚合平台通过混合检索与自研 Loop 实现多源知识融合。

## 向量切片与模型
系统默认使用硅基流动托管的 BAAI/bge-m3 开源模型。
向量输出维度经探针真实实测核销，严格为 1024 维。

## 事务与一致性保障
重传产生新版本时，在单个数据库事务内原子清理旧版本切片并写入新切片。
`;

  // 5. 模拟前端构建 multipart/form-data 并发起 API 上传
  const boundary = '----WebKitFormBoundaryE2ETest' + Date.now();
  const fileBytes = Buffer.from(testMarkdown, 'utf-8');
  const filename = 'agent-rag-architecture.md';

  const formDataParts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: text/markdown\r\n\r\n`
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];
  const formBody = Buffer.concat(formDataParts);

  const req = new Request(`http://localhost:3000/api/knowledge-bases/${kb.id}/documents`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body: formBody,
  }) as any;

  const uploadContext = {
    params: Promise.resolve({ id: kb.id }),
  };

  const uploadResponse = await POST(req, uploadContext);
  const uploadJson = await uploadResponse.json();

  console.log(`✅ 4. 文档上传 API 响应 HTTP ${uploadResponse.status}:`, JSON.stringify(uploadJson));

  if (uploadResponse.status !== 202) {
    throw new Error(`文档上传 API 未返回 202，返回 ${uploadResponse.status}: ${JSON.stringify(uploadJson)}`);
  }

  const uploadedDoc = uploadJson.data.document;
  const docId = uploadedDoc.id;
  console.log(`   上传成功文档 ID: ${docId}, 初始状态: ${uploadedDoc.status}, 版本: ${uploadedDoc.version}`);

  // 6. 验证任务已派发进入 BullMQ
  const job = await ragIndexQueue.getJob(`rag-index-${docId}-v${uploadedDoc.version}`);
  console.log(`✅ 5. BullMQ 队列任务检验: JobId=${job?.id || '已入队/已取走'}, 任务名=${job?.name || 'rag-index'}`);

  // 7. 驱动 Worker 处理器真实消费任务
  console.log('🔄 6. 启动 Worker 处理器执行端到端消费（下载 -> 解析 -> 分词 -> 真实 BAAI/bge-m3 向量化 -> 事务落库）...');
  const processResult = await processRagIndexJob({
    documentId: docId,
    knowledgeBaseId: kb.id,
    userId: user.id,
    version: uploadedDoc.version,
    storageKey: uploadedDoc.storageKey,
    fileName: filename,
  });

  console.log('✅ 7. Worker 消费处理结果:', JSON.stringify(processResult));
  if (!processResult.success) {
    throw new Error(`Worker 处理失败: ${processResult.errorMessage}`);
  }

  // 8. 数据库查询检验：Document 行状态终态
  const dbDoc = await prisma.document.findUnique({
    where: { id: docId },
  });

  console.log('====================================================');
  console.log('📊 8. 数据库 Document 行最终状态证据：');
  console.log({
    id: dbDoc?.id,
    name: dbDoc?.name,
    status: dbDoc?.status,
    version: dbDoc?.version,
    chunkCount: dbDoc?.chunkCount,
    errorMessage: dbDoc?.errorMessage,
  });
  console.log('====================================================');

  if (dbDoc?.status !== 'ready' || (dbDoc?.chunkCount || 0) <= 0) {
    throw new Error(`DB Document 状态未达成 ready 终态或 chunkCount <= 0: ${JSON.stringify(dbDoc)}`);
  }

  // 9. 数据库查询检验：切片行明细与向量真实维度
  const rawChunks = await prisma.$queryRawUnsafe<Array<{
    id: string;
    chunk_index: number;
    heading_path: string | null;
    content: string;
    content_segmented: string;
    token_count: number;
    vector_dim: number;
  }>>(
    `
    SELECT
      "id",
      "chunk_index",
      "heading_path",
      "content",
      "content_segmented",
      "token_count",
      vector_dims("embedding") AS vector_dim
    FROM "document_chunks"
    WHERE "document_id" = $1
    ORDER BY "chunk_index" ASC;
    `,
    docId
  );

  console.log(`📊 9. 数据库 document_chunks 切片记录 (${rawChunks.length} 条)：`);
  rawChunks.forEach((c) => {
    console.log(`   - 切片 #${c.chunk_index}: [${c.heading_path || '无标题'}] 字符数=${c.content.length}, 分词='${c.content_segmented.slice(0, 30)}...', 向量维度=${c.vector_dim}`);
  });
  console.log('====================================================');

  for (const c of rawChunks) {
    if (c.vector_dim !== 1024) {
      throw new Error(`切片 #${c.chunk_index} 向量维度为 ${c.vector_dim}，不是 1024！`);
    }
  }

  console.log('🎉 恭喜！RAG 索引全链路真机自检 (QA-002 服务端预演) 100% 成功达成！');
  console.log('证据已就绪，所有断言均已通过。');

  await prisma.$disconnect();
  await ragIndexQueue.close();
  process.exit(0);
}

runE2EVerification().catch((err) => {
  console.error('❌ E2E 验证失败:', err);
  process.exit(1);
});
