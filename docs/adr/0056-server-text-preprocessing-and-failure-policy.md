# 0056. 服务端文本预处理、分词失败策略与批量向量化政策（评审 C9）

- **编号**：ADR-0056
- **状态**：已接受
- **日期**：2026-11-18
- **决策者**：AI 聚合平台工程团队
- **范围**：`packages/text`（新建服务端文本预处理包）、`apps/worker` RAG 与记忆索引、`apps/web` 知识库检索与产物入库、`tooling/scripts` 评测与语料脚本
- **来源**：`docs/reports/2026-11-10-core-architecture-review.md` 第九节 C9

---

## 背景

C9 原判为「服务端中文分词与向量化预处理散落」，推荐强度为 Worth exploring。经逐项拷问并在 HEAD `ba2f6b9` 核对源码后，确认以下事实：

1. **分词实现有四份**：`apps/worker/src/workers/rag-index/parser.ts:61-83`、`apps/web/src/lib/rag/hybrid-retrieval.ts:80-120`、`apps/web/src/lib/rag/faq-service.ts:10-40`、`apps/web/src/app/api/chat/_lib/agent/tools/memory-search.ts:45-58`。空文本处理与失败策略各不相同：索引端直接抛错，知识查询正则兜底，记忆查询抛错，FAQ 静默兜底。
2. **两处反向依赖**：`apps/worker/src/workers/memory-index/processor.ts:20` 从 RAG parser 取分词，`apps/web/src/lib/rag/artifact-deposit-service.ts:13` 从 FAQ 服务取分词与向量化。
3. **索引与查询的同构只靠约定**：`content_segmented` 落库，`content_tsv` 是它的生成列（`packages/db/prisma/migrations/20261023031643_add_rag_pgvector/migration.sql:53`），查询端以 `plainto_tsquery('simple', preparedQuery)` 咬合。正则兜底与 jieba 索引并不同构：中文必然错配，英文标识符也不保证一致（`apps/web/src/lib/rag/hybrid-retrieval.test.ts:18-20` 断言 jieba 会把 `ADR-0008` 切成 `ADR` 与 `0008`）。
4. **FAQ 的词法列没有消费者**：`question_segmented` 为 NOT NULL，`question_tsv` 为生成列并建了 GIN 索引（`packages/db/prisma/migrations/20261026190000_add_knowledge_faq/migration.sql:23-45`），但全仓没有任何查询读取它；FAQ 匹配只做向量相似度（`packages/db/src/rag/faq-store.ts:380-410`）。
5. **向量化调用方式有四种**：RAG Worker 按 64 条顺序分批并记录每批日志（`apps/worker/src/workers/rag-index/processor.ts:240-268`）；记忆索引一次性把所有切片交给 `embedMany`（`apps/worker/src/workers/memory-index/processor.ts:156-163`）；产物入库对每个切片无界并发单条调用（`apps/web/src/lib/rag/artifact-deposit-service.ts:190-201`）；FAQ 逐问法单条并发（`packages/db/src/rag/faq-store.ts:111-114`）。查询侧另有三份几乎相同的 `embed` 包装。
6. **既有评测不能支撑质量收益**：`docs/reports/rag-eval-report.md` 中组 C 相对组 A 的 Hit@3 为 -4.5%、MRR 为 -0.0386，正文却写作「净收益（证实）」；纯词法组 Hit@3 仅 18.2%。本决策不引用该报告作为分词同构或词法路的收益证据。

本决策的目标是**结构收口与失败语义统一**，不是提升检索质量：正常路径的分词输出逐字节保持不变，不重灌索引；唯一的行为变化发生在分词器不可用的失败路径。

## 决策

### 1. 新建 `@repo/text` 服务端包，内含两个窄模块

- 新增 `packages/text`，包名 `@repo/text`，仅服务端使用；其根入口依赖原生分词库，客户端误引会直接构建失败，不提供浏览器入口。
- 包内分两个互不依赖的 module：**Tokenizer**（应用层分词）与 **EmbeddingBatch**（批量向量化政策）。两者没有共同不变量，不合并为单一接口。
- 依赖方向固定为 `@repo/text → @repo/providers → @repo/shared`；`@repo/shared` 继续保持纯契约，不承载原生依赖；`@repo/providers` 继续只做 Provider adapter，不吸收调用政策。
- 实施时更新 `apps/web/next.config.mjs` 的 `transpilePackages`，并把 `@node-rs/jieba` 从 `apps/worker` 的直接依赖迁到 `packages/text`；`apps/web` 因 FAQ 分词例外保留该直接依赖。`serverExternalPackages` 中的 `@node-rs/jieba` 保持不变。

