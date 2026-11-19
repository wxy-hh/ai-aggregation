# QA 工作流审计与收敛修复报告

- 日期：2026-11-18
- 特性目录：`.scratch/qa-review-integrity/`
- 关联 ADR：`docs/adr/0057-qa-review-integrity-and-gate-evidence.md`
- 关联演进记录：`docs/reports/qa-workflow-evolution-report.md`
- 结论状态：实现与验收已完成；正式独立审查门禁仍待闭合，不宣称交付完成。

## 1. 背景

本报告记录一次基于真实任务产物的 QA 工作流审计与修复。审计输入不是模型自述，而是两组真实任务留下的执行记录与产物：

- `.scratch/server-text-preprocessing/retro-evidence.md`
- `.scratch/knowledge-faq-match-policy/retro-evidence.md`

此前的演进结论记录在 `docs/reports/qa-workflow-evolution-report.md`。本轮先对照真实产物识别系统性缺口，再以 ADR-0057 固化机制，随后通过双模型独立审查、交叉质询和主代理直接审查，找出实现与文档中的残留问题并收敛修复。

## 2. 审查方法

### 2.1 双轴独立审查

第一轮审查按 `code-review` 技能拆成两个互不读取对方原文的独立轴：

| 轴 | 审查者 | 关注点 | 结果 |
| --- | --- | --- | --- |
| Standards | GPT-5.6-terra | 仓库成文规范、职责边界、模板同步、维护成本 | 无发现 |
| Spec | DeepSeek 4.1 | 冻结断言、证据绑定、VisualTarget、范围漂移 | 两项非行为缺陷候选 |

两份原文与 `.source.json` 均落在 `.scratch/qa-review-integrity/review/`，并分别执行了 `review-package seal`。审查期间没有重跑测试、没有启动服务、没有读取同轮另一轴原文，也没有跨特性读取其他 `.scratch/` 目录。

### 2.2 交叉质询

为避免单一审查轴的结论被直接接受，在正式审查轮次之外另做了一轮不计入正式凭据的交叉质询：

- 让 Standards 审查者逐条证伪 Spec 轴提出的两项测试覆盖缺口；
- 让 Spec 审查者反向压力测试 Standards 轴的“无发现”结论。

交叉质询的结论比首轮更精确：

- 两项测试覆盖缺口确实对应冻结断言，但当前实现行为正确，应作为回归保护补强，而不是阻塞交付的实现缺陷；
- “无发现”整体成立，但安装契约与工具索引存在可举证的文档漂移；
- `pnpm qa:check` 快捷方式与门禁日志识别形状不一致，属于提示/健壮性问题，不应为此扩大解析器。

### 2.3 主代理直接审查

用户明确要求不再派子代理复审后，主代理直接审查了本轮修复涉及的代码、测试与文档。直接审查不作为独立审查凭据，只用于发现并修正实现与文档的一致性问题。

## 3. 问题清单

### 3.1 首轮实现已覆盖的系统性缺口

前序实现已针对真实任务暴露的五类问题建立机制：

| 问题 | 机制 |
| --- | --- |
| 空证据假阳性：命令 exit 0 但输出“没有匹配项目”或“0 项测试” | `qa-run` 识别空运行并转为非零退出；`qa-check` 对既有日志报 `EMPTY_EVIDENCE` / `EMPTY_VERIFICATION` |
| Spec 审查泛泛总结、漏行、错 TC 映射、虚构源码引用 | acceptance 导出 `_qa/spec-review-checklist.json`；Spec 原文强制 `## 对账覆盖` 五列表；`qa-check review` 机械校验 ID 完备、绑定相等、源码存在与计划变更结论 |
| 视觉证据用整页、标题或状态卡冒充目标区域 | `captureTargetGeometry` 将同一 target 绑定到 probe、几何硬断言与截图 `clip`；失败不落盘；移动视口在 `finally` 复位 |
| 先跑最终交付再审查、门禁结果未落盘 | 统一 `gate-plan-*`、`gate-acceptance-*`、`gate-review-*`；最终交付日志不得早于当前有效双轴审查完成时间 |
| 未声明的新文件静默进入审查包 | Schema 4 只接受 `## 计划新建路径` 中显式声明且当前/base 均不存在的路径 |

这些机制的实现细节见 ADR-0057，本报告不重复展开。

### 3.2 本轮审查发现的问题

