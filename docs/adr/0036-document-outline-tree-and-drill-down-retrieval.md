# 0036. 知识库层级大纲树与定向下钻检索架构 (AGENT-DOC-TREE)

* **状态**：已接受
* **日期**：2026-10-28
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/worker`（Markdown/Word/PDF 解析器大纲提取、切片序号映射）、`packages/db`（Document.metadata.outline 结构与 heading_path 前缀过滤）、`apps/web`（新增 `knowledge_outline` 只读工具、增强 `knowledge_search` 定向下钻）

---

## 背景

平台现有的知识库检索系统采用 RRF 混合检索（1024 维向量 + jieba 词法分词 + 可选 Cross-Encoder 精排），将文档切割为 500~800 字符的离散切片。这一架构在事实定位与短语匹配上表现优异，但在复杂长文档交互中暴露出严重的全局盲区：
1. **只见树木不见森林（Fragmented Context）**：面对“总结本系统的权限架构设计”、“对比两份规章的核心差异”或“列出第五章的所有合规要求”等宏观全局问题时，平铺检索召回的切片高度碎片化，模型无法感知文档的全局层级脉络与章节全貌；
2. **上下文浪费与注意力涣散（Context Inflation）**：为获取全局信息，模型往往不得不发起多轮模糊检索，将大量散落在各章节的片段堆叠进 Prompt，导致有效信息密度急剧下降，长尾噪音引发模型幻觉；
3. **缺乏针对特定章节的下钻收敛能力**：虽然数据库层切片已有 `heading_path` 字段，但现有检索工具仅暴露 `query` 与通用标签过滤（`filter.tags`），无法将搜索空间精确锁定在特定章节子树内。

---

## 决策

### 1. 确定性大纲树解析与切片区间绑定 (Deterministic Outline Tree & Chunk Range)

为避免入库阶段调用大模型引入额外延迟、高昂费用和限流中断风险，大纲树构建采用**纯规则驱动的确定性提取**：
- **解析层提取**：在 `apps/worker` 的 Markdown/Word/URL 文档解析流水线中，通过 AST 标题扫描与层级栈维护，生成自顶向下的多叉树结构 `DocumentOutlineNode`；
- **自包含结构定义**：每个节点包含：
  - `id`: 节点稳定唯一标识；
  - `title`: 章节标题文本；
  - `level`: 标题层级（1~6）；
  - `headingPath`: 完整路径标识（例如：`"3. 架构设计 > 3.2 权限控制"`）；
  - `chunkRange`: 该章节包含的底层切片序号闭区间 `[startChunkIndex, endChunkIndex]`；
  - `tokenCount`: 该章节内容估算的总 Token 规模；
  - `children`: 下级子章节节点数组。
- **存储载体**：大纲树序列化为 JSON 存入 `Document.metadata.outline`，无需破坏性 DDL 变更，天然向后兼容。

### 2. 存量与非结构化文档优雅降级策略 (Graceful Outline Degradation)

- **无章节文档（纯文本/流水账）**：大纲树退化为空数组 `tree: []` 或单根节点；
- **存量未索引大纲的文档**：当 Agent 尝试获取大纲时，API 返回 `{ hasOutline: false, message: "文档暂无大纲，已自动回退为全局检索" }`；
- **模型端透明兜底**：Agent 捕获降级标识后，平滑回退至原有的 `knowledge_search` 全局混合检索，保障会话链路绝对不中断。

### 3. 双工具解耦契约 (Dual-Tool Decoupling Contract)

坚守「职责单一、参数扁平」的工具设计哲学，避免复合参数增加小参数量模型的认知负荷：
- **新增只读工具 `knowledge_outline`**：
  - **职责**：只读获取指定知识库或文档的章节目录树骨架；
  - **参数**：
    - `knowledgeBaseId`: 可选，知识库 ID；
    - `documentId`: 可选，特定长文档 ID；
    - `maxDepth`: 可选，最大展开层级（默认 2 级，防止超长文档大纲撑爆上下文）。
  - **出参**：格式化为紧凑缩进的 Markdown 目录树，附带每个章节的 Token 规模与 `headingPath`。
- **增强既有工具 `knowledge_search`**：
  - **扩展参数**：新增可选 `headingPath?: string`（章节路径）与 `documentId?: string`；
  - **强多租户隔离**：在 SQL 层严格前置绑定 `userId` 与 `knowledgeBaseId`，并在 `heading_path` 上应用严格前缀匹配（`heading_path = :path OR heading_path LIKE :path || ' > %'`）。

### 4. 自适应下钻检索模式 (Adaptive Drill-Down Retrieval)

当 Agent 指定了 `headingPath` 定向下钻特定章节时，系统自适应支持两种阅读意图：
1. **章内语义精搜（带具体 query）**：
   在指定章节及其所有子章节的局部切片范围内，执行向量检索 + jieba 词法检索 + RRF 融合（及可选 Rerank），精准定位章内最切题的片段；
2. **章节顺序通读（query 为空或泛通配符如 `*`）**：
   直接按 `chunk_index ASC` 顺序拉取该章节下的连续切片，原汁原味按行文次序拼接返回，满足模型对单章进行“全面审查”、“条款归纳”或“全文通读”的需求（受单次最大 token 上限受控截断）。

---

## 效果与代价

### 收益
1. **全局视野与精准下钻**：模型可在 1 次极低 Token 消耗的大纲探测后，精准定位目标章节下钻，彻底解决长文档“只见树木不见森林”的痛点；
2. **Token 上下文节省 $\ge 35\%$**：相比盲目全库重试，定向下钻仅向模型注入高度相关的章节片段，大幅收敛上下文噪声与幻觉率；
3. **零破环性演进**：无需 DDL 数据库变更，完全向后兼容存量文档与现有 `knowledge_search` 调用链路。

### 代价
1. **宏观场景往返轮次 +1**：对于宏观总结类问题，ReAct 循环需先调用 `knowledge_outline` 探测、再调用 `knowledge_search` 细读，端到端首包耗时增加约 1.2s；
2. **大纲无自然语言摘要**：大纲节点仅保留标题与结构，不包含 LLM 总结的 Summary，依赖章节标题本身的语义明确性。
