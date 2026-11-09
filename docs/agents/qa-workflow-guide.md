# QA 工作流实战指南 (QA Workflow Guide)

> 本文件是给组员看的说明书：讲设计动机、产物长什么样、常见坑和 FAQ。**规则以 `docs/agents/qa-workflow.md`（正本）为准，本文件不约束 Agent**；两者不一致时改本文件。

## 目录

1. 为什么要这套工作流
2. 一张图看懂七个阶段
3. 谁来触发：人工命令与模型技能
4. 特性目录长什么样（Schema 4）
5. 产物示例：qa-plan、过程脚本、几何证据、审查原文、分流表
6. 检查器输出怎么读：FAIL、BLOCKED 与 NOTE
7. 人工终审怎么做
8. 快慢车道
9. 跨会话与跨人交接
10. 避坑指南
11. FAQ

---

## 一、为什么要这套工作流

AI 辅助编码最常见的三类返工：

1. **需求理解偏差**：一句话需求，AI 改了十几个文件，方向却是错的。
2. **单测绿、浏览器坏**：内存测试全绿，真实页面按钮点不动、弹层遮挡、水合报错。
3. **环境故障当成代码缺陷**：端口没起、上游欠费或 TLS 阻断，AI 去改本来正常的业务代码。

工作流的回答是：动手前先对齐规格，开发时 TDD，交付前做真实浏览器验收，再做独立双轴审查。

### 这一版（Schema 4）解决了什么

上一版在一次真实需求（knowledge-metadata-filter）中三道检查全部 PASS，复盘却发现：

- 审查原文被主代理转述失真：Spec 轴真实返回 7 条，报告只剩 3 条，还有一条“驳回”是审查者从未提出的。
- 执行记录的 PASS 由 Agent 自填：多条冻结断言在脚本里根本没断言，或测的是另一个元素。
- 过程脚本直连数据库签发令牌、改了本地真实用户的密码并注入 Cookie。
- 关键点击被换成页面内 `dispatchEvent`，计划变更仍写“无”。

问题的共同点是**检查器只核对“写了没有”，Agent 自述就能过关**。Schema 4 把自述换成机器可对账的产物：

| 以前靠自述 | 现在靠产物 |
| --- | --- |
| 报告里粘贴的审查原文 | 有 challenge 时子代理自写原文并 seal 生成凭据；无 challenge 的旧轮次由主代理逐字落盘到 `review/` + 编号对账 |
| 执行记录写 PASS | 日志里的 `[TC01-1] PASS 实测：…` 标记、unit 的「文件 › 标题」绑定 |
| “我用的是真实输入” | `scripts/` 静态扫描：绕过登录与脚本内登录硬失败，模拟输入标注 |
| “已修” | 分流表「验证证据」列指向修复后产生的证据 |
| 人工逐行对照 spec | 一张对账表：状态 + 冻结／当前断言 ↔ 实测值、失败原因或用例标题 |

设计取舍：**只对机械可修的缺口硬失败**（漏编号、漏标记、绑定写错），语义判断（实测值是否真的证明断言）交给人工看对账表。硬性检查不追求覆盖一切，否则流程会卡死在审查阶段。

### 和 Matt Pocock 技能体系的关系

