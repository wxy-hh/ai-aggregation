# 0054. QA 工作流减负、浏览器工具分流与检查器误报收敛

* **状态**：已接受
* **日期**：2026-11-17
* **范围**：`CLAUDE.md`（及 `AGENTS.md`）、`docs/agents/qa-workflow.md`、`docs/agents/qa-workflow-guide.md`、`.claude/skills/{code-review,to-spec,qa-test-planner,retro,setup-qa-workflow}`、`tooling/scripts/{qa-check,qa-run,review-package,dev-port}.mjs`、新增 `tooling/scripts/qa-browser-helper.mjs` 与 `tooling/scripts/__tests__/`
* **相关**：ADR-0031、ADR-0033、ADR-0040、ADR-0042、ADR-0044、ADR-0047、ADR-0048

## 背景

2026-11-10 至 2026-11-17 期间在 Kimi Code 宿主上连续执行了四次 QA 闭环（C1 `.scratch/chunk-record-construction`、C3 `.scratch/qimen-worker-unary-quota`、C6 `.scratch/destiny-workspace-state-named-actions-and-session-modules`、C7 `.scratch/document-preview-read-projection`）。对产物、截图、证据日志及原生 `wire.jsonl` 转录的核查发现：

1. **文档改动连坐全量重跑**：`computeTreeDigest` 将 `GLOSSARY.md` 与 `docs/adr/` 纳入同一摘要；C7 编辑 `GLOSSARY.md` 使已完成的 C6 整体变成 `STALE_*`；C3 r2 仅修 1 行注释和 1 行 `catch` 即令 8 条交付命令重跑；阶段 5 collect 前预跑交付命令放大了多轮 `final*` 重跑（C7 达 6 轮）。
2. **阶段 6 复审陪跑、重跑测试与宿主适配摩擦**：`qa-check` 要求 `r2+` 双轴成对齐全，导致纯证据轮（C6 r4/r5）或单轴缺陷轮（C1/C3 r2）空跑无待复核项的另一轴；`code-review` 未限制子代理执行测试，C7/C6 审查子代理重复跑数百条 Vitest，把单轮拖长至 5–13 分钟并两度在 Kimi Code 触发 `no_final_message` 假失败；C7 `agent-25` 还在后台续跑时读取同轮 `r1-standards.md` 并 `rm .source.json` 重封。
3. **伪需求与流程自检循环**：C7 `spec.md` 要求先行红灯见证，而慢车道 worktree 子代理无法落盘红日志，导致 `[P-M3]` 卡住两轮；C6 11-16 会话把 `qa-check`/截图/审查产物自检写成 `qa-plan.md` 的 `TC13`/`TC14` 元用例，引发 `r4`/`r5` 流程自循环（单会话子代理输入达 2.98 亿 token）。
4. **阶段 5 浏览器摩擦与检查器误报**：`CLAUDE.md:52` 强制 macOS 默认使用 `ego-browser`，而 `qa-workflow-guide.md:200-214` 仍写着不兼容的 Playwright `page.locator` 示例；C7 修改过程脚本 42 次、C6 重复编写 210KB+ helper；`dev-port.mjs` 只查 `<title>` 放过了 JS chunks 全 404 的半死 Next 进程（C3 F17）；C3 复验固定文件名覆盖历史截图。同时 `qa-check.mjs` 存在 `PASS_LABEL` 触发密码正则、非 Claude 宿主新协议仍扫描 `~/.claude/projects/` 误报、`resolvedBeforeRound` 误报、以及 `SHARED_SCREENSHOT` 未查内容重复等问题。

## 决策

坚持「**防疏忽，不防对抗；机器只做高信噪比机械校验，语义交审查者与人工终审**」，经 `/grill-with-docs` 逐项收敛为 11 条决策：