### 2. Tokenizer 契约：用入口名编码失败策略

```ts
segmentForIndex(text: string): string          // 空文本 → ''；分词器不可用 → 抛 SegmentationUnavailableError
segmentForQuery(text: string): string | null   // 空文本 → ''；分词器不可用 → null（不抛）
```

- 两个入口共享同一 jieba 单例、默认词典、`cut(text, false)`、逐词 trim/filter 与空格 join；输出必须与当前实现逐字节一致。
- 删除正则兜底。查询端拿到 `null` 时跳过词法召回，不以另一套词法查询同一份索引。
- 空文本与全空白返回 `''`，既不抛错也不返回 `null`；调用方据此区分「无内容可查」与「分词不可用」。
- 模块内部不记录查询原文；降级告警由调用方携带 feature、知识库/会话标识与错误信息记录。
- 测试通过 `vi.mock('@node-rs/jieba')` 模拟故障，不为生产接口增加测试开关。
- 因为正常输出不变，不进行 `content_segmented` 回填或重新向量化。未来若调整词典、分词算法或 join 规则，必须视为行为变更：重算全部 `content_segmented`（生成列自动重建 `content_tsv`），并重新决策与评测。

### 3. 失败语义矩阵

| 调用位置 | 分词不可用时的行为 |
| --- | --- |
| RAG 文档解析（Worker） | `parser.ts` 捕获并包装为 `DocumentParseError(..., isFatal: true)`；文档置 failed，不进入 BullMQ 重试 |
| 会话记忆索引（Worker） | 错误向上抛出，任务失败；沿用现有 BullMQ 重试语义，不新增 `UnrecoverableError` |
| 产物同步入库（Web） | 错误向上抛出，事务回滚，不产生半成品文档；接口返回中文失败提示 |
| 知识库混合检索（Web） | `segmentForQuery` 返回 `null`，跳过词法路，退化为纯向量召回；记录告警 |
| 会话记忆检索（Web） | `segmentForQuery` 返回 `null`，跳过词法路，退化为纯向量召回；记录告警 |
| FAQ 写入与匹配 | 不纳入本决策，保留 `segmentFaqText` 的既有行为（见第 6 节） |

- 向量化与分词同时不可用时，知识检索返回空召回，由调用方按未命中语义处理；不得伪造结果或以正则词法补位。
- 索引端 fail-closed 表示「绝不把另一套词法写入索引」；查询端 skip 表示「宁可不查词法，也不查错」。

### 4. EmbeddingBatch 政策

```ts
embedText(text: string): Promise<number[]>
embedTexts(texts: string[], options: { feature: string; context?: Record<string, unknown> }): Promise<number[][]>
```

- `embedTexts` 统一使用 `RAG_EMBEDDING_BATCH_SIZE`（64）顺序分批，保持返回顺序与输入一致；每批记录 `feature`、`batchIndex`、`totalBatches`、`batchSize`、`durationMs`、模型标识与调用方上下文，不记录文本内容。
- 向量化输入始终是原始正文，不是 `contentSegmented`；`embedTexts([])` 返回 `[]` 且不调用 Provider。
- 错误向上传播；不新增重试策略，沿用 AI SDK 现有默认值。
- 所有默认向量化实现改走本模块：RAG 入库、记忆入库、产物入库、知识查询、记忆查询、FAQ 写入。FAQ 仍逐问法调用 `embedText`，不在本次改成整批。
- 产物入库从「每切片无界并发单条」改为「按批调用」。产物内容上限 30,000 字符、切块目标 500 字符、单块最大 800 字符，常见为 38~60 块；即使因多标题切成更多块，也只是增加顺序批次，不再产生几十路并发。ADR-0034 §3 的「并发向量化」表述由本政策取代，同步进程内入库与单事务落盘的语义不变。
- `≤1.5s` 的产物入库性能指标不变，但本次不以机制推断宣称仍有富余；实施后按现有路由耗时日志复核。

### 5. 干净切断旧入口

