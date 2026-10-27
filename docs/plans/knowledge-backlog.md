# 知识库功能演进与规划待做清单 (Knowledge Backlog)

> 本文档用于归集知识库在混合检索（RRF）、自研双源路由、离线评测以及文档全文预览（DocumentPreview）落地后的后续功能演进规划。结合行业成熟知识库（如 Dify、FastGPT、Ragflow）与 RAG 生产实践，按价值、成本与紧迫度分级，指导后续研发迭代。

---

## 优先级矩阵速览

| 优先级 / 状态 | 功能代号 | 功能名称 | 预估成本 | 价值与体验提升 | 关联模块 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **P0 (已完成)** | `KB-CHAT-CITE` | **对话引用角标直达全文抽屉与切片高亮** | 低（~1天） | ★★★★★ | `apps/web` · 聊天与全文抽屉联动 | **已交付 (v1.0)** |
| **P1 (已完成)** | `KB-FAQ-PAIR` | **FAQ 标准问答对管理与精准优先短路** | 中（~1.5天）| ★★★★★ | `@repo/db` · `@repo/providers` · 问答对路由 | **已交付 (v1.1)** |
| **P1 (已完成)** | `KB-URL-INGEST` | **网页 URL / 微信文章一键抓取与入库** | 中（~1.5天）| ★★★★☆ | `apps/worker` · SSRF 防线 · 文本清洗 | **已交付 (v1.2)** |
| **P2 (已完成)** | `KB-DOCX-PARSE` | **Word (.docx) 与表格 (.csv/.xlsx) 结构化解析** | 中（~2天） | ★★★★☆ | `apps/worker` · 表头上下文注入 | **已交付 (v1.3)** |
| **P2 (已完成)** | `KB-RERANK-FUSION` | **Rerank 二次语义重排模型 (Cross-Encoder)** | 低（~1天） | ★★★★☆ | `@repo/providers` · 检索管道二次排序 | **已交付 (v1.4)** |
| **P2 (当前首选)** | `KB-META-FILTER` | **多维标签与元数据前置过滤 (Metadata Filter)** | 中（~2天） | ★★★☆☆ | `packages/db` · Agent 结构化意图识别 | **准备立项 (Next)** |
| **P3 (运营看板)** | `KB-INSIGHT-GAP` | **低置信度盲区归集与知识洞察看板** | 中（~2天） | ★★★☆☆ | `apps/web` · 运营分析与补全提示 | 储备池 |
| **P3 (深度调优)** | `KB-CHUNK-TUNE` | **切片策略可视化调节与效果预览** | 中（~3天） | ★★★☆☆ | `apps/web` · 上传前置/后置配置 | 储备池 |

---

## 已交付功能沉淀 (Completed)

### `KB-CHAT-CITE`：对话引用角标直达全文抽屉 (P0 已完成)
- **交付目标**：解决主对话（`/chat`）中大模型回答无法直观追溯来源上下文的问题，建立用户对 RAG 输出的确定性与可信度。
- **交付成果**：
  - 在聊天 Markdown 中渲染 `[1]`、`[2]` 引用角标与底部「参考来源」折叠卡片；
  - 点击角标在桌面端平滑滑出非模态全文预览抽屉，移动端自适应抽屉布局；
  - 自动平滑滚动定位至命中的切片（`CitationAnchorHighlight`）并聚焦高亮；
  - 修复多文档交叉引用与预览异常，触控区域全面对齐移动端 $\ge 44\times 44\text{px}$ 规范。
- **关联代码**：`apps/web/src/app/chat/_components/chat-message-list.tsx`、`apps/web/src/app/knowledge/_components/document-preview-drawer.tsx`。

### `KB-FAQ-PAIR`：FAQ 标准问答对管理与精准优先短路 (P1 已完成)
- **交付目标**：解决长文本分块在规章制度与高频客服中匹配发散与推理耗时的问题，构建高置信度秒级强短路与官方权威口径强约束体系。
- **交付成果**：
  - 在 `@repo/db` 构建 `KnowledgeFaq` 主表与 `KnowledgeFaqQuestion` 问法表，标准问与相似问扁平化独立索引（1024 维 BAAI/bge-m3 + HNSW 索引与 jieba 分词），最大化 Sentence-to-Sentence 语义锐度；
  - 聊天链路实现 Cosine $\ge 0.92$ 极高置信度前置强短路（直出标准答复、零 Token 消耗、零推理延迟）；
  - $0.78 \le \text{Cosine} < 0.92$ 或 Agent 链路自动作为 `FaqGroundTruth` 官方权威口径置顶注入；
  - 知识库工作台挂载「问答对 (FAQ)」Tab，支持单条同步即时向量化增删改、启用开关一键切换及轻量标准 CSV 批量导入与导出；
  - 移动端 375px 窄屏适配，热区全面满足 $\ge 40\text{px}$ 规范。
