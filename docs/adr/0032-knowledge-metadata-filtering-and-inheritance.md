# 0032. 知识库多维标签与元数据前置过滤及继承同步架构

* **状态**：已接受
* **日期**：2026-10-28
* **决策者**：AI 聚合平台工程团队
* **范围**：`packages/db`（Document/DocumentChunk 数据模型与 PostgreSQL GIN 索引扩展）、`apps/worker`（切片元数据打平继承）、`apps/web`（混合检索管道前置过滤、Relaxed Fallback 容灾、文档标签管理 UI 与 Agent 检索工具联动）

---

## 背景

在平台现有的 RAG 混合检索（Dense 向量路 + Lexical 词法全文路 + RRF 融合 + Cross-Encoder Rerank）架构中，检索过滤条件仅包含用户 ACL（`userId`）与知识库边界（`knowledgeBaseId`）。

随着单个知识库内文档数量增长，跨年份（如 2024 vs 2026）、跨部门（如 财务 vs 人力）、跨业务线（如 国内 vs 海外）的文档大量共存，引发以下突出问题：
1. **语义交织与过拟合召回**：虽然向量能感知语义相近，但在具有明确时间或分类范围的提问下（例如“查询 2026 年最新报销政策”），由于 2024 年旧版政策中包含更多重复关键词，容易错误召回失效文档；
2. **后置过滤的召回空洞（Recall Void）**：若在 Top-20 召回后再进行内存过滤，极易因候选池被无关切片挤占而导致过滤后有效切片过少甚至断流；
3. **元数据维护与算力成本矛盾**：若每次修改分类标签都需要让文档重新入队排队 Worker 重新切块与调用 Embedding 向量化，将产生巨大的 GPU/API 成本和数秒至数十秒的延迟；
4. **Agent 意图抽取幻觉与 0 召回断崖**：大模型 Function Calling 在抽取过滤参数时，容易因对库内标签体系缺乏感知而猜错标签；如果检索硬性返回空，将直接导致模型回答“查无此信息”，破坏用户体验。

---

## 决策

### 1. 数据模型与继承机制 (Data Modeling & Flat Inheritance)

- **文档级主表扩展**：
  在 `Document` 模型中扩展 `tags String[] @default([])`（扁平标签数组）与 `metadata Json @default("{}")`（自定义键值），提供文档维度的统一打标与分类能力。
- **切片级打平继承与 GIN 索引**：
  在文档入库分块（Worker）或元数据更新时，将文档的 `tags` 和 `metadata` 自动合并打平赋予切片的 `document_chunks.metadata`（例如 `{ "tags": ["财务", "2026"], "year": 2026, "department": "hr" }`）。
  切片表利用现有 `metadata jsonb` 字段，建立 PostgreSQL GIN 索引（`jsonb_path_ops`），实现单表切片级纳秒级前置布尔收敛，避免大表跨表 JOIN 关联查询。

### 2. 精简过滤语法与参数化防注入 (Filter Syntax & SQL Parameterization)

- **过滤语法规范**：
  收敛过滤语法为工业级实用顶层 AND 复合结构，支持：
  - 等值匹配（`$eq`）：`{ "department": "hr" }`
  - 集合包含（`$in`）：`{ "tags": { "$in": ["制度", "规范"] } }`
  - 范围比较（`$gte / $lte`）：`{ "year": { "$gte": 2025, "$lte": 2026 } }`
- **安全与校验**：
  采用 Zod 强类型校验 Schema，键名实施严格白名单正则校验（防字段注入），所有过滤值通过 PostgreSQL 占位符（`$5`, `$6`...）进行参数化绑定，杜绝任何裸字符串 SQL 拼接。

### 3. 过滤放宽兜底机制 (Filter Relaxation & Fail-soft Fallback)

- **零命中自动兜底**：
  当带有 `filter` 条件的混合检索召回为 0 条时，检索管道内部自动无缝降级触发一次**无 `filter` 限制的全库保底检索**。
- **透明可观测与提示注入**：
  返回结果标记 `isFilterRelaxed: true`，在注入大模型上下文时明确标注提示语（“*未检索到完全匹配过滤条件的切片，已自动为您检索全库最相关内容供参考，请在回答时向用户说明*”），调试台高亮呈现降级徽章，保障对话链路 100% 连贯可用。

### 4. 即时原地批量同步机制 (In-Place Instant Chunk Sync)