本工作流继承 [Matt Pocock Skills](https://github.com/mattpocock/skills) 的需求盘问、领域建模、Seam、垂直切片和双轴审查。`code-review` 保持上游原文，只在末尾“项目定制”段替换 diff 来源与原文落盘方式（有 challenge 时子代理自写并 seal，无 challenge 的旧轮次由主代理逐字落盘）。本项目额外加了：spec 后的 qa-plan、核心链路的可见浏览器验收、`_qa/` 基线与审查包、三档分流与增量复审。

---

## 二、一张图看懂七个阶段

```text
[1] /grill-with-docs   需求盘问 → 领域术语、ADR
[2] /to-spec           spec.md（含 ## 交付命令）
[3A] /to-tickets       慢车道拆票
[3B] /qa-test-planner  qa-plan.md → qa-check plan → review-package init（冻结计划）
[4] /implement         TDD + qa-run 生成证据
[5] 真实验收           browser/api 过程脚本 → qa-check acceptance（对账表）
[6] 双轴审查           collect → code-review → review/r1-*.md → 三档分流 → 增量复审（≤2 轮）
[7] 交付收口           交付命令 → qa-check review → 人工终审
```

各阶段的具体规则见正本第五节，这里只说为什么这样排：

- **计划在 init 时冻结**：先写断言再看实现，防止“观察实现再反向固化预期”。之后删改断言必须写进 `## 计划变更`。
- **交付命令放在全部浏览器验收之后**：构建命令会改写 dev server 产物，曾经打断正在进行的验收。
- **复审是增量的、有上限**：全量重审每轮都可能冒出新发现，修—审循环没有终点。现在复审只核对上轮“本次修”是否修好，审查者拿到完整审查包与主代理列出的本轮修复改过的文件，新发现只针对这些文件；自动最多 2 轮，用尽后交人工裁决，流程照常走完交付验证，不会中断。

### 阶段收口的关键命令

```bash
# 阶段 3B：计划通过后先跑交付命令基线，再建基线并冻结计划
node tooling/scripts/qa-check.mjs plan .scratch/<feature>
node tooling/scripts/qa-run.mjs .scratch/<feature> baseline-delivery -- <交付命令>
node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>

# 阶段 4：阶段 1–2 产物需要纳入时扩大范围
node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>

# 阶段 5：证据与对账表
node tooling/scripts/qa-check.mjs acceptance .scratch/<feature>

# 阶段 6：审查包，再用 Skill 工具调用 code-review
node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>

# 阶段 6：子代理写原文后按轴封存（每轴一次，宿主名按实际填写）
node tooling/scripts/review-package.mjs seal .scratch/<feature> --round r1 --axis standards --file review/r1-standards.md --reviewer-kind subagent --host "<宿主名>"
# r2 复审追加 --pending-ids；无子代理宿主由用户另开会话或终端审查后用 external-session
node tooling/scripts/review-package.mjs seal .scratch/<feature> --round r2 --axis spec --file review/r2-spec-axis.md --reviewer-kind subagent --host "<宿主名>" --pending-ids "P-M1,P-W1"

# 阶段 7：最终机器校验
node tooling/scripts/qa-check.mjs review .scratch/<feature>
```

`init` 前执行记录不得有 PASS 行；基线红灯先问用户：修复则作为独立小修提交后再 init，不修则在 `## 范围说明` 记为既有失败并引用基线日志。`tooling/`、`docs/`、`.claude/` 等与工作流共用的目录，路径白名单写到具体文件。

---

## 三、谁来触发：人工命令与模型技能

### 宿主与同名技能

流程主路径是宿主无关的审查来源凭据（ADR-0048）：`collect` 发放 challenge，审查子代理自写 `review/` 原文并运行 `review-package seal` 生成 `.source.json`，`qa-check` 按证据分级——同 nonce 的 Claude Code 转录为「转录（强）」，只有凭据为「自述凭据（弱）」，都没有为「未核验（人工）」。只读探索型子代理不能担任审查者；Codex 等无子代理宿主由用户手动另开独立会话或终端审查，用同一 nonce seal，主代理不得自动启动无头审查者。无 challenge 的旧轮次继续走旧逻辑（Claude Code 全等比对，其他宿主人工 NOTE）。个人级同名技能检测仍在 `plan` 与 `review` 阶段执行（在其他宿主运行时同样检查），流程技能同名且内容不同时判 BLOCKED。

### 成本边界

默认 inline 规划、单会话串行实现，不自动增加规划或实现代理、不指定或升级模型；显式独立规划最多 1 个，显式并行实现最多 2 个。Worktree 只隔离文件和分支，不隔离数据库、Redis、端口、上游额度或测试账号，高耦合任务回退串行。不新增 Hooks 或自动重试，`qa-check` 只在阶段边界显式运行并聚合问题。

| 只能人工敲的命令 | 为什么 |
| --- | --- |
| `/grill-with-docs`、`/grill-me` | 业务边界必须由人回答，防止模型自问自答 |
| `/to-spec` | spec 是契约，生成要经人确认 |
| `/implement`、`/implement-spec` | 开工产生代码变更，人是把关人 |
| `/handoff` | 何时交接、下一步目标是人的决策 |

| 模型可自动调用、人也可手动调用 | 典型时机 |
| --- | --- |
| `qa-test-planner` | spec 之后 |
| `tdd` | `/implement` 内的红绿循环 |
| `diagnosing-bugs` | 验收 FAIL 需要定位根因 |
| `ego-browser` | 阶段 5 可见窗口验收 |
| `code-review` | 阶段 6 双轴审查 |
| `pr`、`retro` | 交付与复盘 |

---

## 四、特性目录长什么样（Schema 4）

按“谁来读”分层：

```text
.scratch/<feature>/
├── spec.md              ← 人读：需求契约
├── qa-plan.md           ← 人读：冻结断言 + 执行记录 + 交付验证
├── review-report.md     ← 人读：审查方式、三档分流、范围说明
├── issues/              ← 拆票时才有
├── review/              ← 审查原文与同名 .source.json（r1-standards.md、r1-standards.source.json、…）；子代理自写，新协议不得改原文或重算凭据
├── scripts/             ← browser/api 过程脚本与 helper
├── evidence/            ← qa-run 日志，不可覆盖
├── screenshots/         ← 每个 TC 一张验收截图
└── _qa/                 ← 机器状态：scope.json、prechange/、review-package.*、debug/
```

打开目录时，**先看顶层三份文档**；要核对证据再进子目录；`_qa/` 一般不用看，也不要手改。调试截图放 `_qa/debug/`，不会被当成验收截图。

旧的 Schema 1/2/3 计划不再兼容，检查器报 `UNSUPPORTED_SCHEMA`。历史目录不迁移；需要重做时按上面结构新建。

---

## 五、产物示例

### 1. qa-plan 执行记录

```markdown
## 执行记录
| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| TC01 | 1 | PASS | `screenshots/TC01.png`、`evidence/tc01.log` | | |
| TC02 | 1 | PASS | `evidence/unit.log` | `apps/web/src/lib/rag/hybrid-retrieval.test.ts` › 传入过滤条件时两路均收到 | |
| TC03 | 1 | BLOCKED | 无 GUI 环境 | | 转人工 |
```

- browser/api 行的证据是截图（browser）和日志；绑定列留空，靠日志里的标记证明。
- unit/integration 行写绑定：反引号里是相对仓库根的测试文件，`›` 后是源码里的叶子标题（不用写 describe 路径；参数化测试照抄源码里的 `%s` 写法）。
- 绑定写错只改这一列，重跑 `qa-check acceptance` 即可，不用重跑测试。
- 修复已交付特性时，计划头写 `QA Kind: fix`，每个 TC 在 `## 修复前复现` 引用同 argv、更早且 tree 不同的红日志；不改写原特性的执行记录。
- 计划在 init 时冻结；删改断言、Seam、Covers 或交付命令必须写进 `## 计划变更`。计划变更不得新增冻结断言之外的呈现要求（如「某几项同屏」），确需新要求时追加断言。
- 交付验证原样复制 spec 的 `## 交付命令`，可追加不可删减；全部浏览器验收结束后先预跑一次并回填，让 r1 审查看到真实结果。

### 2. 过程脚本的断言标记

```js
// scripts/tc01-filter.mjs —— 从已登录状态开始
const width = await page.evaluate(() => document.documentElement.scrollWidth);
if (width > 375) {
  console.log(`[TC01-1] FAIL scrollWidth=${width}`);
  process.exit(1);
}
console.log(`[TC01-1] PASS 实测：scrollWidth=${width}`);
```

要点：先硬断言，失败非零退出；PASS 标记必须带实测值。只打印“通过”不算断言。脚本经 qa-run 以脚本路径运行：

```bash
node tooling/scripts/qa-run.mjs .scratch/<feature> tc01 -- node .scratch/<feature>/scripts/tc01-filter.mjs
```

### 3. 视觉类断言：几何硬断言加目标区域截图

```js
// scripts/tc05-overlay.mjs —— 断言编辑按钮未被遮挡
const target = page.locator('[data-testid="edit-button"]');
await target.scrollIntoViewIfNeeded();
const box = await target.boundingBox();
const viewport = page.viewportSize();
const visible = !!box && box.y + box.height > 0 && box.y < viewport.height;
const covered = visible && await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y);
  return !el || !el.closest('[data-testid="edit-button"]');
}, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
if (!visible || covered) {
  console.log(`[TC05-1] FAIL visible=${visible} covered=${covered}`);
  process.exit(1);
}
await target.screenshot({ path: `.scratch/<feature>/screenshots/TC05.png` });
console.log(`[TC05-1] PASS 实测：visible=${visible} covered=${covered}`);
```

截图不能证明数值，也不能单独证明可见：先让目标处于无遮挡位置，脚本硬断言目标与视口相交且代表点未被其他元素遮挡，再截取目标区域；断言未溢出时另断言边界与滚动尺寸。Spec 轴审查仍会按冻结断言原文复核截图。

**真实链路冒烟**：触及核心链路时至少一条 browser 用例走真实登录、真实输入与真实后端，只断言本次新产生的用户可见终态（如流式结束、无错误态、控制台无报错），不断言模型非确定性分支。响应注入只在本次改了对应渲染代码时补充构造前端前置或故障态，备注写明「响应注入」，不得替代真实链路冒烟。页面内 `dispatchEvent`、`.click()`、`.focus()`、`.value` 赋值只用于读取状态或构造前置条件，并在备注写明。

### 4. 审查原文（有 challenge 时子代理自写并 seal；旧轮次由主代理逐字落盘）

```markdown
[P-M1] 缺失：spec US 12 要求保留修复尝试记录，diff 中未见对应处理。
[P-W1] 有误：US 18 要求 FAIL 标记与 PASS 记录冲突时失败，实现只检查了缺失。
[P-X1] 范围蔓延：新增了 spec 未要求的 --verbose 参数。
```

新协议下上述原文由子代理直接写入 `review/r1-spec-axis.md` 并 seal；无 challenge 的旧轮次才由主代理逐字落盘。

**审查来源凭据怎么用（有 challenge 的新轮次）**：

1. `collect` 把轮次、nonce、treeDigest 与打包时间写入 `_qa/review-challenge.json`。需要显式开新一轮时用 `--round r<n>`；再次 collect 会换 nonce，旧凭据不能用于新轮次。
2. 主代理把 `QA_REVIEW_BINDING` 与 `QA_REVIEW_NONCE` 两行写进子代理 prompt，并附上可复制执行的 seal 命令与宿主名。审查子代理必须能写文件、能执行命令；只读探索型代理（如 Kimi Code 的 `explore` profile）不能担任审查者。
3. 子代理把最终审查内容直接写入原文文件，再按轴 seal：r1 用 `--axis standards|spec --file review/r1-… --reviewer-kind subagent --host "<宿主名>"`；r2 起追加 `--pending-ids "<编号,...>"`，把收到的待复核编号原样带入凭据。无子代理宿主由用户手动另开独立会话或终端审查，用同一 nonce 运行 `--reviewer-kind external-session`；主代理不得自动启动 `codex exec` 等无头审查者。
4. `seal` 校验轮次、轴、路径、challenge 与当前审查包一致，拒绝覆盖已有凭据，成功时打印 `QA_REVIEW_RECEIPT: <nonce>|<sha256>`，子代理把这一行放进最终返回。主代理只检查原文与 `.source.json` 是否存在，不转抄、不改写、不重算。
5. `qa-check review` 输出「来源核验」强度行：找到同 nonce 的 Claude Code 子代理转录且哈希行一致为「转录（强）」；只有自述凭据且内部一致为「自述凭据（弱）」；两者都没有为「未核验（人工）」。凭据缺失、格式错误或自述时间早于 collect 只给 NOTE，哈希矛盾 FAIL，nonce 不符 BLOCKED。强度行不改变 PASS / BLOCKED 语义，弱档不能称来源已核验。

seal 拒绝覆盖已有凭据，是为了防止主代理「修一下原文再重封」。原文有问题时按真实返回保留并保持待独立审查，或按新轮次重新审查；不要手改 challenge、凭据或原文。

编号含义：`S-H` 规范硬违规、`S-J` 规范判断建议、`P-M` 缺失或部分实现、`P-W` 实现有误、`P-X` 范围蔓延。无发现时写「无发现」，不带编号；S-J 只报有明确当前成本的问题。

### 5. 三档分流表（`review-report.md`）

```markdown
审查方式：宿主=Claude Code；code-review 的 Standards 与 Spec 两个独立子代理

## 三档分流
| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |
| --- | --- | --- | --- | --- | --- |
| P-M1 | 本次修 | 已修 | r1 → r2 已修 | `evidence/fix-p-m1.log` `screenshots/tc03-fixed.png` | |
| S-J2 | 驳回 | 驳回 | r1 | | 调试日志只在本地脚本中，删除收益小于改动范围扩大的成本 |
| P-W1 | 本次修 | 修错 | r1 → r2 修错 → r3 修错 | | |
| P-X1 | 本次修 | 已修 | r1 → r2 已修 | 静态：撤回 spec 未要求的 --verbose 参数 | |

## 修复尝试记录
- P-W1 r2：只补了冲突分支判断，复审指出标记解析仍取第一条；r3 改为取全部标记后仍漏了空值。

## 范围说明
GLOSSARY.md 的改动开工前已存在，与本特性无关。
```

分流表是唯一缺陷清单与流程状态源，也是交付时的已修 / 未修 / 修错清单：主代理按审查原文将真实发现逐条进表，检查器不从正文自动发现缺陷，只核对已列编号有原文依据；漏列由人工终审对照原文发现。当前档位与处置状态写当前事实，历史变化写轮次轨迹，转专项或改档成立不锁定后续修复；检查器不解析原文状态词，按轮次轨迹核对待复审编号是否出现在对应轴其后一轮原文，并核对修复证据；表格是否忠实于原文，由人工对照 `qa-check review` 的「原文核对」段确认。S-J 默认驳回且不必进表，只有要修、转专项或需单独说明风险的才进表；P-X 默认撤回越界改动，规则见正本阶段 6 第 4 条。「已修」行的验证证据必须是修复后产生的 `evidence/`、`screenshots/` 文件（针对修复点跑一个脚本、截一张图即可，不必重跑全部验收），或 `静态：<理由>`；不以文件 mtime 判定先后，有可靠事件时间时才核对日志 `started` 与轮次轨迹所指的缺陷审查返回，证据能否证明修复由人工终审判断。`修复尝试记录` 只给下一次修复参考，不提供给审查者，保持审查独立。

---

## 六、检查器输出怎么读

`qa-check` 三个阶段：`plan`（规划结构）、`acceptance`（证据与对账表）、`review`（交付日志、审查包、原文与分流）。结果只有三种：

- **PASS**：机器校验通过。只说明产物齐全、可对账，不证明独立来源、不判断语义、不构成交付授权，人工终审另行认定。
- **FAIL**：机械可修的缺口，按 hint 改产物即可。
- **BLOCKED**：缺材料或等人裁决，例如原文没落盘、复审用尽仍有未修。

非 PASS 时结果行下有一行「阻塞原因：」列出本次的问题码，用来区分待人工裁决与验证失败。

常见问题码：

| 问题码 | 含义 | 怎么修 |
| --- | --- | --- |
| `UNSUPPORTED_SCHEMA` | 计划不是 Schema 4 | 按 Schema 4 重建计划 |
| `MISSING_BINDING_COLUMN` | 执行记录缺「绑定」列 | 表头补列 |
| `PROCESS_SCRIPT_OUTSIDE_SCRIPTS` | browser/api 日志没有引用 `scripts/` 下存在的脚本 | 脚本移进 `scripts/`，换新标签重跑 |
| `ASSERTION_MARKER_MISSING` | 日志里没有该断言的 PASS 标记或实测值为空 | 脚本补标记后换新标签重跑 |
| `ASSERTION_MARKER_CONFLICT` | 日志有 FAIL 标记，记录却写 PASS | 如实改为 FAIL 或修复后重跑 |
| `TEST_BINDING_MISSING` | 绑定为空、文件不存在或找不到标题 | 改绑定列 |
| `TEST_BINDING_OUT_OF_RUN` | 证据命令没跑到绑定的测试文件 | 改绑定，或用覆盖该文件的命令重跑 |
| `AUTH_BYPASS_IN_SCRIPT` | `scripts/` 里有注入 Cookie、写令牌、引入数据库驱动（含工作区里直接依赖驱动的包，如本仓库 `@repo/db`）、密码字面量、登录或注册接口、`window.__*` 上的登录方法等 | 删掉，脚本从已登录状态开始；**不可豁免** |
| `REVIEW_RAW_MISSING` | 最新一轮缺某轴原文 | 用 Skill 工具重新调用 code-review |
| `REVIEW_SOURCE_MISMATCH` / `REVIEW_SOURCE_STALE` | 已定位来源的原文与最终返回不同，或最终返回时间早于当前 collect | 旧轮次可按真实最终返回同轮纠偏；有 challenge 的新协议按新轮次重新审查，不得改原文或重算凭据 |
| `REVIEW_REINPUT_MISSING` | 复审子代理实际输入缺待复核编号 | 把编号与理由真正交给对应轴复审 |
| `REVIEW_RAW_UNNUMBERED` | 最新一轮原文没有规范编号也没写「无发现」 | 多半是绕过了 code-review 技能；用 Skill 工具调用它重新审查 |
| `RECONCILIATION_STALE` | `_qa/reconciliation.md` 缺失或与当前执行记录不一致 | 重跑 acceptance，重新 collect 并复审 |
| `STALE_EVIDENCE` | acceptance 时证据日志 tree 与当前代码不一致 | 换新标签重跑；仅非行为文档变化时在该行备注写「不重跑：<理由>」 |
| `REVIEW_TRIAGE_UNKNOWN` | 分流表编号在任何原文中都不存在 | 删除无依据的分流行，不制造复审 |
| `DEFAULT_FIX_WITHOUT_REASON` | S-H/P-M/P-W 没本次修又没写理由 | 写理由或改为本次修 |
| `FIX_UNVERIFIED` | 「已修」行缺验证证据、可靠 `started` 早于缺陷审查返回、日志 exit 非 0，或分流表缺该列 | 针对修复点生成新证据，或写 `静态：<理由>` |
| `INVALID_DISPOSITION` | 处置状态不在允许值内（如「基本修好」） | 改为已修、未修、修错、改档成立、改档不成立、驳回、转专项之一 |
| `FINDING_NOT_REREVIEWED` | 轮次轨迹所指的上轮本次修或 S-H/P-M/P-W 改档编号没有出现在对应轴其后一轮原文中 | 增量复审时把这些编号交给对应轴；不要改原文 |
| `UNRESOLVED_FINDINGS` | 分流表自报未修、修错、改档不成立，或本次修未填 | 人工裁决 |

另有一类预检：`qa-check` 在 `plan` 与 `review` 阶段检测 Claude Code 个人级同名技能，流程技能同名且内容不同时判 BLOCKED；有 challenge 的新轮次按证据判定来源，宿主声明只作说明；无 challenge 的旧轮次仍按声明兼容。示例编号（演示用的 `[P-M1]` 等）不建档复审，真实缺陷漏复审与时间倒挂证据仍会被拦截。

NOTE 不改变结果，但值得看：

- `SYNTHETIC_INPUT_IN_SCRIPT`：页面内用了 `dispatchEvent`、`.click()`、`.focus()`、`.value` 赋值、`.setState(` 或访问 `window.__*`。合法用途是读状态或构造前置条件；仅保存原始 `fetch` 引用不算，对账表会标「非真实输入」。
- `RESPONSE_INJECTION_IN_SCRIPT`：脚本替换或拦截了网络响应（`window.fetch` 赋值、路由拦截与 fulfill、`cy.intercept`、MSW 处理器）。合法用途是构造前端前置或故障态；对账表会标「响应注入」，这些行的断言只能写端侧结果，核心链路另需真实链路冒烟。
- 来源核验：有 challenge 的新轮次先校验两轴 `.source.json`（nonce、哈希、轮次、轴、时间），再用同 nonce 的 Claude Code 转录核对哈希行；凭据缺失、格式错误或自述时间早于 collect 只给 NOTE，哈希或结构矛盾 FAIL，nonce 不符 BLOCKED；自述凭据缺复审编号只给 NOTE，Claude 转录实际输入缺编号仍 FAIL。无 challenge 的旧轮次沿用全等比对：明确原文失真、复审输入缺编号或最终返回早于 collect 会阻断；无法关联轮次、读取转录或确认事件时间时只给「来源未核验／来源时间未核验」NOTE，交人工。没有 Skill 调用记录也只提示；模型差异不读取、不比较、不提示。

---

## 七、人工终审怎么做

不需要逐行对照 spec。两张表就是入口：

1. **对账表**（`qa-check acceptance` 输出）：每行是“状态 | 冻结原文／当前断言 | 实测值、失败原因或用例标题 | 标注”，PASS、FAIL、BLOCKED 都在同一张表。先看状态，再核对实测值和实际谓词能不能证伪，例如断言要求“编辑按钮热区 ≥44px”，实测写的却是调试台输入框，就是问题。带「非真实输入」「响应注入」的行重点看：响应注入的断言写了“调用工具”“完成质检”之类服务端行为就是越界。
2. **分流表**：先对照 `qa-check review` 输出的「原文核对」段，确认每个编号的处置状态与审查原文最后一次说法一致；再看驳回、转专项理由是否成立；未修、修错条目做裁决：改档并写理由、接受现状，或授权追加修复轮（不计入自动上限）。
3. 抽查截图与 NOTE 指向的转录。

**拿不到独立审查时**：未实际调用或拿不到两份真实独立返回时保持「待独立审查」；宿主无独立上下文能力时，collect 后只交付审查包，不运行最终 `qa-check review`，由独立会话或人工接续；外部会话必须由用户启动，主代理不得自动启动无头审查者。不得自动重试、代写原文、代 seal 或提出 commit。

完整清单见正本第五节第 7 小节。

---

## 八、快慢车道

| 车道 | 判定 | 路线 |
| --- | --- | --- |
| 快车道 | 文案、样式、非核心小修 | `/implement` |
| 标准车道 | 独立功能，涉及模块少，串行可完成 | grill → spec → qa-test-planner → implement |
| 慢车道 | 跨多模块的复杂业务或大功能，或需要并行子代理 | grill → spec → to-tickets → qa-test-planner → implement-spec |

车道在阶段 1 定，实现中发现判错时按正本「车道升级」停下报告、经你确认后只升不降，每个技能结束只建议当前车道路线上的下一步。触及认证、对话、图像、视频、语音、历史、计费等核心链路时，哪条车道都要做浏览器验收。implement-spec 按工单依赖图调度，只有互不阻塞的工单才并行，其余仍串行。交接用 `/handoff`，见下一节。

**车道升级细则**（ADR-0043）：升级沿用当前特性目录。

- 快车道 → 标准车道：由用户依次运行 `/grill-with-docs`（只问未决事项）、`/to-spec`、`/qa-test-planner`。
- 标准车道 → 慢车道：必须补 `/to-tickets`，即使仍串行实现。
- 升级前的 qa-run 日志只作历史，init 前执行记录不得有 PASS 行；基线标签用 `baseline-upgrade-*`，`## 范围说明` 写明「含在途改动，非原始开工前基线」，基线红灯先问用户，不得记为既有失败。
- 未提交的在途改动在 init 后立即对同一批路径 add；已提交的改动在 `## 范围说明` 记下起始提交，把 `<起点>..HEAD` 的 diff 作为补充材料交双轴审查；起点不明时停下请用户指定。
- 升级前已实现的工单保持 `ready-for-agent`，正文注明「升级前已实现，待新基线复验」。

---

## 九、跨会话与跨人交接

所有状态都在磁盘上：spec、qa-plan、`_qa/`、证据、`review/`。

- 同机续接：`/handoff` 写入 `.scratch/<feature>/handoff.md`，新会话一句话唤起：「请阅读 `.scratch/<feature>/handoff.md`，按其中建议的技能继续。」
- 跨人或跨机器：`.scratch/` 不入库，交接写入 `docs/handoff/<日期>-<slug>.md` 并提交。
- 交接文档只引用路径，不复制大段正文；不写 API Key、Token、Cookie 或测试账号密码。

---

## 十、避坑指南

### 坑 1：未探活就开浏览器

`ERR_CONNECTION_REFUSED` 不是业务 Bug。先运行 `node tooling/scripts/dev-port.mjs --probe --wait 90`，未就绪再后台启动 `pnpm dev:web`。

### 坑 2：等 `networkidle`

SSR/HMR/SSE 页面永远等不到网络空闲，或者 HTML 出来了但还没水合，点击无效。等待水合后才出现的可操作元素。

### 坑 3：上游故障改业务代码

接口 500/403/超时，按三层探针定界，排查清楚前不改业务代码：

1. 裸 curl 直连上游官方端点：失败就是网络、防火墙或欠费。
2. 单文件官方 SDK 最简示例：失败就是依赖版本或签名问题。
3. 只接入项目适配器层：这时才是内部数据映射缺陷。

上游鉴权或额度错误确认后，停止盲目枚举，由用户选择阻塞、换 provider、授权当前特性修复或转专项；不得为消除 BLOCKED 擅自修改业务行为。

探针脚本写在特性目录里，不要写系统 `/tmp`。

### 坑 4：强杀端口

`kill -9 $(lsof -t -i:3030)` 可能误杀同事或其他窗口的进程。用 `dev-port.mjs` 在 3031–3059 找可用端口。

### 坑 5：为了过登录走捷径

直连数据库签发令牌、改真实用户密码、注入 Cookie、在脚本里调注册接口造账号或把密码写成常量，都会产生验收范围外的副作用或泄露凭据，现在会被 `AUTH_BYPASS_IN_SCRIPT` 拦下。正确做法：登录在脚本外完成，过程脚本从已登录状态开始。用已有会话；或你在可见窗口自己登录；或在对话里给 Agent 一个**专用测试账号**，它在真实登录页登录一次。

### 坑 6：证据与断言脱节

- 文件存在不证明交互发生：命令输出曾被当成浏览器证据。现在 browser 断言要截图 + 带标记的日志。
- 数值四舍五入：热区实测 43.994px 被写成 44px。数值在脚本内严格断言，标记里写原始实测值。
- 脚本只打印成功：没有硬断言的脚本永远 exit 0，必须失败非零退出。

### 坑 7：环境不足时降级冒充

无 GUI、无法验证 DOM 或移动几何时，记 BLOCKED 或经计划变更转人工，不要用单元测试或命令输出冒充 browser 证据。

### 坑 8：用截图代替几何断言

截图看起来“按钮在”，不代表热区达标、未被遮挡或没有溢出。视觉类断言先在脚本里硬断言目标与视口相交、代表点未被其他元素遮挡，再截目标区域；数值在脚本内严格断言，截图只作佐证。计划变更也不能新增冻结断言之外的呈现要求（如「某几项同屏」），确需新要求时追加断言。

---

## 十一、FAQ

**Q1：改个文案也要走七个阶段吗？**
不用，走快车道。触及核心链路时补 P0 浏览器验收。

**Q2：`ego-browser` 弹出窗口后能手动操作吗？**
可以。验证码、短信登录等可人工接管后交还 Agent。工具选择遵循宿主优先级，无 GUI 时降级 Playwright 并说明。

**Q3：为什么 AI 不能自己 commit？**
提交与推送需要明确责任边界。用户明确要求提交时，Agent 展示文件列表、验证结果和提交信息后执行；push、merge 等需二次确认。

**Q4：测试失败了能改弱断言让它变绿吗？**
不能。计划在 init 时冻结；换入口、换操作方式、改写断言都要在 `## 计划变更` 写明原因并接受审查。

**Q5：复审两轮还没修好怎么办？流程会卡死吗？**
不会卡死。自动修复停止，交付验证照常执行，`qa-check review` 输出 BLOCKED 并列出未解决编号，你拿到一份材料齐全的交付包做裁决。授权追加修复轮不受自动上限约束。

**Q6：审查子代理用什么模型？**
你或宿主配置了子代理模型就照用，没有配置时按宿主机制继承主会话模型。独立审查只看独立上下文、实际输入与真实返回，`qa-check review` 不读取、比较或提示模型差异。

**Q7：检查器能证明 Agent 没作弊吗？**
不能。它能证明产物齐全、编号对得上、日志里有标记、绑定的测试存在且被运行、脚本里没有绕过登录的代码；不能判断实测值是否真的证明断言、截图是否对应、日志是否伪造。这些交给对账表、独立审查和人工终审。所以 `结果: PASS` 只称“机器校验通过”。

**Q8：`/retro` 会让模型记住教训吗？**
不会改变模型。复盘的价值是沉淀为 ADR、规则、回归测试和检查器。复盘时以 `review/` 原文与子代理转录为准，不以 review-report 为准。

**Q9：每次对话都会加载这本指南吗？**
不会。根规则只给入口，正本和技能按阶段读取，本指南按需查阅。

**Q10：QA 工作流自身怎么发布验收？**
工具测试不够。另以干净会话做一次真实 /implement dogfood，确认独立上下文审查真实发生、无独立上下文能力时能合法暂停；手动派发 reviewer 不冒充这项发布验收，未完成时保持“待发布验收”，不得写成完成态。QA 工作流负责最终交付，code-review 只返回两轴发现。

**Q11：非 Claude Code 宿主怎么核对审查来源？**
子代理转录格式不是公开契约，所以不逐宿主适配。`collect` 发放一次性 challenge，子代理自写原文并 seal 出带 nonce、sha256 与事件时间的凭据；`qa-check` 只认产物：Claude Code 有同 nonce 转录时做哈希行强核验，其他宿主按「自述凭据（弱）」处理，两者都没有时交人工。Codex 等无子代理宿主由用户手动另开独立会话审查，并用同一 nonce seal。

**Q12：修复已交付特性的缺陷怎么走？**
新建 `.scratch/<feature>-fix-<n>/`，spec 只列本轮缺陷并引用原 US，计划头写 `QA Kind: fix`；每个 TC 在 `## 修复前复现` 引用同 argv、更早且 tree 不同的红日志，不改写原特性的执行记录。

**Q13：视觉类断言只截图不够吗？**
不够。截图不能证明数值、热区和遮挡。先在脚本里硬断言目标与视口相交、代表点未被其他元素遮挡，再截取目标区域；Spec 轴仍按冻结断言原文复核截图。

---

> 相关文件：正本 `docs/agents/qa-workflow.md`；根规则 `CLAUDE.md`；决策记录 `docs/adr/`（Schema 4 见 ADR-0033，审查来源核验见 ADR-0048）；思维快捷键 `docs/agents/prompt-shortcuts.md`。
