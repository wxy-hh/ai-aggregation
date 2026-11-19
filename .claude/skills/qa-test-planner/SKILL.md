---
name: qa-test-planner
description: "QA 测试规划器：根据 spec 生成 Schema 4 的 qa-plan.md（冻结断言、接缝选择、执行记录与交付验证），供 QA 工作流阶段 3B 使用。"
---

# QA Test Planner

## 项目约定

输出落盘与全流程见 `docs/agents/qa-workflow.md`。

### 规划原则

1. **自动化友好定位器**：浏览器操作步骤标注按钮/链接文案、语义角色、占位符或 `data-testid`；非浏览器用例标注实际命令和公开接缝。
2. **可量化断言**：预期具体到页面文案、URL、HTTP 状态、元素状态、命令退出码或持久化终态，且必须推导自 spec/PRD/工单；禁止先观察实现再反向固化预期。
3. **优先级与视口**：按 P0 → P1 → P2 执行；涉及响应式导航或操作栏时注明桌面/移动入口，并过滤可见元素。
4. **对抗清单**：按改动风险检查重复提交、并发、弱网、超时、中断、越权、隐私、脏数据和恢复，不机械地为每个需求堆满全部场景。
5. **关键决策覆盖**：对短路、权限、状态切换、降级等关键决策，按风险核对触发条件、排除条件和降级路径；`Covers` 只承担需求追踪，不等于风险覆盖完整，不机械要求每个 US、P0 或 TC 都增加正反用例。
6. **目标行为与合适接缝**：模型是否调用、下载响应、权限过滤、持久化等系统侧结果优先由 api、integration、unit 或 static 证明；browser 负责真实入口、交互和用户可见终态，不把全部断言堆到浏览器。浏览器断言必须关联本次操作新产生的结果，不能以页面旧文本、按钮可用或固定等待代替目标行为；视口、输入方式和数值阈值须与冻结断言一致，环境降级或证据不足记 BLOCKED，不改弱断言冒充通过。
7. **条件断言**：写明前置状态与构造方式（例如接口响应注入，并在备注写明）；给不出构造方式的分支改到能触发它的接缝。依赖故障才出现的 UI 状态按“接口响应注入前置状态 + 真实输入”规划，从真实故障到该状态由 integration 证明。响应注入只构造前端前置或故障态，备注写「响应注入」，断言只写端侧结果，不写工具调用、质检、持久化、计费等服务端行为；触及核心链路时另规划一条真实链路冒烟，只断言本次新产生的终态。
8. **原子断言**：每条断言只陈述一个可由单一证据单元独立判定的结论（unit/integration 为一个测试用例，browser/api 为一条断言标记，static 为一项检查）；不同分支、故障模式写成不同断言。断言声称了约束或边界（如次数上限、超时、权限），就必须同时构造触发它的情形，并观察越过边界时的行为。数量、顺序和否定约束必须可证伪，不能用“正常”“合理”“有内容”或测试标题代替观察条件。冻结前逐条自查：前置怎么构造、观察什么、由哪个证据单元证明；任一答不出就拆分或换接缝。

### 成本边界

- 默认 `QA Mode: inline`，由主 Agent 规划，不新增子代理。认证、计费、权限、隐私、物理删除/迁移和公共契约可建议使用独立规划，但不自动派发、不阻断交付。
- 只有用户显式 `/qa-test-planner --independent` 才允许增加 **1 个**新上下文规划子代理。调用不传 `model`、不自动升级模型、不允许再次派发；只提供 spec、必要领域文档和本契约，主 Agent 负责落盘。
- fresh context 不等于 different model。阶段 5 浏览器验收始终由主 Agent inline 执行，不交给独立 QA。
- 阶段 6 沿用 Standards + Spec 双轴，不额外增加第三名 QA 或裁决代理。

### Schema 4 输出契约

计划声明 `QA Schema: 4`、`QA Mode: inline|independent`、可选 `QA Kind: feature|fix`（默认 feature）；新计划另写 `QA Review Coverage: 1`，旧计划省略以保持兼容。Spec 保持 `## User Stories` 数字列表；每个 TC 使用 `### TC01: ...` 形式，包含 Priority、Covers、Seam 和连续编号的验证断言：

