# 工具脚本

## init.sh

初始化项目，包括：
- 检查环境依赖
- 安装 npm 包
- 启动 Docker 服务
- 初始化数据库
- 创建环境变量文件

```bash
bash tooling/scripts/init.sh
```

## clean.sh

清理项目，删除所有 node_modules、构建产物等。

```bash
bash tooling/scripts/clean.sh
```

## dev.mjs

本地开发启动脚本，包括：
- 加载 `apps/web/.env.local` 作为 Web 与 Worker 共享环境
- 输出关键环境状态（仅显示 `SET/UNSET`，不打印真实密钥）
- 检查本机 `Redis` 是否可用
- 若检测到本地 `redis-server`，则尝试后台启动
- 若检测到 Homebrew 已安装 `redis`，则尝试 `brew services start redis`
- 若本机安装了 Docker，则可回退执行 `docker compose up -d redis`
- 启动前清理旧的 `turbo dev` / `worker tsx` 进程，避免多套进程抢任务
- 启动 `@repo/web` 与 `@repo/worker` 的开发进程

```bash
pnpm dev
```

推荐只使用根目录 `pnpm dev` 启动本地联调，不要并行手工执行 `pnpm dev:web` 与 `pnpm dev:worker`。

## qimen-check.mjs

奇门链路本地自检脚本：
- 先请求 `/api/destiny/qimen/analyze/start`
- 再轮询 `/api/destiny/qimen/analyze/sections/baseResult`
- 若失败，直接输出状态与错误信息

```bash
pnpm qimen:check
```

## seed-docs-corpus.mts (RAG 首发语料导入种子脚本)

将本仓库 `docs/` 目录下的核心技术 Markdown 文档（roadmap、19 份 ADR、project-guide、qa-workflow 系列等）通过正常上传管道（同用户界面上传同一入口）批量入库为一个「工程文档」知识库并索引至全部就绪：
- 严格遵循鉴权、格式校验与单库 50 篇限额
- 支持幂等重跑与 `--reindex` 单调版本更新
- 内置自动化抽查验证（ADR-0008、ADR-0014、连败熔断等词法全文检索命中校验）

```bash
# 默认模式：幂等复用已就绪文档
pnpm rag:seed

# 强制重传模式：递增版本 (version+1) 并原子替换切片
pnpm rag:seed --reindex
```

## 基础设施命令

```bash
pnpm infra:up
pnpm infra:down
pnpm infra:logs
```

适合团队协作、联调和更贴近生产的本地环境。

## QA 工作流脚本

### qa-check.mjs

通过 `node tooling/scripts/qa-check.mjs <plan|acceptance|review> .scratch/<feature>`（或项目已有 `pnpm qa:check -- ...` 快捷方式）显式检查计划、验收或审查；`gate-plan-*` 与 `gate-acceptance-*` 门禁日志必须经 `qa-run` 直接调用 `node .../qa-check.mjs` 生成，快捷方式生成的 argv 不会被门禁识别。实现按 `OPT-14` 拆分为 `tooling/scripts/qa-check/` 下 6 个无环子模块（`plan.mjs`、`script-scan.mjs`、`provenance.mjs`、`spec-coverage.mjs`、`acceptance.mjs`、`review-triage.mjs`）+ 薄入口 `qa-check.mjs`。只接受 Schema 4：核对断言标记、用例绑定、全状态对账、确定性过程脚本引用闭包（含 `# script:` 头字段与 `SCRIPT_DIR`/变量赋值闭包）、审查来源、Claude Code 0 子代理硬拦截（`REVIEW_PROVENANCE_UNVERIFIED`）与交付验证事件时间；统一实行 challenge 单轨协议，缺失或损坏 `_qa/review-challenge.json` 时阻断为 `MISSING_REVIEW_CHALLENGE`，有效 challenge 下校验 `.source.json` 并输出「来源核验」强度行（转录（强）／自述凭据（弱）／未核验（人工））；核对 `_qa/round-snapshots/r<n>/manifest.json`（审查途中修改代码/术语/`spec.md` 即报 `SUPERSEDED`）；支持 `QA Review Coverage: 1|2`（v2 在 `acceptance` 阶段生成按过程脚本/测试聚合的 `reviewUnits`、并写入 `evidenceTree` 与剔除 `## 交付验证` 的 `qaPlanDigest`，未改动存量非高风险回归标 `sampled`，`r2+` 同哈希已核实单元自动标 `inherited`）；全版本要求源码引用命中目标行前后 `±5` 行真实测试或断言谓词；检测跨轮重复起号冲突（`FINDING_ID_COLLISION`）与最新轮未复审发现错标「已修」（`UNREVIEWED_FIX_CLAIM`）；默认自动上限收紧为 `r2`（超过或达上限未闭环时输出 `暂停终态: WAITING_HUMAN` / `PACKAGE_INVALID` / `WAITING_INFRA` 与含 `## 双轴分歧对照` 的人工决策包）；其他 Schema 报 `UNSUPPORTED_SCHEMA`。

