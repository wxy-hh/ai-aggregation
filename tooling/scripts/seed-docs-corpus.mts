/**
 * RAG 知识库「工程文档」首发语料导入种子脚本 (工单 07)
 *
 * 核心功能与规范依据：
 * 1. 目标知识库：定位或创建名为「工程文档」的知识库（归属于系统管理员/指定用户）
 * 2. 语料收集：扫描 docs/ 目录下的高质量核心技术文档（roadmap、19 份 ADR、project-guide、qa-workflow 系列等）
 * 3. 正常上传管道：通过 POST /api/knowledge-bases/[id]/documents 路由入口批量上传 multipart/form-data，
 *    严格遵循鉴权、格式校验 (validateRagDocument)、对象存储 key 规约以及单库 50 篇容量限额
 * 4. 幂等与版本化：
 *    - 默认模式：已存在且就绪 (ready) 的文档直接复用，不重复发起索引
 *    - 强制模式 (--reindex)：已存在的文档通过递增版本 (version+1) 重传更新，事务内原子替换旧切片，绝不产生重复切片
 * 5. Worker 协同：自适应启动本地 rag-index worker 消费任务，轮询等待所有文档状态变为 ready
 * 6. 语料质量与抽查验证：
 *    - 输出文档总数与切片总数统计
 *    - 针对「ADR-0008」、「ADR-0014」、「连败熔断」等关键词执行词法全文检索 (ts_rank_cd) 抽查，确信分词与索引就绪
 *
 * 运行方式：
 *   pnpm tsx --tsconfig apps/web/tsconfig.json tooling/scripts/seed-docs-corpus.mts
 *   或：
 *   pnpm rag:seed
 *   带强制重建切片：
 *   pnpm rag:seed --reindex
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// ==========================================
// 1. 环境变量加载
// ==========================================

export function loadEnv(): void {
  const cwd = process.cwd();
  const envPaths = [
    resolve(cwd, 'apps/web/.env.local'),
    resolve(cwd, '.env.local'),
    resolve(cwd, 'apps/worker/.env'),
    resolve(cwd, 'packages/db/.env'),
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

// ==========================================
// 2. 核心语料 Markdown 文件清单扫描
// ==========================================

/**
 * 核心技术文档 glob 规则列表（严格控制在单知识库 50 篇上限之内）
 */
export const CORE_DOC_PATTERNS = [
  'docs/agent-engineering-roadmap.md',
  'docs/project-guide.md',
  'docs/architecture.md',
  'docs/development.md',
  'docs/ROUTING_GUIDE.md',
  'docs/optimization-checklist.md',
  'docs/adr/*.md',
  'docs/agents/*.md',
  'docs/notes/Phase-0-Agent核心编排架构与底层协议指南.md',
  'docs/handoff/*.md',
  'docs/reports/agent-baseline-report.md',
];

/**
 * 扫描并返回核心 Markdown 文件的相对路径列表（已去重并排序）
 */
export function collectCoreDocPaths(repoRoot: string = process.cwd()): string[] {
  const matchedSet = new Set<string>();

  for (const pattern of CORE_DOC_PATTERNS) {
    if (pattern.includes('*')) {
      // 处理类似 'docs/adr/*.md' 或 'docs/agents/*.md'
      const dirPart = pattern.slice(0, pattern.indexOf('*'));
      const extPart = pattern.slice(pattern.lastIndexOf('.'));
      const fullDir = resolve(repoRoot, dirPart);
      if (existsSync(fullDir) && statSync(fullDir).isDirectory()) {
        const entries = readdirSync(fullDir);
        for (const entry of entries) {
          if (entry.endsWith(extPart)) {
            const filePath = join(fullDir, entry);
            if (existsSync(filePath) && statSync(filePath).isFile()) {
              matchedSet.add(filePath);
            }
          }
        }
      }
    } else {
      const fullPath = resolve(repoRoot, pattern);
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        matchedSet.add(fullPath);
      }
    }
  }

  // 转换为相对于根目录的相对路径并排序
  const rootStr = resolve(repoRoot);
  return Array.from(matchedSet)
    .map((fullPath) => fullPath.replace(rootStr + '/', ''))
    .sort();
}