```markdown
QA Schema: 4
QA Mode: inline
QA Kind: feature
QA Review Coverage: 1

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

- **Seam 选择**：选最高的合适接缝；browser 只用于 DOM、交互与视觉，其他断言下沉到 api、integration、unit 或 static。阶段 5 默认只规划 1–3 条核心真实浏览器主链路与关键视口，组件测试能覆盖的故障注入与分支矩阵不下放到浏览器；browser 时间盒默认 ≤5 条/15 分钟。
- **计划边界**：`qa-plan.md` 只测产品外部可观察行为，禁止把 `qa-check` 结果、截图独立性、`review/`、`review-report.md` 或 `handoff.md` 合规性写成元用例（TC），也不得在 `scripts/` 自写元校验脚本。
- **红灯门禁**：仅 `QA Kind: fix` 要求每个 TC 引用修复前红灯复现日志；`QA Kind: feature` 不设修复前复现日志门禁，所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变。
- **证据**：只认特性目录内文件；browser 的 PASS 需要 `screenshots/` 下独立截图和 exit 0 的 qa-run 日志，其他接缝需要 exit 0 的 qa-run 日志。同一截图不得跨 TC，自由文本命令不算证据。视觉类断言的证据仍是几何硬断言加目标区域截图：先写 `- Target: <语义区域> | <稳定定位器>` 冻结 **VisualTarget**；几何硬断言与目标区域裁剪截图必须使用同一对象，不能用标题、状态卡或整页替代。仓库 Helper 的 `captureTargetGeometry` 校验同一 target 和有效矩形，硬断言后才裁剪；自定义脚本仍按同一契约审查。
- **断言标记与绑定**：browser/api 断言由 `scripts/` 下过程脚本逐条输出 `[TC01-1] PASS 实测：<观察值>`，规划时把断言写成能输出具体观察值的形式；unit/integration 断言在执行记录「绑定」列写 `` `<测试文件>` › <用例标题> ``；static 不绑定。
- **状态**：只使用 `PASS / FAIL / BLOCKED`；未执行、环境降级和证据不足均为 BLOCKED，不设置 DEGRADED。全部断言 PASS 才通过，任一 FAIL 则失败，其余为阻塞。
- **交付验证**：原样复制 spec `## 交付命令` 的每条命令（`qa-check plan` 校验包含关系），可以按改动范围追加 typecheck、测试和 lint，不得删减，确需缩减先改 spec 并写明理由；逐条映射 spec 的验收标准；最终代码上用 qa-run 执行并核对 argv、exit 和 tree。
- **修复轮**：修复已交付特性时使用 `QA Kind: fix` 和独立修复目录；每个 TC 增加 `## 修复前复现` 行，红绿日志必须同 argv、红日志更早且 tree 不同。`QA Kind: feature` 不要求红灯复现日志。
- **计划冻结**：计划在 init 时冻结。删除 TC、改 Seam、减 Covers、改写或删除既有断言、改删交付命令，必须在 `## 计划变更` 说明；追加不受限，规划时就要写准。
- **只认 Schema 4**：其他或未声明的 Schema 报 `UNSUPPORTED_SCHEMA`，按 Schema 4 结构重建。

计划完成后经 qa-run 保存门禁：plan 用 `gate-plan-*`，acceptance 用 `gate-acceptance-*`，最终 review 用 `gate-review-*`。失败时一次查看全部问题，不自动重试，不为追求退出码修改业务断言。

### 阶段收口

规划通过后、init 之前，用 qa-run 跑 `baseline-*` 交付命令。计划内基线时尚不存在的新测试路径导致的「No test files」不算红灯但记基线不适用；`No projects matched`、找不到测试或 0 项测试触发 `EMPTY_EVIDENCE`，不得作为绿基线。Schema 4 白名单若含当前与 base 均不存在的新路径，必须在 qa-plan 增加 `## 计划新建路径`，逐项写 `- \`path\``，否则 init 报 `UNKNOWN_SCOPE_PATH`。随后 init 冻结计划并 add 阶段 1–2 产物；规划门禁以 `gate-plan-*` 经 qa-run 落盘。报告当前已完成阶段 3B、车道（沿用当前车道）与产物；标准车道**建议下一步：`/implement`**，慢车道**建议下一步：`/implement-spec`**，只写一个命令。