### review-package.mjs

改代码前用 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径...>` 建立基线并冻结计划，需要扩大范围时用 `add`，审查时默认先执行 `qa-preflight` 静态预检（可用 `--skip-preflight` 应急跳过）与 2 秒只读可封存性预检（核对 `_qa/spec-review-checklist.json` 的 `evidenceTree`、`qaPlanDigest` 与同树 `gate-acceptance-*.log`，放行合法 `ASSERTION_BLOCKED`，旧验收、失鲜清单或必审行缺谓词候选均按 `PACKAGE_INVALID` 阻断；不在 `collect` 内重跑 acceptance），再由 `collect`（默认拒绝 `r3+`，人工授权追加须显式传 `--allow-manual-round`）生成含 Rename 折叠的 `review-package.diff`、`_qa/round-snapshots/r<n>/` 轻量不可变快照、`r2+` 相邻快照机器差量 `_qa/review-package-delta.diff`、`< 3 KB` 结构化 `_qa/review-brief.md`、含 `renames`/`snapshotDir` 的 `review-package.json` 及带全历史编号登记（`reservedIds`/`nextIds`）的 `_qa/review-challenge.json`。审查子代理写完原文后用 `seal` 基于当轮不可变快照同步校验编号（含跨轮碰撞）、`--pending-ids` 与 Spec 对账覆盖，并输出类型化错因（`REVIEWER_EDITABLE` / `PACKAGE_INVALID`）；已有凭据时重复 seal 继续失败且不改写原文、凭据或轴状态，后续失败不得把 `returned` 降级。`scaffold-report` 根据 `review/` 全部原文自动生成无漏项分流骨架（跨双轴时附 `## 双轴分歧对照` 引导块）；`digest` 输出当前范围 tree；这些命令均不改变 Git index，机器状态写入特性目录的 `_qa/`，禁止手改。

`OBS-1` 在 challenge、manifest 与 `.source.json` 记录轻量字段：`nonce`、`round`、`axis`（双轴集合存于 `axes`）、`snapshotHash`（快照 manifest 字节的 SHA-256）、`diffBytes`（实际 Diff 字节数）、`sealAttempts`（每轴 seal 尝试数）、`terminalState`/`errorClass` 与 `reviewUnits{total,inherited,verified}`（`total` 为单元总数，`inherited` 为合法继承数，`verified` 为合法继承或本轮明确核实数；collect 时未核实单元不计入 `verified`， sampled 单元不计入明确核实）。`dispatchedAt` 是 collect 发放 challenge 的代理时间，`startedAt`/`completedAt` 是该轴首次 seal 尝试与最终 seal 的事件时间，均不冒称模型真实派发、开始工作或推理时长；审查关键路径墙钟按 collect 的 `packagedAt` 到双轴最晚 `completedAt` 计算并注明该口径，不用首次 seal 到最后 seal 的差值冒称审查耗时。`repairAndWaitMs` 是本轮 `packagedAt` 距上一轮各轴最晚 `completedAt` 的毫秒数，首轮为 0。旧包缺少这些可选字段时仍按原契约读取，不重写历史快照。

### qa-run.mjs

使用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>`（或 `--script <path>` / `--executor <ego-browser|node|sh> --script <path>` 通过 stdin 驱动 `ego-browser nodejs` 并写入 `# executor:` 与 `# script:` 头字段）真实执行并记录 argv、HEAD、tree、时间和退出码；Node.js `<22` 在目标命令启动前失败，头部记录真实 `# node:` 版本。头部另记录 challenge 的 `nonce`、`round`、`snapshotHash`，无对应上下文时写 `none`；普通命令没有审查轴语义，`axis` 与 `dispatchedAt` 不伪造。尾部记录 `terminalState`、`errorClass`、`durationMs`（本命令从 started 到 finished 的实际墙钟毫秒数）与 `repairAndWaitMs`（继承 challenge 中本轮修复与审查等待毫秒数，无该上下文时为 0，不与命令耗时混算），新旧日志均可由 `parseRunLog()` 读取。日志位于特性 `evidence/` 且不可覆盖，失败或旧证据需换新标签。qa-run 自身错误统一以 `[qa-run][ERROR]` 写入 stderr，被测命令输出不加此前缀；调用方必须检查本次命令退出状态，不得用旧日志末尾代替本次结果。日志里的 `tree` 是**行为证据树**：只忽略根 `GLOSSARY.md`、`CONTEXT.md`、各目录 `README.md`、`docs/adr/` 与 `docs/features/` 中的 Markdown；其他 Markdown 默认计入，尤其保留源码旁由业务、构建或测试运行时读取的内容。豁免路径不得作为运行时内容源，且仍进入审查包 diff。

