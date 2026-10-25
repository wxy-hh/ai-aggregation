# 知识库功能演进与规划待做清单 (Knowledge Backlog)

> 本文档用于归集知识库在混合检索（RRF）、自研双源路由、离线评测以及文档全文预览（DocumentPreview）落地后的后续可扩充功能清单，按优先级与价值分级，便于后续按需挑选立项与研发。

---

## 优先级矩阵速览

| 优先级 | 功能代号 | 功能名称 | 预估成本 | 用户体验提升 | 关联模块 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0** | `KB-CHAT-CITE` | **对话引用角标直达全文抽屉** | 低（~1天） | ★★★★★ | `apps/web/src/app/chat/` · 消息渲染 |
| **P1** | `KB-URL-INGEST` | **网页 URL / 微信文章一键抓取** | 中（~2天） | ★★★★☆ | `apps/worker` · `webFetch` SSRF 安全防线 |
| **P1** | `KB-FAQ-PAIR` | **FAQ 标准问答对管理与优先路由** | 中（~2天） | ★★★★☆ | `@repo/db` · 检索管道短路/加权 |
| **P2** | `KB-DOCX-PARSE` | **Word (.docx) / 表格 (.csv/.xlsx) 解析** | 中（~2天） | ★★★★☆ | `apps/worker` · 文本提取转换器 |
| **P2** | `KB-META-FILTER` | **多维标签元数据过滤 (Metadata Filter)** | 中（~2天） | ★★★☆☆ | `apps/web/src/app/knowledge/` · Agent 意图识别 |
| **P2** | `KB-INSIGHT-GAP` | **低置信度盲区归集与知识洞察看板** | 中（~2天） | ★★★☆☆ | `apps/web` · 分析看板与运营提示 |
| **P3** | `KB-CHUNK-TUNE` | **切片策略可视化调节与效果预览** | 中（~3天） | ★★★☆☆ | `apps/web` · 上传前置/后置配置 |

---

## 详细功能清单与规格草案

### 1. `KB-CHAT-CITE`：对话引用角标直达全文抽屉 (P0 推荐)
- **业务痛点**：目前文档全文预览（`DocumentPreviewDrawer`）仅存在于 `/knowledge` 工作台。在主对话页面（`/chat`）中，当模型基于知识库输出答案时，用户无法直接查看对应来源片段的完整上下文，影响对回答可靠性的感知。
- **核心方案**：
  - 复用已构建的 `DocumentPreviewDrawer` 和 `GET /api/knowledge-bases/[id]/documents/[docId]/content` 接口；
  - 在聊天消息 Markdown 的引用标识（如 `[1]`、`[2]` 或底部“参考来源”折叠卡片）接入点击事件；
  - 点击后在右侧滑出抽屉，自动平滑滚动至命中的切片（`CitationAnchorHighlight`）并聚焦高亮；
  - 桌面端宽屏右侧滑出，移动端采用自适应 Drawer，不中断当前输入会话。
- **技术接缝**：`apps/web/src/app/chat/_components/chat-message-list.tsx`、`apps/web/src/app/knowledge/_components/document-preview-drawer.tsx`。

---

### 2. `KB-URL-INGEST`：网页 URL / 技术文章一键导入 (P1)
- **业务痛点**：用户大量知识沉淀在外部网络（如官方文档、技术博客、公众号文章、语雀/Notion 共享链接），目前必须先手动复制粘贴存成 `.md`/`.txt` 再上传，操作链冗长。
- **核心方案**：
  - 新增「网页链接导入」Tab 或弹窗，支持单条或批量输入 HTTP(S) URL；
  - 服务端复用已有的 SSRF 安全校验与无头抓取机制（`webFetch` / JSDOM / Readability），自动提取标题、去广告、提纯正文 Markdown；
  - 生成虚拟 `Document`，入队 BullMQ 执行标准切片、稠密向量化与分词倒排索引；
  - 原链接存入 `Document.sourceUrl`，全文抽屉支持一键跳转源网页。