- **关联代码**：`packages/db/src/rag/faq-store.ts`、`apps/web/src/app/api/chat/_lib/faq-short-circuit.ts`、`apps/web/src/app/knowledge/_components/faq-management-panel.tsx`。

### `KB-URL-INGEST`：网页 URL / 微信文章一键抓取与入库 (P1 已完成)
- **交付目标**：解决技术博客、开发文档与微信公众号文章手动复制粘贴入库繁琐易丢失排版的问题，建立纯 Node 降噪提取与防 DNS 重绑定 SSRF 强安全入库管道。
- **交付成果**：
  - 在 `@repo/shared` 下沉纯函数 `validateUrlLiteral`、`guardResolvedAddresses` 及服务端 `guardedFetch`（连接级 Socket lookup IP 锁定、逐跳 302 安全复核、2MB 截断）；
  - `Document` 模型扩展 `sourceType='url'` 与 `sourceUrl`，并完成 Prisma 迁移与客户端类型更新；
  - `apps/worker` 构建专有微信文章提取器（`#activity-name`、`#js_content`、`data-src` 懒加载图转标准 Markdown）与通用 Readability 降噪引擎；
  - 知识库管理面板挂载「导入网页」弹窗，支持 1~10 个网址批量录入、微信链接专属高亮徽章与 50 篇容量门禁；
  - 文档卡片展示「网页」Badge，全文预览抽屉顶部展示「跳转原文」外链直达；
  - 通过 `ego-browser` 可见窗口完成全链路真机自动化验收（截图：`screenshots/TC05.png`、`TC06.png`）。
- **关联代码**：`packages/shared/src/security/`、`apps/worker/src/workers/rag-index/html-extractor.ts`、`apps/web/src/app/api/knowledge-bases/[id]/documents/url/route.ts`、`apps/web/src/app/knowledge/_components/url-import-dialog.tsx`。

### `KB-DOCX-PARSE`：Word (.docx) 与表格 (.csv/.xlsx) 结构化解析 (P2 已完成)
- **交付目标**：解决企业合同、报表直接切块撕裂行列结构导致表头列语义脱落的问题，构建单机轻量防线、表头上下文注入与双轨归一存储体系。
- **交付成果**：
  - 在 `@repo/shared` 扩展格式白名单支持 `.docx`、`.xlsx`、`.csv`，前置友好拦截老旧 `.doc` / `.xls`，设立单 Sheet 500 行、单文件 50 切片、15 列修剪轻量保护防线；
  - `apps/worker` 引入纯 Node 轻量 `mammoth` 提取大纲层级栈（`headingPath`），剥离图片 base64 污染；基于 `xlsx` 库构建 `TableChunk` 自包含切块与表头上下文注入（`HeaderContextInjection`）；
  - 双轨归一存储模型：原始文件保全支持下载，提纯后的 GFM Markdown 同步缓存至 `content.md`，使全文抽屉极速只读渲染并无缝兼容切片高亮（`CitationAnchorHighlight`）；
  - 知识库工作台挂载「上传文档」按钮与格式 Badge（Word/表格/PDF/文本），全文抽屉支持原文件下载与移动端 375px 窄屏表格横向平滑滚动（`overflow-x-auto`）；
  - 通过 `ego-browser` 可见窗口完成端到端全链路真机验收（截图：`screenshots/TC06.png`、`TC07.png`）。
- **关联代码**：`packages/shared/src/rag-config.ts`、`apps/worker/src/workers/rag-index/docx-parser.ts`、`table-parser.ts`、`apps/web/src/app/knowledge/knowledge-workspace.tsx`、`document-preview-drawer.tsx`。