- **免重新切片与向量化**：
  用户在知识库管理后台修改文档标签或元数据时，服务端更新 `documents` 表并立即执行原生原子 SQL：
  ```sql
  UPDATE document_chunks
  SET metadata = $newMetadata
  WHERE document_id = $docId AND document_version = $currentVersion;
  ```
  在几毫秒内完成切片元数据同步，无需重新排队 Worker、无需重新切块、零消耗 Embedding API 额度。

### 5. Agent 意图识别增强 (Agent Awareness & Schema Ergonomics)

- **动态标签感知**：
  组装系统 Prompt 时，动态聚合并注入当前用户激活知识库的已有可用标签列表，为大模型提供明确枚举参考。
- **Schema 一等公民设计**：
  在 `knowledge_search` 工具入参中，将 `tags` 与 `year` 明确定义为顶层常用字段，兼顾大模型结构化抽取准确率与可解释性。

---

## 影响与收益

1. **精度显著提升**：在海量跨年份、跨品类文档场景下，前置过滤收窄了检索候选空间，彻底消除历史失效文档对当前决策的语义干扰；
2. **算力与响应零浪费**：切片更新采用原地 SQL 批量同步，免除重复向量计算；检索前置布尔过滤减少了无效 Rerank 与上下文 Token 消耗；
3. **体验弹性无断崖**：即便模型意图抽取产生轻微偏差，通过 Filter Relaxation 机制确保用户始终获得高质量参考答复。

---

## 修订记录

### 2026-11-10 修订：切片元数据键分层契约与原地合并语义（C1 拷问结论）

> 依据：`docs/reports/2026-11-10-core-architecture-review.md` C1 及拷问会话共识。本次修订**补充**既有语义，不推翻第 1、4 节的毫秒级原子更新、不重切块、零向量化消耗与 GIN 索引前提。

**动机**：原第 4 节 `SET metadata = $newMetadata` 整体覆盖语义，会抹除仅存在于切片上的系统字段（`sourceType`、`fileName`、`storageKey`、`parsedContentKey`），而 Document 主表 `metadata` JSON 并不保存这些键，编辑路径无法恢复（已确认的数据正确性缺陷）。

**修订内容**：

1. **键分层契约**：切片 `metadata` 键分四类——A 用户可编辑继承键（`tags` + 自定义业务元数据）；B 系统派生键（`sourceType`、`fileName`、`storageKey`、`parsedContentKey`，从 Document 主表列权威重算，永不信任请求体）；C 文档溯源键（`sourceSessionId`、`sourceArtifactId`、`depositedAt`、`artifactType`，继承自主表，只读）；D 显式剔除键（`outline`，ADR-0036 大纲树只留主表，严禁流入切片）。分层契约与构造规则的唯一事实源位于 `packages/shared`（纯函数），`packages/db` 的 chunk-store 封装高层入库接口，Worker、ArtifactKnowledgeDeposit 与元数据编辑路径共享同一不变量。
2. **原地更新改合并语义**：第 4 节 SQL 修订为 `SET metadata = metadata || $1::jsonb`，`$1` 只含 A 层（编辑后值）与 B 层（主表重算值）；C 层随主表继承，切片私有键（逐片不同的值）因拼接语义天然保留。与 PATCH 路由"浅合并、只增不删"的现有语义等价；未来若需支持删键，平滑升级为 `(metadata - $keys) || $1`。
3. **历史数据自愈与修复**：合并语义使已被覆盖丢失 B 层键的存量切片在下一次编辑时被自动补齐；另随附一次性回填脚本 `migrations/002-reconcile-chunk-metadata.ts`（沿用 `001-reconcile-tokens.ts` 范式：手动执行、按文档分批、幂等可重跑），部署后按需执行，不卡发布门禁。
4. **API 守门**：PATCH 路由对传入 B/C/D 层键的请求返回 400（显式拒绝优于静默吞掉用户意图）。
5. **ArtifactKnowledgeDeposit 对齐**：其切片补齐 B 层字段（此前缺失，属实现遗漏而非有意差异，不改变检索过滤行为）；不再向切片 `metadata` 写入 `chunkIndex`（`chunk_index` 物理列已是唯一权威，检索从不按该键过滤，存量残留无害）。
6. **明确不收拢**：切块参数、Jieba 分词、批量向量化调度不属于本次范围——前两者维持现状（统一切块参数需检索评测证据），批量向量化归 C9（服务端文本预处理候选）。`estimateTokenCount` 纯函数移入 `packages/shared` 但 R1 不改任何调用点。
7. **实施节奏**：两轮推进。R1：shared 契约 + 编辑路径红灯用例与合并修复 + Worker 主干迁移 + PATCH 400 守门；R2：artifact 独立补测与迁移 + 低层 `insertDocumentChunks` 私有化。
