# 0029. Word (.docx) 与结构化表格 (.xlsx / .csv) 解析与表头上下文注入架构

* **状态**：已接受
* **日期**：2026-10-27
* **决策者**：AI 聚合平台工程团队
* **范围**：`packages/shared`（文件校验白名单扩展、表格切片与安全防线配置）、`apps/worker`（Word 语义提纯、Excel/CSV 结构化解析、表头上下文注入流水线）、`apps/web`（文件上传格式扩展、全文抽屉只读预览与原文件下载）

---

## 背景

在平台现有的 RAG 知识库体系中，已支持 PDF、Markdown、TXT 文本文件以及网页/微信文章 URL 抓取入库。然而，企业与办公场景中绝大多数核心制度文件、报表、名单与方案均以 **Word (.docx)** 与 **Excel (.xlsx / .csv)** 格式存在：
1. **直接当纯文本切块会导致语义撕裂**：表格若直接经过通用字符/段落切块器（如 `RecursiveCharacterTextSplitter`），行列对齐会被从任意逗号或换行斩断，后续切片彻底丢失表头，导致向量检索（Embedding）无法感知每列含义，大模型回答严重失真；
2. **轻量化单机容器资源的硬约束**：本平台部署于常规腾讯云单机容器（2C4G/4C8G），运行 Next.js、Worker、PostgreSQL pgvector 及 Redis。若直接引入重型全功能 Office 渲染进程（如 LibreOffice）或放任超大几十万行表格无限切分，将直接造成 Worker 内存暴涨（OOM 宕机）并快速打满单用户 20,000 切片总配额与 SiliconFlow 批量向量化速率限制；
3. **老旧二进制格式兼容陷阱**：97-2003 版本的旧格式（`.doc`、`.xls`）为复合二进制存储（OLE / BIFF），在纯 Node.js 生态中难以轻量、低内存、免外部 C 库解析，贸然支持将导致 Docker 镜像膨胀及安全隐患；
4. **前端渲染与切片高亮一致性**：若为 Word/Excel 引入独立的前端在线 Office 预览组件，不仅大幅增加 Web 首屏 bundle 负担，还会与现有的切片锚点聚焦（`CitationAnchorHighlight`）、平滑滚动及全文抽屉架构割裂。

---

## 决策

### 1. 严格限定现代格式白名单，前置友好拦截老旧格式

- **格式白名单扩展**：
  在 `packages/shared/src/rag-config.ts` 与上传组件中，将支持的文件扩展名由 `['.pdf', '.md', '.markdown', '.txt']` 扩充为包含：
  - `.docx`（Word 文档，`application/vnd.openxmlformats-officedocument.wordprocessingml.document`）
  - `.xlsx`（Excel 工作簿，`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`）
  - `.csv`（逗号分隔值，`text/csv`）
- **老旧格式防护拒绝**：
  对 `.doc` 与 `.xls` 实行前端与后端双重拦截，返回明确友好的中文文案：*“暂不支持老旧的 .doc/.xls 格式，请在 Office 或 WPS 中另存为 .docx/.xlsx 后重新上传”*，杜绝引入不可靠的本地二进制编译进程。

### 2. Word (.docx) 语义级提纯流水线

- **技术选型**：在 `apps/worker` 引入纯 Node 专注语义提取的 `mammoth` 库；
- **转换管道**：
  1. `mammoth.convertToHtml(buffer)` 提纯富文本语义，保留大纲标题（`<h1>`~`<h6>`）、加粗、有序/无序列表及内嵌表格；
  2. 剥离图片二进制数据（避免巨大 base64 污染切片与破坏 Token 预算）；
  3. 通过已有的 `turndown` + `turndown-plugin-gfm` 转为标准化 GFM Markdown；
  4. 顺畅复用成熟的 `parseMarkdownString` 流水线，自动提取标题栈层级（`headingPath`）并切块。

### 3. 表格 (.xlsx / .csv) 结构化解析与表头上下文注入 (Header Context Injection)

- **解析策略**：
  - `.csv`：直接复用已有轻量无依赖的纯 TS 解析逻辑，零额外开销；
  - `.xlsx`：在 `apps/worker` 引入轻量核心 `xlsx` (SheetJS) 库，只读提取单元格值，不解析复杂图表、宏与富文本样式；
- **多工作表 (Multi-Sheet) 分治**：
  - 自动跳过纯空 Sheet；
  - 每个有效 Sheet 视同独立章节，切片 `headingPath` 格式化为 `工作簿 > 工作表名称`；
- **Chunk-as-Table 自包含切块**：
  - 表格按数据行动态聚合（目标 500~800 Tokens，保证单切片自洽）；
  - **核心防脱落机制**：每个切片首部自动注入工作表标识与**完整表头行及分隔符**（Header Context Injection），紧接对应行数据，使每个切片均为独立合法的 Markdown 表格；
  - 单元格内换行符清洗为空格，全空行列自动剔除。

### 4. 结合本系统硬件现实的「轻量化防护规格」

针对单机容器与用户切片配额，设立硬性防御阈值：
- **单工作表行数上限**：有效数据行严格截断至 **前 500 行**；
- **单文档切片上限**：单文件生成切片数上限设为 **50 个切片**（超限时温和截断并在切片末尾追加说明，不抛错崩溃）；
- **最大列宽修剪**：优先保留前 **15 列**核心字段，防止宽表导致 Markdown 单行极端膨胀；
- **内存安全**：解析完成后主动释放工作表内存引用，确保单个文件处理 Worker 内存增量保持在 <150MB。

### 5. 双轨归一存储与全文抽屉极速直读

- **双轨存储模型**：
  - **原始文件保全**：对象存储完整保留用户上传的原始 `.docx`/`.xlsx`/`.csv` 二进制，全文抽屉顶部提供「下载原文件」操作；
  - **提纯 Markdown 缓存**：Worker 解析完成后，将提纯好的完整 GFM Markdown 文本作为衍生资源缓存落盘（`docs/{userId}/{documentId}/v{version}/content.md`）；
- **前端极速直读与切片高亮**：
  - 全文抽屉（`DocumentPreviewDrawer`）对于 docx/xlsx 统一作为 `'markdown'` 消费，零破坏兼容现有的 `<ReactMarkdown>` 与平滑滚动高亮（`CitationAnchorHighlight`）；
  - 表格原生适配移动端与窄屏横向滚动（`overflow-x-auto`），触控热区保持 $\ge 44\times 44\text{px}$ 规范。

---

## 影响评估与收益

1. **业务能力跃升**：系统补全了办公文件最核心的 Word/Excel 处理能力，问答可精准检索到表格明细数据及合同大纲条款；
2. **轻量可控**：严格的 500 行/50 切片/15 列截断与轻量库选型，让 2C4G 生产容器始终稳定无 OOM 风险；
3. **架构零裂变**：无论 Word、Excel、URL 还是 PDF，最终在消费端和切片层全部归一化为 GFM Markdown，极大收敛系统复杂度。