### `KB-RERANK-FUSION`：Rerank 二次精排模型集成 (P2 已完成)
- **交付目标**：解决 RRF 无监督倒数加权无法感知深层细粒度交叉注意力、多知识库并发召回时得分标尺不可比以及长尾无关切片诱发大模型幻觉的问题，构建多库聚合统一单次精排、0.20 置信度防线与静默弹性容灾体系。
- **交付成果**：
  - 将 `RerankProvider` 通用抽象与 `SiliconFlowRerankProvider`（基于 `BAAI/bge-reranker-v2-m3`）正式下沉至 `@repo/providers` 供全仓复用，`apps/web` 保留向下兼容导出；
  - 在 `@repo/shared` 收敛 `RAG_RERANK_CONFIG`：设定候选池上限 `maxCandidates = 30`（防超时与 Payload 暴涨）与最低安全相关性阈值 `minRelevanceScore = 0.20`，生产环境默认开启；
  - 主对话 Agent（`knowledge_search`）实现各库仅粗排召回、去重后统一发起单次 Rerank 请求，彻底解决跨库得分标尺不一致并将网络 I/O 降至最低；全员低分时明确提示未命中有效信息杜绝幻觉；
  - 单库混合检索管道（`hybridRetrieval`）实现 Fail-open 静默容灾降级，发生网络异常时平滑回退为原 RRF 排名结果并标记 `isDegraded: true`，绝不阻断用户聊天或检索主链路；
  - 知识库工作台「检索调试台」复选框默认勾选，实现 Rerank 精排分与原始 RRF / 向量 / 词法排名双打分透明对照，阶段耗时常态化呈现，支持黄色降级徽章与低分切片淘汰数量统计，375px 窄屏自适应良好；
  - 通过 `ego-browser` 可见窗口完成端到端全链路真机验收（截图：`screenshots/TC05.png`、`TC06.png`）。
- **关联代码**：`packages/providers/src/rerank.ts`、`packages/shared/src/rag-config.ts`、`apps/web/src/lib/rag/hybrid-retrieval.ts`、`apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts`、`apps/web/src/app/knowledge/_components/retrieval-debugger.tsx`。



---

## 详细功能清单与研发规格草案

### 1. `KB-FAQ-PAIR`：FAQ 标准问答对管理与精准优先短路 (P1 当前最高优先级)
- **行业痛点与背景**：
  长文本分块（Chunking 500~800 tokens）在应对规章制度、标准客服、常见业务定义等高频问题时，本质是**句子匹配段落（Sentence-to-Paragraph）**，常召回冗长无关上下文，导致大模型回答发散、抓不住重点甚至偶发幻觉。主流成熟方案（FastGPT、Dify 等）均以 FAQ 问答对作为精度压舱石。
- **核心方案**：
  1. **问答对管理**：知识库新增「问答对 (FAQ)」管理面板，支持手动创建、编辑标准问答（问题 + 答案 + 相似问/别名），支持 Excel/CSV 批量导入导出；
  2. **双路索引**：在 `@repo/db` 建立 `KnowledgeFaq` 模型，问题支持 jieba 中文词法分词与稠密向量化；
  3. **检索短路与加权策略**：
     - **短路阈值（如 Cosine $\ge 0.88$）**：直接命中权威标准答案，跳过长文本复杂检索与多轮推理，直接顶置返回或输出确定性答案（100% 准确、极低延迟与零幻觉）；
     - **强参考阈值（如 $0.75 \le \text{Cosine} < 0.88$）**：将该问答对以超高权重注入系统 Prompt，显式提示模型“优先采用官方标准口径”。
- **技术接缝**：`packages/db/prisma/schema.prisma`、`apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts`、`apps/web/src/app/knowledge/[id]/faq/`。

---

### 2. `KB-URL-INGEST`：网页 URL / 微信文章一键抓取与清洗 (P1 输入效率首选)
- **行业痛点与背景**：
  用户大量知识存在于技术博客、官方开发文档、微信公众号、语雀/Notion 共享链接中。当前知识库必须手动复制文本保存为 `.md`/`.txt` 再上传，录入链条冗长，抑制了知识库的丰富度。
- **核心方案**：
  1. **录入交互**：在上传弹窗中新增「链接导入」Tab，支持单个或批量输入 HTTP(S) URL；
  2. **安全防护**：复用现有的 SSRF 防线（私网 IP 拦截、DNS 重绑定防御、协议白名单）；
  3. **正文提取与降噪**：服务端基于 JSDOM / Readability 或无头解析，自动剥离导航栏、页脚与广告，提纯出标题与结构化 Markdown；
  4. **异步流水线**：生成虚拟 `Document`，存入 `sourceUrl`，入队 BullMQ 走标准切片与向量索引流程；全文抽屉支持“跳转原文链接”。
