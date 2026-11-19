# 0028. 网页 URL 与微信文档一键抓取入库及 SSRF 安全防线架构

* **状态**：已接受
* **日期**：2026-10-26
* **决策者**：AI 聚合平台工程团队
* **范围**：`packages/shared`（SSRF 防守守卫、URL 格式化与契约定义）、`packages/db`（Document 模型字段扩展）、`apps/worker`（异步网络拉取、微信/Readability 正文提纯、Markdown 存储及索引）、`apps/web`（外链导入弹窗、批量录入 API、全文抽屉外链跳转）

---

## 背景

在现有的 RAG 知识库体系中，用户已支持上传 PDF、Markdown、TXT 本地文件以及配置 FAQ 问答对。然而，企业与个人的大量核心知识分散在**微信公众号文章、技术博客、掘金/知乎专栏以及官方开发文档**中：
1. **人工搬运成本极高**：用户必须逐篇打开网页，手动复制正文再保存为本地文件上传，整个链条繁琐，抑制了知识库内容的积累；
2. **SSRF 安全风险极高**：开放用户输入任意 URL 并由后端服务端拉取，天然面临服务器端请求伪造（SSRF）的致命威胁，包括探测 `127.0.0.1` 本机端口、扫描内部私网网段（`10.0.0.0/8`、`192.168.0.0/16` 等）以及利用 DNS 重绑定（DNS Rebinding / TOCTOU）或 302 重定向穿透内部云元数据（如 `169.254.169.254`）；
3. **SPA 与无头浏览器资源开销过大**：直接在 Worker 中常驻或启动 Headless Chromium（Playwright/Puppeteer）会导致 Docker 镜像激增 400MB+，单次渲染消耗 150MB+ 内存，在 2C4G 等常规生产节点极易诱发 OOM 崩溃，且冷启动耗时过长；
4. **网页格式嘈杂与微信私有特性**：普通网页包含大量顶栏、侧边推荐、底部版权与广告噪音；微信公众号文章具有特殊的 DOM 结构（`#activity-name`、`#js_content`）且图片采用 `data-src` 懒加载，直接爬取往往拿到一堆空白或破碎样式。

---

## 决策

### 1. Worker 全异步抓取与处理流水线

- **前端/API 极速返回**：API 路由仅做 URL 基础语法与初步安全快速筛查，校验通过后立即在数据库创建 `status='pending'` 的 `Document`，记录 `sourceUrl` 与 `sourceType='url'`，并向 BullMQ `rag-index` 队列投递轻量抓取任务（耗时 <200ms），彻底杜绝前端 HTTP 超时；
- **Worker 闭环状态机**：由 `apps/worker` 负责：网络抓取 $\rightarrow$ 专有正文清洗 $\rightarrow$ 转换 Markdown 存入对象存储 $\rightarrow$ 复用现有切片与向量化逻辑 $\rightarrow$ 标记 `ready`。遇网络超时、反爬拦截或正文为空时，更新状态为 `failed` 并持久化记录友好的中文失败原因。

### 2. 纯 Node 专有提取器 + Readability + Turndown 降噪引擎

- **拒绝重型无头浏览器**：全面采用纯 Node 轻量流水线，彻底规避 Chromium 的内存与启动负担，支持毫秒级提纯；
- **微信文章专属适配器 (`WechatArticleAdapter`)**：
  - 精确命中 `#activity-name`（标题）与 `#js_content`（主体容器）；
  - 剔除 `#js_profile_qrcode`（公众号引导关注）等噪音元素；
  - 自动将所有 `img` 的 `data-src` 属性重写为标准 `src`，保留原始图文排版语义；
- **通用网页智能提取**：采用 `@mozilla/readability` 配合 `jsdom`，基于段落文本密度与启发式打分自动剥离广告、导航与页脚；
- **结构化 Markdown 转换**：使用 `turndown` 配合 GFM 插件，将提取后的 Clean HTML 转换为标准 Markdown，保持标题层级（`#`、`##`）、代码块、引用与表格语法。

### 3. 下沉与强固 SSRF 连接级防御体系 (`GuardedWebFetch`)