1. **行为证据树按明确路径排除非契约说明文档，最终交付命令只在阶段 7 执行**：
   - 计算 `qa-run` 行为证据与交付验证的 `tree` 摘要时，仅排除根 `GLOSSARY.md`、`CONTEXT.md`、各目录 `README.md`、`docs/adr/` 与 `docs/features/` 中的 Markdown；其他 Markdown 默认计入，尤其是业务、构建或测试运行时读取的内容。审查包（`review-package.diff` 与 `STALE_REVIEW_PACKAGE`）仍包含全部文档，确保术语与 ADR 改动继续受双轴审查。
   - 取消「阶段 5 浏览器验收后、首次 collect 前先预跑全量交付命令」的规定，最终交付命令统一在阶段 7 执行；阶段 3B 基线命令与阶段 4 TDD 红绿证据仍按原规则执行。
   - 阶段 7 若因交付命令失败而修改代码或契约文档，必须回到阶段 6 重新 collect、按既有规则复审，并重跑受影响验收与全部交付命令；未改代码的环境重试不触发复审，自动复审上限已用尽时交人工授权。
2. **阶段 6 增量复审按审查包与 QA 产物是否变化决定双轴 vs 单轴**：
   - `r1` 必须双轴齐全。
   - `r2+` 时，若被审代码或文档未变（`review-package.json` 的 `treeDigest` 未变）且本轮仅修改分流或轨迹文字，**只复审存在待复核编号的对应轴**，另一轴不陪跑；执行记录、绑定、日志或截图变化时 Spec 轴必须复审，过程脚本变化时 Standards 与 Spec 双轴必须复审。主代理须在复审输入列明 QA 产物变化，`qa-check` 不猜测变化语义，由人工终审核对。
   - 若被审代码或文档发生变更（`treeDigest` 变化），仍要求双轴针对本轮修复改过的文件做增量复审。
3. **审查子代理默认只读静态审查并严格隔离上下文**：
   - `code-review` 子代理默认**禁止重跑测试套件、`typecheck`、`lint` 或启动服务**，以 `qa-run` 日志与叶子测试/脚本源码为准（仅当怀疑某单测虚假通过时，最多说明后读源码核验）。
   - 严禁读取同轮另一轴的 `review/` 原文，严禁跨特性读取其他 `.scratch/` 目录。
4. **Kimi Code `no_final_message` 假失败认领与跨宿主误报消除**：
   - 当审查子代理报超时或 `no_final_message` 时，主代理不立即判失败，先核对 `review/r<n>-<axis>.md` 与同名 `.source.json` 是否已在磁盘生成且 `nonce` 匹配当前 `challenge`、`sha256` 一致；一致即认领该独立审查结果，无需 `resume` 追问；确认缺失才保持「待独立审查」。
   - 不为堵 `rm .source.json` 重封而把 `review-challenge.json` 改成可写锁文件，保持 `ADR-0048` 简单边界，仅在技能中禁止封存后删凭据重封。
   - 新协议（存在 `challenge`）下，若声明宿主与凭据 `host` 均非 `Claude Code`，跳过 `~/.claude/projects/` 扫描与 `codeReviewInvoked` 校验。
5. **`feature` 不设修复前复现日志门禁，禁止流程自检进 `qa-plan.md`**：
   - 仅 `QA Kind: fix` 强制保留修复前 `qa-run` 红灯复现日志；`QA Kind: feature` 不得在 `spec.md` Testing Decisions 或 `qa-plan.md` 写入“修复前复现日志”验收/审查要求，Spec 轴不再以此报 `P-M`/`P-W`。所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变。
   - `qa-plan.md` 只测产品外部可观察行为，禁止将 `qa-check`、截图汇总、`review/`、`review-report.md` 或 `handoff.md` 等工作流产物写成元用例（`TC`），也不得在 `.scratch/<feature>/scripts/` 编写元校验脚本。
   - 收紧 `S-J` 分流口径（纯文档约束、不新增机器校验）：不打算本次修的 `S-J` 默认驳回、不进三档分流表，但在 `review-report.md` 的 `## 默认驳回` 中集中列出编号与原文位置，不强制逐条理由；确需修、转专项或单独说明风险的仍进分流表，跟踪去向由人工终审确认。
