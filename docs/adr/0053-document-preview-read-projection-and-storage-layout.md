# 0053. DocumentPreview 读取投影、SourceFormat 派生与文档存储布局（评审 C7）

* **编号**：ADR-0053
* **状态**：已接受
* **日期**：2026-11-16
* **决策者**：AI 聚合平台工程团队
* **范围**：`packages/shared` 文档存储布局纯契约、`apps/web` 文档入库与 DocumentPreview 服务端读取投影及 Drawer、`apps/worker` RAG 解析器选择与提纯缓存写入

---

## 背景

评审报告 C7（`docs/reports/2026-11-10-core-architecture-review.md` 第九节）确认：原件 key、提纯 `content.md` key 与文件类型识别分别由上传、URL、Artifact、Worker 和预览路由维护。预览从 `Document.name` 猜格式，失败态与成功态使用不同的类型映射；CSV 的接口 `content` 仍读原始逗号文本，DOCX/XLSX 在提纯件缺失且切片为空时会返回 ready 空白页。C1 已收拢 `deriveParsedContentKey`，但 Worker 与预览仍各自保留存储布局规则。

经十一问拷问，本决策明确 SourceFormat 的事实权威、正文与状态投影、内部 DTO、Worker 解析输入和写侧缓存边界。目标不是统一所有物理目录或重做文档解析，而是让入库、Worker 与预览共享同一布局契约，让读取政策从路由下沉为可测试的投影。

## 决策

### 1. SourceFormat 是派生事实，不新增持久化格式字段

- SourceFormat 表示源资产格式，与 `Document.sourceType`（来源渠道）和 RenderMode（预览渲染方式）分离。
- `file` 文档从 `storageKey` 文件名段的扩展名派生，`.markdown` 归一为 `md`；`url` 与 `chat_artifact` 的源资产为归一化 Markdown。
- 不从 `Document.name` 或展示标题派生格式；无法识别时为 `unknown`，不得静默默认 Markdown。
- 不新增 Document 列，不写入 `Document.metadata`，不进行 schema 迁移或历史格式回填。未来若存储 key 不再编码格式、支持文件重命名或需要数据库层格式筛选，再重新评估持久化字段。

### 2. DocumentStorageLayout 与 DocumentPreviewProjection 分层

- `packages/shared` 的 DocumentStorageLayout 是纯契约模块，拥有三类现有 key 构造、SourceFormat 派生、parsedContentKey 派生及“是否需要衍生正文”的共享规则；不得依赖 Prisma、StorageProvider、Buffer、Node SDK 或环境变量。
- 保留三类现有物理 key 形状、Document ID 生成方式、上传与事务时序，不移动旧对象：
  - file：`docs/{userId}/{documentId}/v{version}/{safeFileName}`；
  - URL：`docs/{userId}/url-{timestamp}-{random}/v1/content.md`；
  - Artifact：`docs/{userId}/artifact-{timestamp}-{random}/v1/content.md`。
- C1 的 `deriveParsedContentKey` 只保留一个定义，原导入位置通过转出口兼容；构造与派生必须有往返测试。
- DocumentPreviewProjection 位于 `apps/web` 服务端，拥有状态门控、正文来源、回退、源资产下载、切片计数和读取失败政策。路由只保留认证、知识库/文档归属校验与 HTTP 映射。
- 预览 chunks 查询从路由下移投影；不为单一调用者新增 ChunkStore API。实施时同步把 `chunk-store.ts` 的注释对齐到真实约束：向量与全文检索列必须经该模块，普通预览字段不强制增加仪式性间接层。

### 3. ready 正文来源与回退矩阵

| SourceFormat | 首选正文 | DocumentBodySource | 首选源不可用或 `trim()` 后为空 |
| --- | --- | --- | --- |
| `md` / `txt` | `storageKey` 源资产 | `stored` | 当前版本 chunks |
| `docx` / `xlsx` / `csv` | parsedContentKey 指向的提纯 Markdown | `derived` | 当前版本 chunks |
| `pdf` | 当前版本 chunks | `chunks` | 无其他文本回退 |
| `unknown` | 当前版本 chunks | `chunks` | 不把未知对象按 UTF-8 解码 |