将已在 Web Agent 中验证的安全能力下沉至 `@repo/shared/security/ssrf`，建立 fail-closed 双重锁：
- **字面量白名单校验**：仅放行 `http:` 与 `https:` 协议；拦截 `localhost`、`*.local`、`*.internal` 等危险主机名，拦截 IPv4 点分十进制及 IPv6 内网字面量；
- **连接级 DNS 校验同源绑定 (DNS Pinning via Custom Lookup)**：
  - 基于 Node 原生 `http`/`https` 模块的 `lookup` 回调，在 Socket 实际握手前由 `guardedLookup` 校验解析出的每一个物理 IP（拦截 `10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`、`169.254.0.0/16`、`::1` 等）；
  - 验证的 IP 即为实际发起 TCP 握手的 IP，从根本上杜绝 DNS 重绑定（TOCTOU 漂移）攻击；
- **逐跳重定向安全复核**：最多跟随 5 跳重定向，每一跳的 Location 必须重新经由上述全套安全防线校验，防范 302 跳入私网；
- **资源截断防护**：单次请求连接超时 5s、总超时 15s；响应体最大截断为 2MB，防止巨型文件耗尽内存；伪装真实桌面 Chrome 标头降低合法访问误杀率。

### 4. 数据模型与全文抽屉/引用溯源一体化

- **Prisma Schema 扩展**：
  - `Document` 新增 `sourceUrl String? @map("source_url")` 与 `sourceType String @default("file") @map("source_type")`；
- **存储与切片体系 100% 归一**：
  - 清洗出的 Markdown 统一作为标准文件存入 Storage（`docs/{userId}/{documentId}/v{version}/{safeTitle}.md`）；
  - 现有的切片、分词、BGE-M3 向量化事务完全无需修改即可复用；
- **全链路溯源增强**：
  - 文档卡片与全文预览抽屉（`DocumentPreviewDrawer`）识别 `sourceType === 'url'` 时，展示「跳转原文」外链操作，提升知识溯源透明度。

### 5. 前端批量录入交互与容量门禁

- **操作入口**：知识库「文档管理」Tab 顶栏新增「导入网页」操作按钮；
- **录入规范**：支持单次输入 1~10 个 HTTP(S) URL（换行分隔）；输入框实时检测合法链接数，对微信链接提供专属高亮提示；
- **容量强门禁**：严格受单知识库 50 篇总文档与 20,000 切片配额约束，超限即拦截；全流程对齐移动端 $\ge 44\text{px}$ 触控规范。

---

## 影响与后果

### 收益 (Positive)
1. **极大丰富知识沉淀路径**：用户一键粘贴微信文章或开发文档链接即可秒级入库，省去手动复制粘贴的繁琐心智负担；
2. **生产级安全无虞**：下沉 `@repo/shared` 的连接级 DNS Pinning 彻底封死 SSRF 与重绑定漏洞；
3. **轻量低耗**：纯 Node 架构避免无头浏览器引入的高额内存消耗与 Docker 镜像膨胀，极度适合资源受限的云环境；
4. **溯源体验一致**：抓取文章与本地文件在全文预览、引用高亮与搜索调试体验上完全对齐。

### 代价与权衡 (Trade-offs)
1. **不支持重度 CSR 单页**：对于极少数纯客户端 JS 异步渲染数据且无 SSR 的 SPA 页面，Readability 提取出的正文可能较短或不完整（但覆盖了 95% 以上的微信文章、技术博客与权威文档，该取舍完全合理）；
2. **外部网络波动**：目标站点的反爬风控（如 Cloudflare 5s 盾或人机验证）可能导致抓取失败，需通过明确的失败状态与中文原因提示用户。

---

## 修订记录

### 2026-11-16 修订：URL 存储 key 以实际布局为准（C7）

ADR-0053 局部取代本 ADR 第 4 节的 URL key 示例：实现与后续兼容布局使用 `docs/{userId}/url-{timestamp}-{random}/v1/content.md`，不改为预生成 Document ID 的 `{safeTitle}.md` 形状，也不迁移旧对象。理由是避免为目录形状统一改变 ID 生成、上传与事务时序。URL 抓取、SSRF 防御、Markdown 提纯与 `sourceUrl` 外部溯源决策不变；`originalUrl` 与 `sourceUrl` 的预览语义由 ADR-0053 补充。
