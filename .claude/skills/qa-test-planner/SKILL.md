---
name: qa-test-planner
description: "QA 测试规划器：根据 spec 生成 Schema 4 的 qa-plan.md（冻结断言、接缝选择、执行记录与交付验证），供 QA 工作流阶段 3B 使用。"
trigger: explicit
---

# QA Test Planner

> **Activation:** This skill is triggered only when explicitly called by name (e.g., `/qa-test-planner`, `qa-test-planner`, or `use the skill qa-test-planner`).

---

## 项目约定

输出落盘与全流程见 `docs/agents/qa-workflow.md`。

### 规划原则

1. **自动化友好定位器**：浏览器操作步骤标注按钮/链接文案、语义角色、占位符或 `data-testid`；非浏览器用例标注实际命令和公开接缝。
2. **可量化断言**：预期具体到页面文案、URL、HTTP 状态、元素状态、命令退出码或持久化终态，且必须推导自 spec/PRD/工单；禁止先观察实现再反向固化预期。
3. **优先级与视口**：按 P0 → P1 → P2 执行；涉及响应式导航或操作栏时注明桌面/移动入口，并过滤可见元素。
4. **对抗清单**：按改动风险检查重复提交、并发、弱网、超时、中断、越权、隐私、脏数据和恢复，不机械地为每个需求堆满全部场景。
5. **关键决策覆盖**：对短路、权限、状态切换、降级等关键决策，按风险核对触发条件、排除条件和降级路径；`Covers` 只承担需求追踪，不等于风险覆盖完整，不机械要求每个 US、P0 或 TC 都增加正反用例。
6. **目标行为与合适接缝**：模型是否调用、下载响应、权限过滤、持久化等系统侧结果优先由 api、integration、unit 或 static 证明；browser 负责真实入口、交互和用户可见终态，不把全部断言堆到浏览器。浏览器断言必须关联本次操作新产生的结果，不能以页面旧文本、按钮可用或固定等待代替目标行为；视口、输入方式和数值阈值须与冻结断言一致，环境降级或证据不足记 BLOCKED，不改弱断言冒充通过。
7. **条件断言**：写明前置状态与构造方式（例如接口响应注入，并在备注写明）；给不出构造方式的分支改到能触发它的接缝。依赖故障才出现的 UI 状态按“接口响应注入前置状态 + 真实输入”规划，从真实故障到该状态由 integration 证明。

### 成本边界

- 默认 `QA Mode: inline`，由主 Agent 规划，不新增子代理。认证、计费、权限、隐私、物理删除/迁移和公共契约可建议使用独立规划，但不自动派发、不阻断交付。
- 只有用户显式 `/qa-test-planner --independent` 才允许增加 **1 个**新上下文规划子代理。调用不传 `model`、不自动升级模型、不允许再次派发；只提供 spec、必要领域文档和本契约，主 Agent 负责落盘。
- fresh context 不等于 different model。阶段 5 浏览器验收始终由主 Agent inline 执行，不交给独立 QA。
- 阶段 6 沿用 Standards + Spec 双轴，不额外增加第三名 QA 或裁决代理。

### Schema 4 输出契约

计划声明 `QA Schema: 4`、`QA Mode: inline|independent` 和可选 `QA Kind: feature|fix`（默认 feature）。Spec 保持 `## User Stories` 数字列表；每个 TC 使用 `### TC01: ...` 形式，包含 Priority、Covers、Seam 和连续编号的验证断言：

```markdown
QA Schema: 4
QA Mode: inline
QA Kind: feature

### TC01: 示例场景
- Priority: P0
- Covers: 1, 2
- Seam: browser

#### 验证断言
1. 第一条可量化预期。

## 执行记录
| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| TC01 | 1 | BLOCKED | 尚未执行 | | |

## 交付验证
| 命令 | 证据 |
| --- | --- |
| `node --test 'tooling/scripts/__tests__/*.test.mjs'` | 待执行 |

## 计划变更
- 无
```

- **Seam 选择**：选最高的合适接缝；browser 只用于 DOM、交互与视觉，其他断言下沉到 api、integration、unit 或 static。browser 默认 ≤5 条/15 分钟。
- **证据**：只认特性目录内文件；browser 的 PASS 需要 `screenshots/` 下独立截图和 exit 0 的 qa-run 日志，其他接缝需要 exit 0 的 qa-run 日志。同一截图不得跨 TC，自由文本命令不算证据。
- **断言标记与绑定**：browser/api 断言由 `scripts/` 下过程脚本逐条输出 `[TC01-1] PASS 实测：<观察值>`，规划时把断言写成能输出具体观察值的形式；unit/integration 断言在执行记录「绑定」列写 `` `<测试文件>` › <用例标题> ``；static 不绑定。
- **状态**：只使用 `PASS / FAIL / BLOCKED`；未执行、环境降级和证据不足均为 BLOCKED，不设置 DEGRADED。全部断言 PASS 才通过，任一 FAIL 则失败，其余为阻塞。
- **交付验证**：原样复制 spec `## 交付命令` 的每条命令（`qa-check plan` 校验包含关系），可以按改动范围追加 typecheck、测试和 lint，不得删减，确需缩减先改 spec 并写明理由；逐条映射 spec 的验收标准；最终代码上用 qa-run 执行并核对 argv、exit 和 tree。
- **修复轮**：修复已交付特性时使用 `QA Kind: fix` 和独立修复目录；每个 TC 增加 `## 修复前复现` 行，红绿日志必须同 argv、红日志更早且 tree 不同。
- **计划冻结**：计划在 init 时冻结。删除 TC、改 Seam、减 Covers、改写或删除既有断言、改删交付命令，必须在 `## 计划变更` 说明；追加不受限，规划时就要写准。
- **只认 Schema 4**：其他或未声明的 Schema 报 `UNSUPPORTED_SCHEMA`，按 Schema 4 结构重建。

计划完成后运行一次 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`；验收后运行 `acceptance`，真实独立双轴审查并生成报告后运行 `review`。失败时一次性查看全部问题，不自动重试，不为追求退出码修改业务断言。

### 阶段收口

规划通过后、init 之前，用 qa-run 跑一遍交付命令（标签 `baseline-*`），有红灯先问用户：修复则作为独立小修提交后再 init，不修则在 `## 范围说明` 记为既有失败并引用基线日志。随后运行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>` 建立基线并冻结计划，阶段 1–2 产物（GLOSSARY、ADR 等）按 init 提示 add；然后报告当前已完成阶段 3B、车道（沿用阶段 1，只写车道名）、本阶段产物（qa-plan 路径、`qa-check plan` 结果与 init 输出）。规划通过后，标准车道**建议下一步：`/implement`**；慢车道**建议下一步：`/implement-spec`**；只写这一个命令。