- 删除 `segmentChinese`（`rag-index/parser.ts`）、`prepareLexicalQuery`（`hybrid-retrieval.ts`）、`segmentMemoryQuery`（`memory-search.ts`）与 `embedFaqText`（`faq-service.ts`）的实现与导出。
- 生产调用点、测试与 tooling 脚本全部改引 `@repo/text`，包括 `apps/worker/src/workers/rag-index/table-parser.ts`、`apps/worker/src/workers/memory-index/processor.ts`、`tooling/scripts/seed-docs-corpus.mts`、`tooling/scripts/eval-rag.mts`。
- 不为上述函数保留兼容转出口；`estimateTokenCount` 的 C1 转出口保持不变，与本决策无关。
- 分词库依赖迁移完成后，从 `apps/worker` 的 `package.json` 移除 `@node-rs/jieba`；`apps/web` 因 FAQ 分词例外保留该依赖，并在静态检查中列为唯一允许的 app 例外。

### 6. FAQ 分词不纳入本次范围

- 删除测试对 FAQ 分词不成立：`question_segmented` 与 `question_tsv` 当前没有检索消费者，删掉 `segmentFaqText` 不会迫使任何调用者重新实现词法规则，它是死重而不是浅 module。
- 因此 FAQ 写入继续使用 `segmentFaqText`，只把 `embedFaqText` 换成 `embedText`；FAQ 的逐问法调用方式不变。
- 「停止写入或删除 `question_segmented` / `question_tsv`」作为独立清理候选记录，需产品确认 FAQ 是否计划引入词法匹配后再决策，不并入 C9。

### 7. 证据与不宣称

- 在当前 HEAD 先用固定语料捕获旧实现的分词输出作为黄金样本（中文、中英混合、英文标识符、标点、空串与全空白），再断言 `segmentForIndex` / `segmentForQuery` 逐字节一致；任何差异即红灯，不得以「更合理」为由接受。
- 定向测试覆盖：分词黄金样本与故障注入、批量切分与顺序、RAG 文档致命失败、记忆索引失败传播、产物入库事务回滚、知识检索与记忆检索的纯向量降级。
- 真实浏览器验收覆盖两条核心链路：知识库问答（含引用）与会话记忆检索；验收查询需包含能进入词法路的中文专名。
- 本决策不宣称检索质量、命中率或性能提升；离线 RAG 对照评测只在黄金样本出现差异时启用，届时已属于行为变更，需要重新决策并重灌索引。
- 批量策略若将来要宣称降低 429 或超时，需单独的压测或生产观测，不能用本次单测替代。

### 8. 与既有 ADR 的关系

- **落实 ADR-0032 第 92 行的归口**：该 ADR 明确把批量向量化留给 C9；本次不改变切片元数据继承、GIN 过滤或原地更新语义。
- **取代 ADR-0034 §3 的「并发向量化」表述**：产物入库改为统一分批调用；同步进程内切片、单事务落盘与 `ready` 直置语义保持不变。
- **保持 ADR-0022 的记忆隐私边界**：不新增采集，不把查询原文写入降级日志。
- 不改变 ADR-0029 的文档解析与表格切块、ADR-0030 的精排政策、ADR-0036 的大纲与下钻检索、RAG 切块参数、Embedding 模型与 1024 维约束。

## 备选方案与否决理由

| 备选 | 否决理由 |
| --- | --- |
| 单一 TextPreprocessing 模块同时暴露分词与向量化 | 两个能力没有共同不变量，绑定后测试与替换互相牵连 |
| Tokenizer 放 `@repo/shared/server` | 该入口自述仅含纯契约与连接配置，原生依赖会破坏边界 |
| 两个模块都放 `@repo/providers` | 把 Provider adapter 与调用政策混层，Tokenizer 也不是 Provider |
| 查询端保留正则兜底 | 正则与 jieba 索引不同构，可能产生看似命中实则错配的词法结果 |
| FAQ 分词一并收口 | 词法列无消费者，只会把死重包装成正式接口，并给 FAQ 写入增加硬依赖 |
| 暂不做向量化收口 | 违背 ADR-0032 的归口记录，四种调用方式继续漂移 |
| 以离线评测作为本次门禁 | 依赖真实环境与语料，且无法隔离分词变化；黄金样本更精确 |

## 影响

- 新增一个服务端包与一行 `transpilePackages` 配置；`@node-rs/jieba` 的直接依赖从两个 app 迁到包内。
- 失败路径行为发生变化：索引端不再写正则分词，查询端不再用正则查 jieba 索引，FAQ 之外的降级统一为「跳过词法」。
- 产物入库的请求形态从多路并发变为顺序批次；大产物延迟需要按现有日志复核，不预设结论。
- FAQ 仍保留一份独立分词实现，属于显式记录的遗留债务。
- 不涉及数据库迁移、历史数据回填、API 契约变更或前端交互变更。
