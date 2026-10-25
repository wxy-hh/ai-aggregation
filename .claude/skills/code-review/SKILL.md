---
name: code-review
description: "双轴代码审查：并行检查代码规范（Standards）与需求规格一致性（Spec），覆盖完整的未提交交付变更。"
---

对当前交付变更执行 Standards + Spec 双轴审查，而不是只检查 `HEAD`。两轴在中大型改动中使用并行子代理保持上下文独立，主 Agent 汇总但不合并、不互相重排结论；小型快车道按 `docs/agents/qa-workflow.md` 剪裁。

## 1. 确定 spec、基线与审查范围

按以下顺序确定 Base，不假定仓库存在 `main`：

1. 用户显式提供的 commit、branch、tag 或相对引用；
2. 特性目录的 `review-base`，由 `/implement` 在开工时记录；
3. 可明确说明覆盖范围的 upstream 或远端默认分支；
4. 无法可靠判断时只询问一次，不在每个审查子代理中重复追问。

读取 Base 后验证：

```bash
git cat-file -e "${BASE}^{commit}"
test "$(git merge-base HEAD "$BASE")" = "$BASE"
```

若记录失效，说明原因并使用下一优先级；不得把无法解析的 Base 直接传给子代理。回退 Base 可能扩大审查范围，必须显式报告。

同时确定 spec 和路径白名单：

- spec 优先使用用户路径、工单引用或与当前特性匹配的 `.scratch/<feature>/spec.md` / `docs/features/**/spec.md`；中大型改动缺少 spec 时只询问一次。
- 工作区有无关改动时，只审查用户或特性 spec 指定的路径，不把其他工作混入。
- 审查相关规范包括 `CLAUDE.md`、`.claude/rules/`、相关 ADR、`DESIGN.md`（UI 时）及仓库已有标准。

## 2. 只读构建完整审查包

运行增量审查收集器，生成基于开工前快照的审查包：

```bash
node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>
```

该命令逐文件比对开工前内容与当前内容，生成 `.scratch/<feature>/review-package.diff` 与 `review-package.json`（清单）。开工前已有的未提交修改若未在本任务中再次变动，**绝对不会混入审查包**；开工后的修改、新增文本、删除以及相关未跟踪文本均以标准 `git diff` 格式纳入。**禁止为审查执行 `git add`、`git add -N`、commit、reset 或 checkout。**

- 若特性目录下尚未初始化快照，或为兼容老流程，回退使用 `git diff <base> -- <路径白名单>` 与 `git diff --no-index -- /dev/null <新增文件>` 组合。
- 不自动读取秘密文件、二进制、依赖目录、构建产物或锁文件。敏感或过大文件自动登记在 `manifest.unreviewed` 中，必须标为“未审查”，不能据此声称完整通过。
- 审查包 diff 为空且无未审查文件时，直接报告“无变更”，不要启动两个审查子代理。
- 向子代理传 diff 文件路径而非反复粘贴全文。

## 3. Standards 规范轴

除仓库标准外，始终携带以下 Fowler 坏味道基线；仓库明确允许的设计优先，工具已强制检查的问题不重复报告。坏味道是判断线索，不自动等于硬缺陷：

- **Mysterious Name**：命名无法揭示用途，改成真实语义。
- **Duplicated Code**：同一逻辑形态重复出现，提取共享实现。
- **Feature Envy**：方法过度使用其他对象的数据，考虑迁移职责。
- **Data Clumps**：多个字段总是成组传递，形成有领域意义的类型。
- **Primitive Obsession**：裸原始类型代替领域值对象，收敛为明确类型。
- **Repeated Switches**：相同类型判断反复出现，使用多态或共享映射。
- **Shotgun Surgery**：一个逻辑变化迫使散落修改，聚拢变化职责。
- **Divergent Change**：同一模块因多个无关原因变化，重新划分职责。
- **Speculative Generality**：没有当前需求的抽象、参数或钩子，删除或内联。
- **Message Chains**：过长的对象导航链，隐藏实现路径。
- **Middle Man**：仅转发的中间层，移除无价值委托。
- **Refused Bequest**：继承后拒绝大部分父类契约，改用组合。

## 4. 并行执行两个审查轴

中大型改动分别启动 Standards 和 Spec 子代理，不额外增加第三名 QA 或裁决代理，不自动指定或升级模型。优先使用只读审查角色；宿主不支持角色限制时，在提示词中明确禁止写文件。

**Standards 子代理输入**：审查包路径、commit 列表、规范来源和完整坏味道基线。要求按文件/hunk 报告：违反的仓库标准及出处、可能的坏味道及证据；区分硬违规与判断题，跳过工具已覆盖项，中文不超过 400 字。

**Spec 子代理输入**：审查包路径、commit 列表和 spec 路径。要求检查：

1. 缺失或部分实现的用户故事；
2. 超出 spec 的行为；
3. 看似实现但行为错误的需求；
4. 每个 `## User Stories` 数字都必须出现一次在 `## Spec 对账` 中，格式为 `| US | PASS/FAIL/BLOCKED | 证据或原因 |`。遗漏编号即 Spec 轴 FAIL，禁止无编号的“全部通过”。

## 5. 汇总与三档分流

分别保留 `## Standards` 与 `## Spec`，可以轻度清理措辞，但不合并或跨轴重排。最后分别报告发现数和最高严重度。

追加一次文件级**高危雷达**，覆盖已跟踪和未跟踪路径：权限、共享状态/并发、重试与幂等、多步写入一致性、迁移与回滚。只输出触及区域及人工复核指针，不形成第三轴。

所有发现必须分为：

- **本次修**：琐碎且安全的当前范围问题，修复后重跑受影响验证；
- **转专项**：结构性或超出当前范围的清理，追加到 qa-plan 的 `## 遗留事项`，说明独立处理理由；
- **驳回**：有 ADR 或明确契约支持的有意设计，记录理由，防止重复报警。

汇总报告必须落盘保存为 `.scratch/<feature>/review-report.md`，并在其中清晰记录 `## Standards`、`## Spec`、高危雷达与三档分流结论。
Schema 1 计划将完整的 `## Spec 对账` 写入 qa-plan；Schema 2 计划必须同时具备 `review-report.md`、`review-package.json` 及通过的对账表，任何未审查文件、未覆盖 US 或未处理阻断项都不能表述为完整通过。

## 6. 复验与交付边界

- “本次修”触及核心链路时，原浏览器证据对改动行为失效，必须重跑对应用例；非核心改动至少重跑相关测试和静态检查。
- 完成后运行 `pnpm qa:check -- review .scratch/<feature>`。无 Schema 标记的历史计划只报告 LEGACY 未校验，不阻断，也不冒充 PASS。
- 不自动重试检查器，不为了退出码修改业务断言。
- 报告实际变更、证据、遗留事项和未验证项。是否 commit、push、合并由用户按 `.claude/rules/git-workflow.md` 决定。

## 为什么保留两个轴

符合全部规范但实现错误需求，应当是 Standards PASS、Spec FAIL；实现需求却破坏仓库契约，应当是 Spec PASS、Standards FAIL。分轴是为了避免一个轴的通过掩盖另一个轴的问题。
