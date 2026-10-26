---
name: code-review
description: "双轴代码审查：并行检查代码规范（Standards）与需求规格一致性（Spec），覆盖完整的未提交交付变更。"
---

对当前交付变更执行 Standards + Spec 双轴审查，而不是只检查 `HEAD`。两轴在中大型改动中由独立于实现者的审查者完成，主 Agent 汇总但不合并、不互相重排结论；小型快车道按 `docs/agents/qa-workflow.md` 剪裁。

## 完成标志

以下项目缺一不可，缺一项不得宣称审查已经完成：

- 独立于实现者的 Standards 与 Spec 审查已经执行，`review-report.md` 已落盘并包含证据审计和 Spec 对账；
- 最终代码上的交付验证日志 argv 正确、exit 0、tree 新鲜，审查包也与当前 tree 一致；
- 本会话 `node tooling/scripts/qa-check.mjs review .scratch/<feature>` 输出 `结果: PASS`，汇报附上该行。

## 1. 确定 spec、基线与审查范围

按以下优先级确定 Base，不假定仓库存在 `main`：

1. 用户显式提供的 commit、branch、tag 或相对引用；
2. 特性 `scope.json` 的 `base`，由 `/implement` 在改代码前通过 init 记录；
3. 旧流程特性目录的 `review-base`；
4. 可明确说明覆盖范围的 upstream 或远端默认分支；
5. 无法可靠判断时只询问一次，不在每个审查子代理中重复追问。

读取 Base 后验证：

```bash
git cat-file -e "${BASE}^{commit}"
test "$(git merge-base HEAD "$BASE")" = "$BASE"
```

若记录失效，说明原因并使用下一优先级；不得把无法解析的 Base 直接传给子代理。回退 Base 可能扩大审查范围，必须显式报告。

同时确定 spec 和路径范围：

- spec 优先使用用户路径、工单引用或与当前特性匹配的 `.scratch/<feature>/spec.md` / `docs/features/**/spec.md`；中大型改动缺少 spec 时只询问一次。
- 工作区有无关改动时，只审查用户或特性 spec 指定的路径，不把其他工作混入。
- 审查相关规范包括 `CLAUDE.md`、`.claude/rules/`、相关 ADR、`DESIGN.md`（UI 时）及仓库已有标准。

## 2. 只读构建完整审查包

运行增量审查收集器：

```bash
node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>
```

该命令生成 `review-package.diff` 与 v2 `review-package.json`。manifest 的 `outOfScope` 暴露开工后范围外改动，`preexisting` 标明开工前已有且未通过 add 纳入的修改，`treeDigest` 绑定收集时的代码。开工前已有但未继续修改的内容不会混入 diff；新增、删除和相关未跟踪文本按规则纳入。

- 阶段产物或流程工具修复属于本任务但未纳入时，先运行 `review-package.mjs add`，再重新 collect；禁止手改 `scope.json` / `prechange/`。
- 范围外改动不属于本任务时，在报告 `## 范围说明` 逐个写明来源；未说明则为 BLOCKED。
- 当前 tree 与 manifest 不一致时审查包已过期，必须重新 collect 并复审受影响结论。
- 未变化跳过文件不再自动算未审查；发生变化或无法比较的敏感、二进制、超大文件列入 `unreviewed`，不得声称已覆盖其内容。
- **禁止为审查执行 `git add`、`git add -N`、commit、reset 或 checkout。** diff 为空且无未审查文件时报告“无变更”，不要启动两个审查子代理。
- 无 `scope.json` 的旧流程才回退 `git diff <base>` 与 `git diff --no-index`，并显式说明兼容边界。

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

## 4. 独立执行两个审查轴

中大型改动分别启动 Standards 和 Spec 子代理，不额外增加第三名 QA 或裁决代理，不自动指定或升级模型。优先使用只读审查角色；宿主不支持角色限制时，在提示词中明确禁止写文件。宿主提供子代理 ID 时，将其写进报告的审查方式行。

**Standards 子代理输入**：审查包路径、commit 列表、规范来源和完整坏味道基线。按文件/hunk 报告违反的标准及出处、可能的坏味道及证据，区分硬违规与判断题。

**Spec 子代理输入**：审查包路径、commit 列表、spec、冻结计划与证据路径。除缺失、超范围和错误实现外，还要完成证据审计：

1. 逐个 TC 核对接缝、真实入口与操作是否与原始断言一致，不能用低接缝证据冒充 browser；
2. 核对交互是否来自真实输入事件，注入是否只构造前置条件并在备注标明；
3. 核对截图是否独立且新鲜、是否跨 TC 复用，数值阈值是否在脚本内严格断言；
4. 核对过程脚本是否位于特性目录并经 qa-run 执行，修复轮红绿日志是否同源、顺序和 tree 合格；
5. 每个 US 都必须出现一次在报告的 `## Spec 对账`，格式为 `| US | PASS/FAIL/BLOCKED | 证据或原因 |`，遗漏即 FAIL。

## 5. 报告结构与三档分流

报告必须落盘为 `.scratch/<feature>/review-report.md`，包含：

- 一行 `审查方式：…`，写明独立审查者、会话或子代理 ID，实现者自查不算独立审查；
- 非空 `## Standards`、`## Spec` 和 `## 证据审计`，分别保留两轴结论和逐 TC 核对结果；
- `## Spec 对账`、`## 三档分流` 和 `## 范围说明`，可附文件级高危雷达但不形成第三轴。

所有发现分为“本次修 / 转专项 / 驳回”：本次修重跑受影响验证；转专项写入报告的遗留事项并说明独立处理理由；驳回记录 ADR 或契约依据。不得把转专项写回 Schema 3 qa-plan 来消除审查问题。

Schema 1 继续采用 qa-plan 中的 Spec 对账；Schema 2 保留原 manifest、diff 和报告规则；Schema 3 只采信 review-report 中的 Spec 对账，并要求上述完整结构。

## 6. 复验与交付边界

- “本次修”触及核心链路时重跑对应浏览器用例；其他修复至少重跑相关测试和静态检查。
- 在最终代码上通过 qa-run 执行计划声明的全部交付命令，日志 argv 必须一致、exit 0、tree 不得为 none 且必须等于当前 tree。
- 运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`；只有本会话输出 `结果: PASS` 才能写“代码审查状态：已通过”，并附上该行。
- LEGACY 仅表示旧计划未校验，不冒充 PASS；不自动重试，不为退出码修改业务断言。
- 报告实际变更、证据、遗留事项和未验证项。是否 commit、push、合并由用户按 `.claude/rules/git-workflow.md` 决定。

## 为什么保留两个轴

符合全部规范但实现错误需求，应当是 Standards PASS、Spec FAIL；实现需求却破坏仓库契约，应当是 Spec PASS、Standards FAIL。分轴是为了避免一个轴的通过掩盖另一个轴的问题。