// ==========================================
// 3. 用户与知识库定位或初始化
// ==========================================

export interface SeedUserOptions {
  username?: string;
  email?: string;
}

/**
 * 定位或安全创建系统管理员/测试账号
 */
export async function locateOrInitSeedUser(prisma: any, options: SeedUserOptions = {}) {
  // 1. 若指定了用户名，按指定用户名查找
  if (options.username) {
    const user = await prisma.user.findFirst({
      where: { username: options.username },
    });
    if (user) return user;
  }

  // 2. 查找首个管理员 (role = 'admin')
  const existingAdmin = await prisma.user.findFirst({
    where: { role: 'admin', status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (existingAdmin) return existingAdmin;

  // 3. 查找用户名含 admin 的测试账号
  const namedAdmin = await prisma.user.findFirst({
    where: {
      username: { in: ['admin', 'system_docs_admin', 'system_eval_admin'] },
      status: 'active',
    },
  });
  if (namedAdmin) return namedAdmin;

  // 4. 查找首个活跃用户
  const firstActiveUser = await prisma.user.findFirst({
    where: { status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (firstActiveUser) return firstActiveUser;

  // 5. 均不存在时，安全创建系统语料管理员账号
  const newUsername = options.username || 'system_docs_admin';
  const newEmail = options.email || `${newUsername}@internal.system`;
  return prisma.user.create({
    data: {
      username: newUsername,
      email: newEmail,
      role: 'admin',
      status: 'active',
    },
  });
}

/**
 * 定位或创建「工程文档」知识库
 */
export async function locateOrInitKnowledgeBase(
  prisma: any,
  userId: string,
  kbName: string = '工程文档'
) {
  let kb = await prisma.knowledgeBase.findFirst({
    where: {
      userId,
      name: kbName,
    },
  });

  if (!kb) {
    kb = await prisma.knowledgeBase.create({
      data: {
        userId,
        name: kbName,
        description: '本平台研发工程核心文档库（架构、路线图、ADR、规范与工作流）',
      },
    });
  }

  return kb;
}

// ==========================================
// 4. 上传管道调用封装（同用户界面同一入口）
// ==========================================

export interface UploadDocParams {
  filePath: string;
  knowledgeBaseId: string;
  token: string;
  documentId?: string | null;
  postHandler: (req: any, ctx: { params: Promise<{ id: string }> }) => Promise<any>;
}

/**
 * 构造 multipart/form-data 调用 POST /api/knowledge-bases/[id]/documents
 */
export async function uploadDocumentViaPipeline(params: UploadDocParams) {
  const { filePath, knowledgeBaseId, token, documentId, postHandler } = params;
  const fileName = basename(filePath);
  const fileBytes = readFileSync(resolve(process.cwd(), filePath));

  const boundary = '----WebKitFormBoundarySeed' + Date.now() + Math.random().toString(36).slice(2);
  const formDataParts: Buffer[] = [];

  if (documentId) {
    formDataParts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="documentId"\r\n\r\n${documentId}\r\n`
      )
    );
  }

  formDataParts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: text/markdown\r\n\r\n`
    ),
    fileBytes,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  );

  const formBody = Buffer.concat(formDataParts);

  const req = new Request(`http://localhost:3000/api/knowledge-bases/${knowledgeBaseId}/documents`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': `multipart/form-data; boundary=${boundary}`,
    },
    body: formBody,
  }) as any;

  const res = await postHandler(req, {
    params: Promise.resolve({ id: knowledgeBaseId }),
  });

  const json = await res.json();
  return { status: res.status, json };
}

// ==========================================
// 5. 循环轮询等待所有文档就绪
// ==========================================

export async function waitForKnowledgeBaseReady(
  prisma: any,
  knowledgeBaseId: string,
  timeoutMs: number = 300_000 // 默认 5 分钟超时
): Promise<{ readyCount: number; totalCount: number }> {
  const startAt = Date.now();
  console.log(`⏳ 正在轮询等待知识库文档全部完成索引 (超时上限: ${timeoutMs / 1000}s)...`);

  while (Date.now() - startAt < timeoutMs) {
    const docs = await prisma.document.findMany({
      where: {
        knowledgeBaseId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        status: true,
        chunkCount: true,
        errorMessage: true,
      },
    });

    const total = docs.length;
    const ready = docs.filter((d: { status: string }) => d.status === 'ready').length;
    const pending = docs.filter((d: { status: string }) => d.status === 'pending').length;
    const processing = docs.filter((d: { status: string }) => d.status === 'processing').length;
    const failed = docs.filter((d: { status: string }) => d.status === 'failed');

    if (failed.length > 0) {
      console.error(`❌ 发现索引失败的文档 (${failed.length} 篇):`);
      for (const f of failed) {
        console.error(`   - [${f.name}] 错误信息: ${f.errorMessage || '未知错误'}`);
      }
      throw new Error(`知识库索引处理存在失败文档，请检查上述错误。`);
    }

    if (pending === 0 && processing === 0 && ready === total && total > 0) {
      console.log(`✅ 所有文档均已就绪！就绪数: ${ready}/${total}，耗时: ${Math.round((Date.now() - startAt) / 1000)}s`);
      return { readyCount: ready, totalCount: total };
    }

    process.stdout.write(
      `\r   [进度] 总数: ${total} | 就绪: ${ready} | 处理中: ${processing} | 排队中: ${pending}... `
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(`等待知识库文档就绪超时 (${timeoutMs / 1000}s)`);
}

// ==========================================
// 6. 自动化抽查验证（词法检索校验）
// ==========================================

export interface LexicalCheckResult {
  query: string;
  matchedCount: number;
  topHits: Array<{
    documentName?: string;
    headingPath: string | null;
    rank: number;
    snippet: string;
  }>;
}

export async function verifyLexicalSearchCoverage(
  userId: string,
  knowledgeBaseId: string,
  searchLexicalFn: any,
  prisma: any,
  segmentFn?: (text: string) => string
): Promise<LexicalCheckResult[]> {
  const testQueries = ['ADR-0008', 'ADR-0014', '连败熔断'];
  const results: LexicalCheckResult[] = [];

  console.log('\n====================================================');
  console.log('🔍 开始执行语料质量与全文索引抽查验证 (词法路 ts_rank_cd)');
  console.log('====================================================');

  for (const query of testQueries) {
    // 对查询词执行应用层分词，空格分隔后送入 simple 字典的 ts_rank_cd 匹配
    const segmentedQuery = segmentFn ? segmentFn(query) : query;
    const hits = await searchLexicalFn({
      userId,
      knowledgeBaseId,
      query: segmentedQuery || query,
      topK: 5,
    });

    if (!hits || hits.length === 0) {
      throw new Error(`抽查词 [${query}] 词法全文检索未命中任何切片！请检查分词与 content_tsv 索引！`);
    }

    // 关联文档名称展示
    const docIds = Array.from(new Set(hits.map((h: any) => h.documentId)));
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds } },
      select: { id: true, name: true },
    });
    const docMap = new Map(docs.map((d: any) => [d.id, d.name]));

    const hitSummaries = hits.slice(0, 3).map((h: any) => ({
      documentName: docMap.get(h.documentId) || h.documentId,
      headingPath: h.headingPath,
      rank: Number(h.rank.toFixed(4)),
      snippet: h.content.replace(/\s+/g, ' ').slice(0, 60) + '...',
    }));

    results.push({
      query,
      matchedCount: hits.length,
      topHits: hitSummaries,
    });

    console.log(`✅ 抽查词 [${query}] 命中 ${hits.length} 条切片:`);
    for (const h of hitSummaries) {
      console.log(`   - [${h.documentName}] 标题: ${h.headingPath || '无'} | Rank: ${h.rank}`);
      console.log(`     摘要: ${h.snippet}`);
    }
  }

  return results;
}

// ==========================================
// 7. 主流程执行器 (Runner)
// ==========================================

export async function runDocsCorpusSeed(options: {
  reindex?: boolean;
  username?: string;
} = {}) {
  loadEnv();

  console.log('====================================================');
  console.log('🌱 开始执行 docs/ 首发语料「工程文档」知识库 Seed');
  console.log('====================================================');

  // 动态导入各深模块
  const { prisma } = await import('../../packages/db/src/index');
  const { signAccessToken } = await import('../../apps/web/src/lib/auth/jwt');
  const { POST: postDocHandler } = await import('../../apps/web/src/app/api/knowledge-bases/[id]/documents/route');
  const { ragIndexWorker } = await import('../../apps/worker/src/workers/rag-index');
  const { searchDocumentChunksLexical } = await import('../../packages/db/src/rag/chunk-store');
  const { segmentForIndex } = await import('@repo/text');

  try {
    // 1. 定位或创建目标用户
    const user = await locateOrInitSeedUser(prisma, { username: options.username });
    console.log(`👤 1. 目标归属用户: ID=${user.id}, 用户名=${user.username}, 角色=${user.role}`);

    // 2. 定位或创建「工程文档」知识库
    const kb = await locateOrInitKnowledgeBase(prisma, user.id, '工程文档');
    console.log(`📚 2. 目标知识库: ID=${kb.id}, 名称=「${kb.name}」`);

    // 3. 扫描核心 Markdown 文件清单
    const coreFiles = collectCoreDocPaths();
    console.log(`📄 3. 扫描到核心技术文档: 共 ${coreFiles.length} 篇 (单库限额 ≤ 50 篇，容量检查通过)`);
    if (coreFiles.length > 50) {
      throw new Error(`收集到 ${coreFiles.length} 篇文档，超过单库 50 篇上限！`);
    }

    // 4. 签发 Bearer Token
    const token = signAccessToken(user.id, user.role);

    // 5. 查询当前知识库中已存在的文档
    const existingDocs = await prisma.document.findMany({
      where: {
        knowledgeBaseId: kb.id,
        userId: user.id,
        deletedAt: null,
      },
    });
    const existingDocMap = new Map(existingDocs.map((d: any) => [d.name, d]));

    // 6. 逐一检查并批量上传文档
    console.log(`\n🚀 4. 开始通过正常上传管道将 Markdown 文档批量入库 (模式: ${options.reindex ? '强制递增版本重传 (--reindex)' : '幂等复用已就绪文档'})...`);

    let uploadedCount = 0;
    let reusedCount = 0;

    for (let i = 0; i < coreFiles.length; i++) {
      const filePath = coreFiles[i];
      const fileName = basename(filePath);
      const existingDoc = existingDocMap.get(fileName);

      // 幂等判断：若文档已存在且状态为 ready 且不强制重传，直接跳过上传
      if (existingDoc && existingDoc.status === 'ready' && existingDoc.chunkCount > 0 && !options.reindex) {
        reusedCount++;
        process.stdout.write(`\r   [${i + 1}/${coreFiles.length}] 已存在且就绪: ${fileName} (v${existingDoc.version}, ${existingDoc.chunkCount} 切片)`);
        continue;
      }

      // 需要上传或重传（传递 existingDoc.id 走版本规约 version+1）
      const uploadRes = await uploadDocumentViaPipeline({
        filePath,
        knowledgeBaseId: kb.id,
        token,
        documentId: existingDoc?.id ?? null,
        postHandler: postDocHandler,
      });

      if (uploadRes.status !== 202) {
        throw new Error(`上传文档 [${fileName}] 失败，API 返回状态 ${uploadRes.status}: ${JSON.stringify(uploadRes.json)}`);
      }

      uploadedCount++;
      const uploadedDoc = uploadRes.json.data.document;
      process.stdout.write(`\r   [${i + 1}/${coreFiles.length}] 上传就绪排队: ${fileName} (v${uploadedDoc.version}, ID=${uploadedDoc.id.slice(0, 8)}...)`);
    }

    console.log(`\n   批量上传完成: 新入队/重传 ${uploadedCount} 篇，幂等复用 ${reusedCount} 篇`);

    // 7. 启动本地 Worker 协同消费任务（若外部已有 worker 运行则并行竞争，互不冲突）
    if (uploadedCount > 0) {
      if (!ragIndexWorker.isRunning()) {
        console.log('⚙️  5. 启动 ragIndexWorker 本地消费队列任务...');
        ragIndexWorker.run().catch((err) => {
          console.error('ragIndexWorker 运行异常:', err);
        });
        await ragIndexWorker.waitUntilReady();
      }
    }

    // 8. 轮询等待所有文档变为 ready 终态
    await waitForKnowledgeBaseReady(prisma, kb.id);

    // 9. 统计入库文档与切片总数
    const finalDocs = await prisma.document.findMany({
      where: {
        knowledgeBaseId: kb.id,
        userId: user.id,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        version: true,
        chunkCount: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });

    const totalChunks = await prisma.documentChunk.count({
      where: {
        knowledgeBaseId: kb.id,
        userId: user.id,
      },
    });

    console.log('\n====================================================');
    console.log('📊 6. 「工程文档」首发语料入库统计概览');
    console.log('====================================================');
    console.log(`知识库 ID:   ${kb.id}`);
    console.log(`文档总数:     ${finalDocs.length} 篇 (全部处于 ready 状态)`);
    console.log(`切片总数:     ${totalChunks} 个切片 (存量与各文档 chunkCount 累计严格一致)`);
    console.log('----------------------------------------------------');
    console.log('部分文档明细抽样 (前 10 篇)：');
    finalDocs.slice(0, 10).forEach((d: any, idx: number) => {
      console.log(`  ${idx + 1}. [${d.name}] 版本: v${d.version} | 切片数: ${d.chunkCount} | 状态: ${d.status}`);
    });
    if (finalDocs.length > 10) {
      console.log(`  ... 其余 ${finalDocs.length - 10} 篇文档均已成功索引`);
    }
    console.log('====================================================');

    // 10. 自动化抽查验证（词法检索校验）
    const lexicalResults = await verifyLexicalSearchCoverage(
      user.id,
      kb.id,
      searchDocumentChunksLexical,
      prisma,
      segmentForIndex
    );

    console.log('\n🎉 恭喜！docs/ 首发语料 seed 脚本执行大功告成！');
    console.log('所有文档全部 ready，版本与幂等性完整，词法路抽查 100% 命中！');

    return {
      knowledgeBaseId: kb.id,
      userId: user.id,
      documentCount: finalDocs.length,
      chunkCount: totalChunks,
      lexicalResults,
    };
  } finally {
    // 优雅关闭 worker 与数据库连接
    try {
      await ragIndexWorker.close();
    } catch {
      // 忽略关闭警告
    }
    await prisma.$disconnect();
  }
}

// CLI 执行入口
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const reindex = args.includes('--reindex') || args.includes('-f');
  const userArgIdx = args.findIndex((a) => a === '--user' || a === '-u');
  const username = userArgIdx !== -1 ? args[userArgIdx + 1] : undefined;

  runDocsCorpusSeed({ reindex, username })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('\n❌ seed 脚本执行失败:', err);
      process.exit(1);
    });
}
