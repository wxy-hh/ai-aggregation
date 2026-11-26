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

通过 `node tooling/scripts/qa-check.mjs <plan|acceptance|review> .scratch/<feature>`（或项目已有 `pnpm qa:check -- ...` 快捷方式）显式检查计划、验收或审查；`gate-plan-*` 与 `gate-acceptance-*` 门禁日志必须经 `qa-run` 直接调用 `node .../qa-check.mjs` 生成，快捷方式生成的 argv 不会被门禁识别。只接受 Schema 4：核对断言标记、用例绑定、全状态对账、确定性过程脚本引用闭包（含 `# script:` 头字段与 `SCRIPT_DIR`/变量赋值闭包）、审查来源、Claude Code 0 子代理硬拦截（`REVIEW_PROVENANCE_UNVERIFIED`）与交付验证事件时间；有 challenge 的新轮次校验 `.source.json` 并输出「来源核验」强度行（转录（强）／自述凭据（弱）／未核验（人工）），无 challenge 的旧轮次沿用全等比对；核对 `_qa/round-snapshots/r<n>/manifest.json`（审查途中修改代码/术语/`spec.md` 即报 `SUPERSEDED`）；支持 `QA Review Coverage: 1|2`（v2 在 `acceptance` 阶段生成按过程脚本/测试聚合的 `reviewUnits`，未改动存量非高风险回归标 `sampled`，`r2+` 同哈希已核实单元自动标 `inherited`）；全版本要求源码引用命中目标行前后 `±5` 行真实测试或断言谓词；检测跨轮重复起号冲突（`FINDING_ID_COLLISION`）；默认自动上限收紧为 `r2`（超过或达上限未闭环时输出 `暂停终态: WAITING_HUMAN` / `PACKAGE_INVALID` / `WAITING_INFRA` 与人工决策包）；其他 Schema 报 `UNSUPPORTED_SCHEMA`。

### review-package.mjs

改代码前用 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径...>` 建立基线并冻结计划，需要扩大范围时用 `add`，审查时默认先执行 `qa-preflight` 静态预检（可用 `--skip-preflight` 应急跳过）与 2 秒可封存性预检（必审行缺少谓词候选即按 `PACKAGE_INVALID` 阻断），再由 `collect`（默认拒绝 `r3+`，人工授权追加须显式传 `--allow-manual-round`）生成含 Rename 折叠的 `review-package.diff`、`_qa/round-snapshots/r<n>/` 轻量不可变快照、`r2+` 相邻快照机器差量 `_qa/review-package-delta.diff`、`< 3 KB` 结构化 `_qa/review-brief.md`、含 `renames`/`snapshotDir` 的 `review-package.json` 及带全历史编号登记（`reservedIds`/`nextIds`）的 `_qa/review-challenge.json`。审查子代理写完原文后用 `seal` 基于当轮不可变快照同步校验编号（含跨轮碰撞）、`--pending-ids` 与 Spec 对账覆盖，并输出类型化错因（`REVIEWER_EDITABLE` / `PACKAGE_INVALID`）。`scaffold-report` 根据 `review/` 全部原文自动生成无漏项分流骨架；`digest` 输出当前范围 tree；这些命令均不改变 Git index，机器状态写入特性目录的 `_qa/`，禁止手改。

### qa-run.mjs

使用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>`（或 `--script <path>` / `--executor <ego-browser|node|sh> --script <path>` 通过 stdin 驱动 `ego-browser nodejs` 并写入 `# executor:` 与 `# script:` 头字段）真实执行并记录 argv、HEAD、tree、时间和退出码。日志位于特性 `evidence/` 且不可覆盖，失败或旧证据需换新标签。日志里的 `tree` 是**行为证据树**：只忽略根 `GLOSSARY.md`、`CONTEXT.md`、各目录 `README.md`、`docs/adr/` 与 `docs/features/` 中的 Markdown；其他 Markdown 默认计入，尤其保留源码旁由业务、构建或测试运行时读取的内容。豁免路径不得作为运行时内容源，且仍进入审查包 diff。

### dev-port.mjs 探活

使用 `node tooling/scripts/dev-port.mjs --probe --wait 90` 按端口决议范围寻找标题为 AI 聚合平台的服务；标题匹配后再校验首页引用的首个 `/_next/static/` JS chunk 返回 200，拦截 HTML 200 但前端资源全 404 的半死 Next 服务。标题不匹配时不要关闭其他进程；未找到时按输出启动 `pnpm dev:web` 后重试。

### qa-spec-review.mjs

Schema 4 的 Spec 审查覆盖清单与原文校验共享纯函数模块：`specReviewChecklistDocument()` 序列化与解析 `_qa/spec-review-checklist.json`（支持 `v1` 五列与 `v2` 四列 `required` 必审分级），`specReviewSkeletonDocument()` 生成预填骨架 `_qa/spec-review-skeleton.md`，`parseSpecReviewCoverage()` 解析 `## 对账覆盖` 表格，`citationIsValid()` 与 `validateReviewReportForSeal()` 统一承载 `±5` 行谓词引用及封存前同步校验，由 `qa-check.mjs` 与 `review-package.mjs` 直接导入。

### qa-preflight.mjs

1 秒本地确定性静态预检 CLI（`node tooling/scripts/qa-preflight.mjs <feature-dir> [--strict]`），默认挂载在 `review-package collect` 前执行：ERROR 级拦截 `scripts/` 字面永真伪断言及 `spec.md`/`qa-plan.md` 交付命令不一致或空操作占位，WARN 级提示 Diff 增量纯英文注释、非白名单十六进制色值与同文件交互按钮 `<44px` 全量行号（`--strict` 将 WARN 升级为阻断）。明确仅清除静态违规，不替代 Spec 语义核对与人工终审。

### qa-browser-helper.mjs

阶段 5 浏览器验收的仓库级薄辅助模块：`resolveRepoRoot()` 从模块位置解析仓库根（不依赖 `cwd`），`acquireQaPage()` 按 TaskSpace ownership 接管或新建页面，`createMarker()` 统一断言标记与非零退出，`captureTargetGeometry()` 用同一 target 完成 probe、几何硬断言与矩形裁剪截图，`captureMobileGeometry()` 在其上增加移动视口设置并在 `finally` 复位视口。只封装通用机制，不绑定业务选择器。

### 工具测试

运行 `node --test 'tooling/scripts/__tests__/*.test.mjs'` 执行全部 Node 原生工具测试，运行 `pnpm exec eslint tooling/scripts` 检查脚本规范。修改工具或安装模板后同时检查五个核心工具与 `qa-browser-helper.mjs` 对应模板的逐字一致性。

## 使用前

确保脚本有执行权限：

```bash
chmod +x tooling/scripts/*.sh
```