### dev-port.mjs 探活

使用 `node tooling/scripts/dev-port.mjs --probe --wait 90` 按端口决议范围寻找标题为 AI 聚合平台的服务；标题匹配后再校验首页引用的首个 `/_next/static/` JS chunk 返回 200，拦截 HTML 200 但前端资源全 404 的半死 Next 服务。标题不匹配时不要关闭其他进程；未找到时按输出启动 `pnpm dev:web` 后重试。

### qa-spec-review.mjs

Schema 4 的 Spec 审查覆盖清单与原文校验共享纯函数模块：`specReviewChecklistDocument()` 序列化与解析 `_qa/spec-review-checklist.json`（支持 `v1` 五列与 `v2` 四列 `required` 必审分级，并记录 `evidenceTree` 与 `qaPlanDigest`），`computeQaPlanDigest()` 计算剔除 `## 交付验证` 后的计划摘要，`parseRunLog()` 与 `isFreshAcceptanceGateLog()` 提供无循环的日志解析与同树验收门禁判定（PASS 或仅含合法 `ASSERTION_BLOCKED`），`specReviewSkeletonDocument()` 生成预填骨架 `_qa/spec-review-skeleton.md`（同一单元按 changed 拆行），`parseSpecReviewCoverage()` 解析 `## 对账覆盖` 表格，`parseFindingDefinitions()` 只登记标题主编号与历史行首方括号，`parseFindingResponses()` 另兼容只用于复审的方括号编号引用，`citationIsValid()` 与 `validateReviewReportForSeal()` 统一承载 `±5` 行谓词引用及封存前同步校验，由 `qa-check.mjs` 与 `review-package.mjs` 直接导入。

### qa-preflight.mjs

1 秒本地确定性静态预检 CLI（`node tooling/scripts/qa-preflight.mjs <feature-dir> [--strict]`），默认挂载在 `review-package collect` 前执行：ERROR 级拦截 `scripts/` 字面永真伪断言、`spec.md`/`qa-plan.md` 交付命令不一致或空操作占位、三档分流非法枚举与缺列；WARN 级提示 Diff 增量纯英文注释、非白名单十六进制色值、交互按钮 `<44px`、新 `font-[var(--font-` 任意值类、与 `@/lib/constants/surface-styles` 重名常量及未登记新路由（`DESIGN_ROUTE_UNREGISTERED`，`--strict` 将 WARN 升级为阻断）。共享常量源不存在但新增大写常量时以 `SURFACE_CONSTANTS_UNAVAILABLE` 明示无法检查；路由登记可来自功能面表格或 §10 后续公开示例的 `app/<route>/` 路径。`qa-check plan` 另对测试命令中的零测试目录报 `EMPTY_TEST_DIRECTORY`，`parseBinding` 对整段反引号误写给出准确行号与单行修正。明确仅清除静态违规，不替代 Spec 语义核对与人工终审。

### qa-browser-helper.mjs

阶段 5 浏览器验收的仓库级薄辅助模块：`resolveRepoRoot()` 从模块位置解析仓库根，`resolveBaseUrl()` 优先读取 `QA_WEB_URL`、否则调用 `dev-port.mjs --probe`，`acquireQaPage()` 按 TaskSpace ownership 接管或新建页面，`createMarker().assertNoRateLimit()` 默认拦截 HTTP 429 与「请求过于频繁」页面。`captureTargetGeometry()` 在弹层预清理和几何硬断言后优先对同一 target 使用元素 `locator.screenshot()`；退化路径通过 `cropPngViewport()` 以纯 `node:zlib` 按 DPR 裁剪完整视口 PNG，支持 Chromium 常见的 8 位 RGB/RGBA，不依赖 `sips` 或错误 `clip`。`assertValidTargetPng()` 校验尺寸、非透明像素方差与目标像素哈希，`captureMobileGeometry()` 增加移动视口设置并在 `finally` 复位。精确 `390px` 且含真实点击时优先原生 Playwright，仅复用桌面登录态时使用 `ego-browser`；只封装通用机制，不绑定业务选择器。

### 工具测试

运行 `node --test 'tooling/scripts/__tests__/*.test.mjs'` 执行全部 Node 原生工具测试，运行 `pnpm exec eslint tooling/scripts` 检查脚本规范。修改工具或安装模板后同时对五个核心工具、`qa-browser-helper.mjs` 与 `tooling/scripts/qa-check/` 子模块目录进行递归逐字节一致性校验。

## 使用前

确保脚本有执行权限：

```bash
chmod +x tooling/scripts/*.sh
```