- URL 与 Artifact 已由 SourceFormat 归为 `md`，其 `storageKey` 本身就是归一化 Markdown，不再按 sourceType 写正文特判。
- chunks 是逐片视图，允许表头与工作表上下文逐片重复，不冒充连续全文。
- ready 且当前版本 chunks 非空时，Drawer 始终优先逐片渲染 chunks，以保留引用锚点和高亮；`content` 仅在 chunks 为空时作为连续正文呈现。chunks 不只是首选源失败后的回退。
- 保留 ADR-0029 的 500 行、50 切片、15 列防线，不在 C7 调整解析算法或限制。
- CSV 变化只统一接口正文契约与无切片降级；当前 Drawer 在 ready 且有 TableChunk 时已经渲染 GFM 表格，不宣称本决策已证实检索质量或预览体验提升。

### 4. 状态门控、源资产下载与读取失败

- 只有 ready 才查询当前版本 chunks、读取正文并产生 DocumentBodySource/RenderMode。
- pending、processing、failed 返回 HTTP 200 的真实状态事实、`content=''`、`chunks=[]`；failed 保留结构化中文失败原因，不改成 HTTP 404/500。
- `sourceType='file'` 在所有状态都独立、best-effort 生成当前版本原件签名 URL，包括索引中与失败文档；签名失败只令链接为空，不修改文档状态或让正文预览失败。
- URL 非 ready 不为尚未保证存在的 `content.md` 签名，只保留 `sourceUrl`；ready 后可同时提供外部原文地址与 Markdown 快照地址。Artifact 正常同步成功即 ready，其 `originalUrl` 指向 Markdown 源资产快照，同样只做 best-effort 签名。
- `sourceUrl` 永远表示外部网页地址；`originalUrl` 永远表示对象存储源资产，二者不互相替代或回退。本轮不增加 HEAD 存在性探测。
- 存储适配器返回相对地址时，`originalUrl` 映射为当前文档的同源认证下载路由；浏览器通过认证请求取得原字节并保存，绝对 HTTP(S) 签名 URL 原样直链使用。下载路由只按归属校验后的数据库 storageKey 读取，未登录 401，越权/不存在/软删除 404，合法响应保留原字节与 UTF-8 文件名。
- ready 文档首选正文与 chunks 都不可用或为空时，统一走现有 HTTP 500 中文读取错误；不得篡改 `Document.status`，不得返回 200 空白页，不新增 `previewStatus`。
- ADR-0025 的 CitationSnapshotFallback 继续由请求失败驱动：聊天入口有快照时降级展示，知识库入口显示读取错误与重试；不为 200 unavailable 新增第二套兜底条件。

### 5. content 内部 DTO 一次性按新语义收口

- 删除预览 DTO 的 `fileType`，不保留兼容别名；无关上传 MIME 与反馈附件字段不受影响。
- `sourceFormat` 全状态返回，驱动格式徽标与原件/PDF 下载语义。
- `renderMode` 仅 ready 返回，只区分 `pdf-chunks` 与 `markdown`；非 ready 不承诺渲染方式，`unknown` 只属于 SourceFormat。
- DocumentBodySource 仅留在服务端投影和测试中，不暴露到 HTTP。
- `content` 只在 `stored/derived` 时承载连续正文；chunks 回退及 PDF 切片响应中 `content=''`，正文只由 `chunks` 表达，禁止继续返回 chunks 的 `join` 冒充全文。
- `chunkCount` 为 `number | null`：ready 使用本次当前版本 `chunks.length`，非 ready 为 `null`；Drawer 必须显式隐藏 `null`，不能用 `?? 0` 把“不适用”变成零。
- 主表 `Document.chunkCount`、文档列表计数与 Worker 计数生命周期不在本轮修改；若未来 chunks 分页，需另行定义总数，不能拿当前页长度冒充总数。
- 除 `fileType` 外，既有 `id/status/version/name/errorMessage/content/chunks/originalUrl/sourceType/sourceUrl` 等事实字段保留；本轮只替换 `fileType` 并新增 `sourceFormat/renderMode`，不顺带收窄其他 DTO。
- 传输类型位于无服务端依赖的纯契约模块，Drawer 不得 import DocumentPreviewProjection 实现。该内部认证接口在仓库内唯一生产消费者是 Drawer，因此不为假想外部客户端维护双字段；若后续确认存在外部消费者，需单独设计兼容迁移。
- 不修复历史 `Document.chunkCount` 漂移，不做回填、重算迁移或一次性修复脚本。

