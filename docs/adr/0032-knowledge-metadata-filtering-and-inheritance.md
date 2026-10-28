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