6. **阶段 5 浏览器瘦身与 Playwright / `ego-browser` 分流**：
   - 核心链路在阶段 5 默认只覆盖 **1–3 条核心真实浏览器主链路 + 关键视口**（默认不超过 3 个 TC）；组件测试已能覆盖的错误注入（如 `fetch=500`）与分支矩阵下沉回 `unit`/`integration`，移动视口仿真不冒称物理设备。
   - 解除 `CLAUDE.md:52`「macOS 默认首选 `ego-browser`」硬绑定，改按场景分流：
     - **轻量 DOM/视口验证或无需复用用户当前桌面登录态时**，优先使用仓库已安装的 **Playwright**（`@playwright/test`）；原生 Node 过程脚本要求宿主根 `package.json` 将 `playwright` 声明为根级直接开发依赖，通用安装器只检测和报告缺口，不修改宿主清单；
     - **需要复用用户桌面浏览器已登录会话或人工扫码/验证码接管的核心主链路**，使用 **`ego-browser` 可见窗口**。
   - 配套工程减负与防线：在 `tooling/scripts/` 新增约 80–120 行的薄模块 `qa-browser-helper.mjs`（仅封装基于 `import.meta.url` 的仓库根路径、`acquireQaPage`、`createMarker` 与「必填并等待几何断言 → 截图 → 复位视口」顺序，不含业务选择器）；修正 `qa-workflow-guide.md:200-214` 的错位 Playwright 示例；规定含响应注入的脚本必须独立成文件、截图文件名带运行标签/时间戳后缀防覆盖；`dev-port.mjs` 的 `probeWebApp` 增加对首页 1 个 `/_next/static/` JS chunk 返回 200 的探活；核心链路开跑前先做 1 次最小账户额度/上游端点探针并确认后台 `node -v >= 18` 且关闭短超时。
7. **`qa-check.mjs` 精确修 Bug 与同图去重**：
   - 修复 `qa-check.mjs:38` 密码字面量正则误伤 `PASS` 变量名（去掉 `(?:word|wd)?` 中的 `?`）；
   - 修复 `qa-check.mjs:1362` `resolvedBeforeRound` 漏写 `r<n> 已修` 导致的误报；
   - 在既有 `SHARED_SCREENSHOT` 检查中追加截图文件内容 SHA-256 去重（拦截不同文件名但同图伪证，不新增问题码）；不为 `S-J` 转专项加新机器拦截。
8. **阶段 1 探讨保持现状，补全 `/retro` 溯源规则**：
   - 经核查 `wire.jsonl`，阶段 1 多模型/多轮子代理探讨均由用户显式指令触发，保持现状不增设阶段 1 子代理规则。
   - 更新 `.claude/skills/retro/SKILL.md`「项目定制」：要求按特性目录文件与截图的最新修改时间检索全部关联会话，并实际用宿主图像读取工具抽查截图图像与 `scripts/` 逻辑，不硬编码单一宿主的工具名。
9. **过程脚本零依赖轻量词法处理**：
   - 在 `qa-check.mjs` 新增零外部依赖辅助逻辑：正则扫描前剥离 JS/Python 注释（按扩展名区分，Python 才处理 `#` 行注释，JS 保留私有字段并仅识别 shebang；跳过字符串字面量内部），并让 `inPageSegment()` 跳过字符串、注释与正则字面量内部字符计括号；保留字符串字面量内容以保证登录接口/包名扫描不失效，不处理动态拼接混淆（维持「防疏忽、不防对抗」）。
10. **维持 `ADR-0048` 不做跨宿主转录适配器**：
    - 不为 Kimi Code 或其他宿主新增本地转录解析器（本地 JSONL 仍可被同权限主代理改写，且非公开格式耦合维护无界）；在文档中明确提示「自述凭据（弱）」只防跨轮串包与漏执行，弱档下由人工终审与按需 `/retro` 抽查原生会话核验。