### 6. Worker 与预览共用 SourceFormat

- Processor 使用 `jobData.storageKey` 与文档来源派生 SourceFormat；`Document.sourceType` 优先，`jobData.sourceType` 兼容回退，最后按 file-like 处理。
- 必须使用与实际下载 buffer 同源的 `jobData.storageKey`，不得使用可能已指向重传新版本的 `document.storageKey`。
- Parser 只按 SourceFormat 选择解析器；fileName 只保留 Word/表格标题、工作簿上下文、日志与错误语义。
- 删除 Processor 为 URL 标题合成 `.md` 后缀的解析变通逻辑，真实标题继续用于文档名称与上下文；不新增队列字段。
- 未知 SourceFormat 抛 `DocumentParseError(..., true)`，沿用永久性不支持格式失败，不默认按文本解析，也不进入瞬态重试。
- 不保留长期从文件名猜格式的生产兼容包装；直接 Parser 测试迁移为显式 SourceFormat，夹具必须同步维护 fileName 与 storageKey。

### 7. 衍生缓存写侧与 parsedContentKey 存在性语义

- 只有需要衍生正文的 SourceFormat（当前为 DOCX/XLSX/CSV）写入额外 `content.md`；Worker 写入与预览读取共享该规则。
- 新索引与重传的 MD/TXT 不再额外上传重复 `content.md`，但其 fullMarkdown 仍用于解析与大纲。
- 历史对象全部保留，不扫描、不删除、不迁移；URL 仍写自身 `storageKey`，Artifact 同步入库政策不变。
- C1 的 parsedContentKey 继续无条件派生：它只表示“衍生缓存位置”，不承诺对象存在，也不表示该格式应读取衍生件；SourceFormat 不进入切片 metadata。
- MD/TXT 少一次对象写入与一份重复文本仅是机制描述，未经账单或性能对照，不表述为已量化收益。

### 8. 归一化预览的用户披露

- ready Drawer 对 DOCX/XLSX/CSV 显示静态、按 SourceFormat 分类的中文只读说明：DOCX 披露图片与原版式可能未保留；表格披露可能未展示全部工作表、行或列；两者都说明完整事实以原件下载为准。
- 该说明不依赖 DocumentBodySource，因为 derived 与 chunks 都是归一化视图；保留现有 500 行行内提示。
- 不新增精确 truncated、行数、列数、工作表数诊断，不修改 Table Parser、Document.metadata 或 `content.md` 协议。
- 这是透明性机制，不宣称已证明 UX 收益；精确诊断需由用户反馈、数据审计或可用性证据另行立项。

## 取代与修订

- **取代旧评审未批准建议**：`docs/plans/2026-10-28-rag-architecture-review.md` 候选 3 曾建议“入库时持久化文件类型”。本决策依据现有 `sourceType + storageKey` 已能稳定表达格式、无数据库格式筛选需求，拒绝 schema、回填与双事实漂移成本，改为共享派生；旧评审无需改写为已批准决策。
- **局部取代 ADR-0028 第 4 节的 URL key 示例**：原示例 `docs/{userId}/{documentId}/v{version}/{safeTitle}.md` 与当前实现漂移。本决策确认保留实际 `url-{timestamp}-{random}/v1/content.md` 形状，避免预生成 ID、改变上传事务或迁移旧对象；URL 抓取、SSRF、防御与 `sourceUrl` 溯源决策全部不变。
- **补充 ADR-0029**：CSV 纳入 derived 预览，MD/TXT 停止额外衍生缓存；500/50/15 防线、原件保全和 Markdown 消费原则不变。DocumentPreview 对 Word/表格是归一化核对视图，不再暗示原样 Office 阅读器。
- **补充 ADR-0032**：B 层 parsedContentKey 仍无条件派生，但只表示位置、不承诺存在；键分层与原地合并不变。
- **补充 ADR-0034**：Artifact 同步进程内入库不变，其源资产为 Markdown 快照。
- **保持 ADR-0025**：引用快照兜底仍由请求错误驱动，不新增成功响应的错误语义。