| 编号 | 问题 | 初始等级 | 校准结论 |
| --- | --- | --- | --- |
| P-M1 | TC07-5 缺少“plan 与当前 tree acceptance 门禁都有效时不误报 `GATE_EVIDENCE_MISSING`”的正向断言 | P-M | 确认为回归保护缺口；实现当前正确，补强而非阻塞 |
| P-M2 | TC02-7 缺少“未变化断言的计划变更复核列不是‘不适用’时报 `SPEC_PLAN_CHANGE_REVIEW_MISSING`”的反例 | P-M | 同上 |
| DOC-1 | 安装器只分发四个核心工具，但流程模板把 `captureTargetGeometry` 写成硬要求；新装项目拿不到该 API | P1 文档/安装契约 | 确认成立，优先修复 |
| DOC-2 | `tooling/scripts/README.md` 未列出 `qa-spec-review.mjs` 与 `captureTargetGeometry`，且仍写“三个脚本一致性” | P1 文档漂移 | 确认成立，与 DOC-1 同批修复 |
| DOC-3 | 流程模板在 helper 未分发时仍把具体 API 写成唯一实现 | P1 契约冲突 | 改为“提供时使用，未提供时按同一契约自写” |
| DOC-4 | ADR-0057 决策 10 仍写“三个核心脚本、四个零依赖工具” | P3 文档一致性 | 直接审查发现并修正 |
| DOC-5 | qa-plan 范围说明把 358 项与旧 TC09 日志称为“最新”，且替换证据时把 358 项错挂到 361 项新日志 | P3 文档准确性 | 直接审查发现并修正 |
| OBS-1 | README 允许 `pnpm qa:check`，但门禁日志识别只接受 `node .../qa-check.mjs` 形态 | P3 提示/健壮性 | 不为它泛化解析器；在 README 明确 gate 日志必须 Node 直调 |
| OBS-2 | TC08-6 冻结断言仍写“三个既有工具”，测试已覆盖五个模板 | 观察项 | 断言仍为真但不完整；不改冻结断言，避免额外计划变更 |

### 3.3 为什么没有继续加机制

本轮刻意没有引入新的门禁、Hook、Schema 或抽象，原因如下：

- P-M1/P-M2 是测试保护缺口，不是当前行为错误；补两条断言即可，不需要新增检查器；
- `pnpm qa:check` 的 argv 形状问题用文档说明成本最低，泛化解析器会引入新的误识别面；
- TC08-6 的措辞虽然不完整，但断言本身没有变成假命题，改冻结文本需要再走一轮计划变更与验收，收益不足；
- 用户明确要求“避免过度防御”，有规格支撑、测试覆盖且没有当前成本的机制不应被升级为缺陷。

## 4. 修复方案与实施

### 4.1 分发浏览器辅助模块

新增 `.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs`，内容与 `tooling/scripts/qa-browser-helper.mjs` 逐字一致。安装器现在会把它复制到新项目的 `tooling/scripts/`，使流程模板中的 `captureTargetGeometry` 不再是“文档要求一个未交付 API”。

同时更新 `.claude/skills/setup-qa-workflow/SKILL.md` 第 5 步：

- 四个核心工具之外，明确复制 `templates/qa-browser-helper.mjs`；
- 说明视觉目标原语按仓库薄辅助模块契约使用；
- 明确新增纯函数 module 与辅助模块都必须同步。

### 4.2 补齐工具索引

更新 `tooling/scripts/README.md`：

- 新增 `qa-spec-review.mjs` 条目，说明清单序列化/解析与覆盖表解析职责；
- 在 `qa-browser-helper.mjs` 条目中补 `captureTargetGeometry`；
- 把“修改工具或模板后检查三个脚本”改为“检查四个工具与 `qa-browser-helper.mjs` 对应模板”；
- 在 `qa-check.mjs` 条目中注明：`gate-plan-*` 与 `gate-acceptance-*` 必须经 `qa-run` 直接调用 `node .../qa-check.mjs` 生成，`pnpm qa:check` 快捷方式生成的 argv 不会被门禁识别。

### 4.3 调整流程模板契约

更新以下三处，保持语义一致：

- `.claude/skills/setup-qa-workflow/templates/qa-workflow.md`
- `docs/agents/qa-workflow.md`
- `docs/agents/qa-workflow-guide.md`

原措辞把 `captureTargetGeometry` 写成所有项目都必须具备的 API。新措辞为：

> helper 提供 `captureTargetGeometry` 时，它要求 probe 返回同一 target 与有效矩形，断言成功后按矩形裁剪；未提供时按同一契约自写，移动视口同样在 `finally` 复位。

这样既保留 VisualTarget 的硬语义，也不把未分发模块写成新装项目的唯一实现。

### 4.4 增加回归断言

在 `tooling/scripts/__tests__/qa-spec-review.test.mjs` 增加：

- TC07-5 正向路径：`newProtocolRepo` 创建完整 plan 与当前 tree acceptance 日志后，断言报告不包含 `GATE_EVIDENCE_MISSING`；
- TC02-10 反例：未变化断言把计划变更复核列写成 `变更成立` 时，断言报告包含 `SPEC_PLAN_CHANGE_REVIEW_MISSING`。