11. **`code-review/SKILL.md` 单一中文指令内聚**：
    - 仅将本仓前后规则直接冲突的 `.claude/skills/code-review/SKILL.md` 整合为前后端自洽的中文单一指令（保留上游署名与 `Fowler 12 项坏味道` 完整清单，删除 `Under 400 words` 与“主代理聚合”英文冲突段落）；普通审查保留用户固定点和 `git diff <fixed-point>...HEAD`，仅 QA 调用改用审查包、nonce 与 seal，前后台按宿主约束；`tdd`、`to-spec`、`retro`、`to-tickets` 及通用安装器 `setup-qa-workflow` 模板暂不整文件重写。

## 对既有 ADR 与规则的取代与修订

| 被取代或修订项 | 新决策 | 依据与已评估代价 |
| --- | --- | --- |
| `ADR-0042` 决策 1：collect 前预跑交付命令 & 全量 `treeDigest` | 行为证据树只豁免明确说明文档路径，取消 collect 前预跑（最终交付命令统一阶段 7） | 实证表明共享 `GLOSSARY.md` 与纯文档改动反复引爆多轮 `final*` 与跨特性 `STALE`；代价是跨包隐性 `typecheck`/`lint` 错误会延迟到阶段 7 暴露，因此阶段 7 修码必须回到阶段 6；源码旁运行时 Markdown 不排除 |
| `ADR-0033` 决策 2：`r2+` 每轮双轴同轮齐全 | 源码/文档与实质 QA 审查输入未变时仅复审有待复核项的单轴；证据变化审受影响轴，代码变动仍双轴审修复 diff | 消除 C6 r4/r5 等纯分流返工轮陪跑；代价是 QA 产物是否实质变化由主代理列明、人工终审核对，源码有 1 行修改时仍需另一轴做轻量增量确认 |
| `ADR-0047` §5 &「明确不做」：未禁审测、不做通用浏览器模板 | 审查默认只读不跑测试且禁读兄弟轴；新增 ~100 行薄 `qa-browser-helper.mjs` | C7 审查跑全量测试导致 5–13 分钟超时与 1.23 亿子代理输入；浏览器无共用样板导致 C7 改脚本 42 次、C6 写 210KB helper；代价是审查不再当场重跑拆穿测试执行（交 `qa-check`），且多维护 1 个与 `ego-browser` 耦合的薄文件 |
| `CLAUDE.md:52` / `ADR-0044`：macOS 默认 `ego-browser` | 按「是否依赖已登录会话/人工接管」分流 Playwright 与 `ego-browser`，阶段 5 限 1–3 条 | Playwright API 稳定且仓内已配置；代价是需复习 `CLAUDE.md` 与工作流文本，Playwright 走受保护路由时需配合持久化 profile 或转交 `ego-browser` |
| `ADR-0031` 决策 1：`code-review` 保持上游英文原文 | 本仓 `code-review/SKILL.md` 内聚为单一中文指令 | 消除前文英文条款与定制段直接冲突带来的注意力成本；代价是未来跟进上游 `mattpocock/skills` 更新时需人工对照合并 |

`ADR-0048` 关于不做跨宿主转录适配器、不做防篡改签名的边界继续有效。

## 明确不做

- Kimi Code / Cursor / Kiro / Codex 等非公开宿主转录适配器。
- 对 `review-challenge.json` 增加可写防重封锁或密码学签名。
- 用正则硬追 `page['eval' + 'uate']` 等对抗式混淆绕过。
- 用 `qa-check` 对 `S-J`「转专项」理由文本做格式硬拦截。
- 重写 `tdd`、`to-spec`、`retro`、`to-tickets` 的上游结构。
- 新增重型浏览器业务 DSL。

## 效果验证口径（机制描述，非已证实收益）

本决策对缩短单次任务耗时、压低无缓存子代理 Token、减少阶段 5 脚本返工与误报阻塞的预期均为机制推导，尚无对照实测数据。后续须通过真实特性（按 `docs/agents/qa-workflow.md:178` 在干净会话执行真实 `/implement` dogfood）与交付后 `/retro` 对照统计，方能确认实际成效；对照同时记录总耗时、qa-run 批次数、审查轮次与 Token、阶段 7 晚发现次数、修后重审次数及人工终审新增发现数，避免把成本后移。发布完成前工作流改动保持「待发布验收」状态。