## 备选方案及否决理由

1. **Document 新增 SourceFormat 列或写入 metadata**：需要迁移、回填和写点同步；列与 key 可能漂移，metadata 还混入用户可编辑面。当前无独立持久化需求，否决。
2. **统一所有新文档为 Document ID 物理目录**：URL/Artifact 需预生成 ID 或改变上传与事务时序，旧形状仍需长期兼容；无路径 ACL、生命周期或按文档清理需求支撑，否决。
3. **ready 无正文返回 200 `previewStatus='unavailable'`**：为不变量破坏症状新增正常产品状态、DTO 与第二种快照兜底；优先复用现有错误通道，根因另修，否决。
4. **保留 fileType 别名与聚合 content**：只有在确认外部客户端时才有过渡价值；否则双字段与 bodySource 语义长期并存，否决。
5. **迁移知识库列表格式徽标或扩展列表 DTO**：列表当前正常数据展示正确，且不参与解析、检索或预览；为避免全仓展示层扫除，明确留作后续独立小项。
6. **精确截断诊断、MIME/文件头嗅探、历史对象清理**：分别需要跨层诊断协议、新的识别冲突政策与不可逆存储生命周期；当前证据不足，均不纳入。
7. **为预览普通字段新增单调用者 ChunkStore 查询**：没有 Unsupported 列或第二消费者，增加的只是间接层，否决。

## 非目标与已知限制

- 不修复旧 RAG 任务缺少版本护栏的竞态；ready 无正文的 500 只让症状可见，不替代报告第十节的独立正确性修复。
- 不修改文档列表 name 格式启发式、列表 chunkCount 或列表 API 字段选择。
- 不统一物理 key、不修改 Document ID、不新增 DB 列、不移动或删除旧对象。
- 不调整解析算法、表格防线、引用锚点、Artifact 同步入库、URL SSRF 或计费政策。
- 不处理 URL 初始 job fileName 与切片继承标题的既有差异；它属于 C1 元数据事实的独立后续项。
- 不承诺签名 URL 经 HEAD 验证后必然可下载，也不为 Artifact 备份增加存在性字段。
- ready 无正文 500 无法同时携带 originalUrl；若根因修复后仍有持续需求，再评估结构化不可用状态。
- 文档列表与预览在异常数据上的 chunkCount 可能不同：前者仍读主表缓存，后者只描述实际投影。

## 实施与验收约束

本决策按慢车道 epic 管理，默认串行垂直切片，不自动并行实现代理：

1. 先建立特征与红灯矩阵：失败 DOCX、pending URL、CSV/derived 回退、ready 空正文、陈旧 chunkCount、MD/TXT 冗余写入与 DTO 状态矩阵。
2. Shared DocumentStorageLayout 纯契约与往返测试，保持运行行为不变。
3. Worker SourceFormat 解析输入、URL 合成后缀移除与 derived 写入门控。
4. 预览纯传输契约、DocumentPreviewProjection、路由、Drawer 与 DTO 必须在同一切片形成编译闭环。
5. DOCX/XLSX/CSV 静态披露、完整单元/集成测试与真实浏览器验收。

触及知识库上传/索引/预览及聊天引用核对核心链路，交付前必须执行真实浏览器验收：至少覆盖 ready 表格预览与原件下载、失败 DOCX 下载、URL 处理中/就绪、PDF 切片与原版、MD/TXT 重传、聊天引用高亮及读取失败快照兜底，并检查窄屏抽屉与下载热区。QA 计划、证据与双轴审查由后续 spec 和 Schema 4 qa-plan 固化；本 ADR 不构成实施或交付授权。