在 `tooling/scripts/__tests__/qa-browser-helper.test.mjs` 增加：

- TC08 安装模板与仓库 `qa-browser-helper.mjs` 逐字一致。

在 `tooling/scripts/__tests__/qa-workflow-contract.test.mjs` 增加/调整：

- 安装器必须包含 `templates/qa-browser-helper.mjs`；
- 流程模板必须包含“helper 提供 `captureTargetGeometry`”与“未提供时按同一契约自写”；
- 工具索引必须列出四个可分发工具、`qa-browser-helper.mjs`、`captureTargetGeometry` 与 `gate-plan-*`；
- 模板逐字一致测试从三个工具扩展到五个脚本。

### 4.5 同步计划与 ADR

- `.scratch/qa-review-integrity/spec.md`：US18 增加辅助模块分发；新增实现决策 12；Testing Decisions 增加工具索引与模板同步。
- `.scratch/qa-review-integrity/qa-plan.md`：新增 TC02-10、TC08-8；把 TC07-5 明确为“当前 tree acceptance 门禁”；在 `## 计划变更` 记录本轮收敛修复；执行记录切换到当前树的审计日志。
- `docs/adr/0057-qa-review-integrity-and-gate-evidence.md`：决策 10 改为“新增纯函数模块、核心脚本与浏览器辅助模块同步进入安装模板；安装器复制四个零依赖工具和 `qa-browser-helper.mjs`”。

### 4.6 证据更新

由于测试与文档变化导致旧日志 tree 过期，执行记录统一切换到当前树证据：

- 全量工具测试：`evidence/impl-full-tooling-tests-audit.log`（361 项通过）
- ESLint：`evidence/impl-full-tooling-eslint-audit.log`（exit 0）
- 验收门禁：`evidence/gate-acceptance-audit-2.log`（结果 PASS）
- TC09 真实 Chrome 冒烟：`evidence/tc09-visual-target-audit.log`（4/4 通过）
- TC09 截图：`screenshots/visual-target-1794972323547.png`（PNG 120×80）

旧日志 `impl-full-tooling-tests-3.log`、`tc09-visual-target-final-2.log` 保留为历史证据，不再作为当前执行记录的依据。

## 5. 验证结果

| 检查 | 命令 | 结果 | 证据 |
| --- | --- | --- | --- |
| 全量工具测试 | `node --test 'tooling/scripts/__tests__/*.test.mjs'` | 361/361 PASS | `evidence/impl-full-tooling-tests-audit.log` |
| ESLint | `pnpm exec eslint tooling/scripts` | exit 0 | `evidence/impl-full-tooling-eslint-audit.log` |
| 文档契约复跑 | `node --test tooling/scripts/__tests__/qa-workflow-contract.test.mjs` | 69/69 PASS | 直接命令输出 |
| 验收门禁 | `node tooling/scripts/qa-run.mjs ... gate-acceptance-audit-2 -- node tooling/scripts/qa-check.mjs acceptance ...` | 结果 PASS | `evidence/gate-acceptance-audit-2.log` |
| TC09 真实 Chrome | `node .scratch/qa-review-integrity/scripts/visual-target-smoke.mjs` | 4/4 PASS；截图 120×80 | `evidence/tc09-visual-target-audit.log` |
| 模板逐字一致 | `cmp` 五个脚本与模板 | 全部 SAME | 直接命令输出 |
| 空白检查 | `git diff --check` | 无输出 | 直接命令输出 |

模板逐字一致覆盖：

```text
SAME qa-check.mjs
SAME review-package.mjs
SAME qa-run.mjs
SAME qa-spec-review.mjs
SAME qa-browser-helper.mjs
```

## 6. 正式门禁状态

`node tooling/scripts/qa-check.mjs review .scratch/qa-review-integrity` 当前为 `BLOCKED`，原因如下：

| 代码 | 含义 | 当前原因 |
| --- | --- | --- |
| `STALE_REVIEW_PACKAGE` | 审查包 digest 与当前代码不一致 | ADR 文案在 r2 collect 之后修正 |
| `MISSING_REVIEW_REPORT` | 缺少 `review-report.md` | 尚未汇总三档分流与范围说明 |
| `REVIEW_RAW_MISSING` | 缺少 r2 Standards 原文 | 用户明确要求不再派子代理复审；主代理不代写、不伪造独立审查原文 |
| `OUT_OF_SCOPE_CHANGES` | 开工后出现范围外改动 | 40 个其他并行任务的业务文件、lockfile、`dev.mjs` 等 |
| `MISSING_VERIFICATION` | 交付验证表仍为“待执行” | 最终交付命令尚未在审查后落盘 |

因此：