- **技术接缝**：`apps/worker/src/workers/rag-index/processor.ts`、`apps/web/src/lib/security/ssrf.ts`、`apps/web/src/app/knowledge/knowledge-workspace.tsx`。

---

### 3. `KB-DOCX-PARSE`：Word (.docx) 与结构化表格 (.xlsx / .csv) 解析 (P2)
- **行业痛点与背景**：
  企业日常办公文件大量为 `.docx` 合同制度与 `.xlsx` 报表数据。直接当作纯文本切块会导致表格行列结构被撕裂，丢失列名语义。
- **核心方案**：
  1. **.docx 解析**：集成 `mammoth` 提取大纲层级与标题路径（`headingPath`），保留粗体、有序列表与段落结构，统一转为 Markdown；
  2. **.xlsx / .csv 表格切片与表头上下文注入 (Header Context Injection)**：
     - 按行（Row-as-chunk）或切成小块 Markdown 表格；
     - 每一个切片首部自动注入**一级表头字段说明**与**工作表名称**，确保向量检索与语义切块时不丢失列语义。
- **技术接缝**：`apps/worker/src/workers/rag-index/parser.ts`、`apps/worker/src/workers/rag-index/table-parser.ts`。

---

### 4. `KB-RERANK-FUSION`：Rerank 二次精排模型集成 (P2 算法层)
- **行业痛点与背景**：
  目前的混合检索（RRF）虽然融合了词法与向量，但 RRF 本质是无监督的“倒数排名加权”，无法精确感知切片与 Query 之间的细粒度语义交叉关注。
- **核心方案**：
  1. 在 RRF 粗排召回 Top-20 候选切片后，引入 Cross-Encoder 架构的重排模型（如 BAAI/bge-reranker-v2-m3）；
  2. 对 Query 和每个切片计算交叉注意力打分，重新排序取 Top-5 交付模型生成；
  3. 显著压制长尾弱相关切片，降低 Prompt 噪音，提升复杂专业术语的命中率。
- **技术接缝**：`packages/providers/src/rag/rerank.ts`、`apps/web/src/app/api/chat/_lib/agent/tools/knowledge-search.ts`。

---

### 5. `KB-META-FILTER`：多维标签与元数据前置过滤 (P2 架构层)
- **行业痛点与背景**：
  当单知识库文档数量超过数百篇时，跨年份（2024 vs 2026）、跨部门（财务 vs 行政）、跨业务线的文档容易发生语义交织混淆。
- **核心方案**：
  1. `Document` 扩展 `metadata` JSON 字段，支持自定义标签键值对（如 `year: 2026`, `department: hr`）；
  2. 在 `knowledge-search` 工具中暴露 `filter` 参数；
  3. 大模型 Agent 在分析用户提问（如“查询2026年最新报销政策”）时，先通过 Function Calling 抽取过滤条件，在 SQL/向量检索阶段进行前置布尔过滤，收缩检索空间。
- **技术接缝**：`packages/db/prisma/schema.prisma`、PostgreSQL GIN 索引。

---

### 6. `KB-INSIGHT-GAP`：知识盲区分析看板与低置信度统计 (P3 运营层)
- **行业痛点与背景**：
  知识库搭建后，管理者无法获知终端用户常常搜不到什么，也无法知道哪些文档是从未被调用的冷数据。
- **核心方案**：
  1. 对话检索日志记录 `(query, maxScore, hitCount, isFallbacked)`；
  2. 定时统计低置信度（Score < 阈值 或未命中）的提问聚类；
  3. 在知识库中提供「盲区看板」：展示高频未命中词 Top 20、零引用冗余文档，生成“建议补充知识点”清单。
- **技术接缝**：`apps/web/src/app/knowledge/[id]/insights/page.tsx`。

---

### 7. `KB-CHUNK-TUNE`：切片策略可视化调节与效果预览 (P3 调优层)
- **行业痛点与背景**：
  不同格式和领域的文档，最佳切块大小（Chunk Size）与重叠（Overlap）差异显著。
- **核心方案**：
  1. 知识库级别或单文档上传时支持切片规则配置（字数切片、多级标题递归切片、按段落切片）；
  2. 提供切片调优抽屉，上传样本后实时展示分块边界、Token 估算和分词效果。
- **技术接缝**：`apps/web/src/app/knowledge/_components/chunk-tuning-dialog.tsx`。