- **技术接缝**：`apps/worker/src/processors/document-processor.ts`、`apps/web/src/lib/security/ssrf.ts`。

---

### 3. `KB-FAQ-PAIR`：FAQ 标准问答对管理与精准优先检索 (P1)
- **业务痛点**：长文档切片在应对常见客服问答或制度规范时，模型容易“就近匹配”但回答不够精炼、甚至遗漏硬性规定。
- **核心方案**：
  - 知识库新增「问答对 (FAQ)」管理模块，支持在线手动新建/编辑问答对（问题 + 标准回答），以及 Excel/CSV 批量导入；
  - 数据模型增加 `KnowledgeFaq` 表，对问题计算稠密向量与中文词法分词；
  - 检索管道改进：检索时优先检索 FAQ 表，若存在相似度高于阈值（如 `Cosine > 0.88`）的精确问答对，直接将标准答案置顶返回或提示模型“优先采用官方标准口径”。
- **技术接缝**：`packages/db/prisma/schema.prisma`、`packages/providers/src/rag/search.ts`。

---

### 4. `KB-DOCX-PARSE`：Word (.docx) 与表格 (.xlsx / .csv) 解析 (P2)
- **业务痛点**：企业/个人常有 Word 文档与 Excel 表格。目前上传此类文件无法入库。
- **核心方案**：
  - **.docx**：集成 `mammoth` 或 `@xmldom`，提取语义标题结构与段落，自动转换为结构化 Markdown；
  - **.xlsx / .csv**：针对表格数据，支持按行（Row-as-chunk）或小块表格（Markdown Table）切块，并在切片首部自动注入表头上下文（Header Context Injection），避免切片丢失列名语义。
- **技术接缝**：`apps/worker/src/services/parsers/`、`packages/shared/src/utils/table-chunker.ts`。

---

### 5. `KB-META-FILTER`：多维标签与元数据前置过滤 (P2)
- **业务痛点**：知识库文档很多时，跨年份、跨项目或跨部门的内容容易混淆。
- **核心方案**：
  - 文档支持自定义标签键值对（例如 `department:财务`, `year:2026`, `category:规范`）；
  - `knowledge_search` 工具暴露 `metadataFilter` 参数；
  - Agent 在解析用户提问时（如：“查询2026年的报销政策”），自动提取过滤约束并在 SQL/向量阶段完成前置 ACL 筛选，大幅提升大库检索准确度。
- **技术接缝**：`packages/db/prisma/schema.prisma`（Document.metadata Json 字段）、Postgres GIN 索引。

---

### 6. `KB-INSIGHT-GAP`：知识盲区分析看板与低置信度统计 (P2)
- **业务痛点**：运维者无法获知终端用户在查什么，也不知道知识库哪些领域的文档还不完备。
- **核心方案**：
  - 记录每次对话检索的 `(query, maxScore, retrievedCount, isAnswered)`；
  - 自动汇总聚合“低置信度提问”（Score < 阈值，或模型表示无相关信息）；
  - 在知识库中提供「知识盲区分析」看板，展示：
    1. 用户高频提问但未命中知识库的 Top 20 关键词/问题；
    2. 长期未被召回的“冷门冗余文档”；
    3. 辅助管理员精准补充文档，形成自愈运营闭环。
- **技术接缝**：`apps/web/src/app/knowledge/[id]/insights/page.tsx`。

---

### 7. `KB-CHUNK-TUNE`：切片策略调节器与切片可视化 (P3)
- **业务痛点**：不同类型文档（代码规范、法律合同、短篇技术方案）适合不同的切片大小（Chunk Size）与重叠度（Overlap）。
- **核心方案**：
  - 允许在知识库维度或单文档上传时选择切片规则（按字数切片、按 Markdown 多级标题递归切片、按段落分块）；
  - 在文档详情页提供切片列表的直接查阅与微调能力，直观展示分词结果与 Token 长度。