- 已封存的 Spec 轴 r2 结论为 `[P-M1] 已修`、`[P-M2] 已修`，TC07-5 计划变更判“变更成立”；
- Standards 轴 r2 没有独立原文与凭据；
- 主代理直接审查发现并修正了文档问题，但这不构成独立审查；
- 当前不得宣称“交付完成”，也不应把 `qa-check acceptance` 的 PASS 当作最终审查通过。

## 7. 变更文件清单

### 7.1 本轮收敛修复直接涉及

| 文件 | 变更 |
| --- | --- |
| `.claude/skills/setup-qa-workflow/SKILL.md` | 安装器分发 helper 模板 |
| `.claude/skills/setup-qa-workflow/templates/qa-browser-helper.mjs` | 新增；与仓库 helper 逐字一致 |
| `.claude/skills/setup-qa-workflow/templates/qa-workflow.md` | helper API 改为“提供时使用/未提供时自写” |
| `tooling/scripts/README.md` | 补 `qa-spec-review.mjs`、`captureTargetGeometry`、五脚本同步与 gate 日志直调说明 |
| `tooling/scripts/__tests__/qa-browser-helper.test.mjs` | 新增模板逐字一致测试 |
| `tooling/scripts/__tests__/qa-workflow-contract.test.mjs` | 扩展安装器、流程模板、工具索引与五脚本同步契约 |
| `tooling/scripts/__tests__/qa-spec-review.test.mjs` | 新增 TC02-10 与 TC07-5 正向保护 |
| `docs/agents/qa-workflow.md` | 同步 helper 契约措辞 |
| `docs/agents/qa-workflow-guide.md` | 同步 helper 契约与安装说明 |
| `docs/adr/0057-qa-review-integrity-and-gate-evidence.md` | 修正决策 10 的安装范围 |
| `.scratch/qa-review-integrity/spec.md` | 增加辅助模块分发与测试决策 |
| `.scratch/qa-review-integrity/qa-plan.md` | 新增/调整断言、计划变更、执行记录与范围说明 |

### 7.2 首轮实现已包含、本报告不逐行展开

- `tooling/scripts/qa-spec-review.mjs`
- `tooling/scripts/qa-check.mjs`
- `tooling/scripts/qa-run.mjs`
- `tooling/scripts/qa-browser-helper.mjs`
- `tooling/scripts/review-package.mjs`
- 对应测试、技能、模板与正本文档

## 8. 经验与后续建议

1. **安装契约要成组维护**：新增一个核心工具或公共模块时，同一批必须更新安装器、README 索引、逐字同步测试和流程模板；只改其中一处会留下“文档要求一个不存在的 API”的漂移。
2. **门禁日志的 argv 形状是契约**：`pnpm qa:check` 适合人工排查，但不适合作为 `gate-*` 日志来源；文档应明确这一点，而不是让解析器猜测包管理器前缀。
3. **测试覆盖缺口与行为缺陷要分开**：P-M1/P-M2 是“未来回归可能静默通过”，不是“当前行为错误”；补断言即可，不应升级为阻塞或新增机制。
4. **不要对证据路径做无差别替换**：证据日志与断言文本存在语义绑定，批量替换可能把旧计数挂到新日志上；本轮已通过直接审查发现并修正。
5. **独立审查不能被直接审查替代**：主代理直接审查可以发现问题，但不产生独立来源凭据；需要正式交付时，仍应在独立上下文补 Standards 轴复审，并在最终代码上重新 collect。
6. **避免过度防御**：有明确 spec 支撑、测试覆盖且没有当前成本的机制，不应因为“可能更安全”而继续加门禁；本轮对 `pnpm qa:check` 和 TC08-6 的处理都遵循了这一原则。

## 9. 审查凭据摘要

| 轮次 | 轴 | 审查者 | 结论 | 凭据前缀 |
| --- | --- | --- | --- | --- |
| r1 | Standards | GPT-5.6-terra | 无发现 | `4d8b398e...|05609d43...` |
| r1 | Spec | DeepSeek 4.1 | P-M1、P-M2 | `4d8b398e...|02b69903...` |
| r2 | Spec | DeepSeek 4.1 | P-M1 已修、P-M2 已修 | `07fb87bd...|19b988e3...` |
| r2 | Standards | 未产生 | 用户要求不派子代理 | 无独立凭据 |

完整原文与凭据文件位于 `.scratch/qa-review-integrity/review/`。

## 10. 结论

本轮修复解决了三类实际问题：

1. 新装项目拿不到流程模板要求的浏览器辅助 API；
2. 工具索引与安装范围不一致，维护者会漏查新增模块；
3. 两条冻结断言缺少正向/反向回归保护，未来误报可能静默通过。

当前代码、模板与文档已同步，工具测试、ESLint、验收门禁和真实 Chrome 冒烟均通过。正式 `qa-check review` 仍因缺少独立 Standards 轴原文、审查包过期和最终交付验证未执行而阻塞；本报告不把这一状态表述为交付完成。
