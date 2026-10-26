# 研发与真实浏览器验收闭环工作流 (QA & Browser Testing Workflow)

本规范组合规格、TDD、真实验收和独立双轴审查。提示词、显式检查、可核查产物与人工终审各自承担边界，不把格式完整等同于行为真实。

---

## 一、核心闭环

```text
[1. 需求对齐] /grill-with-docs → 领域词汇、边界与 ADR
[2. 规格确立] /to-spec → .scratch/<feature>/spec.md
       ├─[3A. 条件拆票] /to-tickets → issues/*.md
       └─[3B. 测试规划] /qa-test-planner → qa-plan.md → qa-check plan
[4. 串行实现] init / add + TDD + qa-run → 单元、集成与静态检查
[5. 真实验收] 按接缝执行 → qa-check acceptance
[6. 双轴审查] 调用 /code-review → collect + 独立 Standards / Spec → review-report.md
[7. 交付收口] code-review 最终交付验证 → qa-check review（机器校验通过）→ 人工终审
```

## 二、适用范围与剪裁

| 改动规模 | 适用流程 |
| --- | --- |
| 大型特性（多会话、跨模块或核心链路） | 完整 7 阶段 |
| 中型改动（单会话独立功能） | 跳过 3A，保留规划、验收和独立双轴审查 |
| 小型快车道（文案、样式、非核心小修） | 直接 `/implement` + TDD，不强制 qa-plan，不跑 review 检查 |

- 核心小改动仍补 3–5 条 P0 用例和浏览器验收；非核心小修可不建 qa-plan，一旦建立便按 Schema 3 执行。
- 修复已交付特性时新建 `.scratch/<feature>-fix-<n>/`，spec 只列本轮缺陷并引用原 US，使用 `QA Kind: fix`，不改写原特性的执行记录。
- 触及认证、对话、图像、视频、语音、历史、计费等核心链路时，阶段 5 不可跳过；移动视口仿真不冒称物理设备。
- 浏览器时间盒默认 ≤5 条/15 分钟，存量回归交给 `pnpm --filter @repo/web test:e2e`。

## 三、成本与兼容边界

1. 不新增 Hooks 或自动重试，`qa-check` 只在阶段边界显式运行并聚合问题。
2. 默认 inline 规划、单会话串行实现，不自动增加代理、选择或升级模型；显式独立规划最多 1 个，显式并行实现最多 2 个。
3. Worktree 不隔离数据库、Redis、端口、上游额度或测试账号，高耦合任务回退串行。
4. `qa-check.mjs` 的 `CURRENT_SCHEMA = 3`；新计划使用 Schema 3。
5. Schema 1/2 冻结并按原规则校验。
6. 未声明受支持的 Schema（1/2/3）时返回 LEGACY，退出 0 仅表示未校验，不得称为 PASS。
7. 不强制迁移历史产物，不用截图语义识别、Hooks 或额外代理替代人工判断。

## 四、阶段执行规范

### 1. 需求与规格（阶段 1–2）

- 未解决事项不会改变实现方向和验收标准时即可停止追问；人工独占技能只由用户显式触发。
- Spec 使用 `## User Stories` 数字列表，保持需求、异常边界、测试接缝和 Out of Scope 可追踪。
- 需要架构取舍时写 ADR，不把补 ADR 与既定的下一技能并列成多个后继。

### 2. 测试规划（阶段 3B）

标准/慢车道在 spec 后运行 `/qa-test-planner`，默认 inline。Schema 3 最小结构如下：

```markdown
QA Schema: 3
QA Mode: inline
QA Kind: feature

### TC01: 场景名称
- Priority: P0
- Covers: 1, 2
- Seam: browser

#### 验证断言
1. 第一条可量化预期。
2. 第二条可量化预期。

## 执行记录
| 用例 | 断言序号 | 状态 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| TC01 | 1 | PASS | `screenshots/TC01.png`、`evidence/tc01.log` | |
| TC01 | 2 | BLOCKED | 尚未执行 | |

## 交付验证
| 命令 | 证据 |
| --- | --- |
| `node --test 'tooling/scripts/__tests__/*.test.mjs'` | 待执行 |

## 计划变更
- 无
```

- 每条 US 至少由一个 TC 覆盖；Seam 选最高的合适接缝，browser 只用于 DOM、交互和视觉，其他断言下沉到 api、integration、unit 或 static。
- 对短路、权限、状态切换、降级等关键决策，按风险核对触发条件、排除条件和降级路径；`Covers` 只承担追踪，不等于风险覆盖完整，不机械要求每个 US、P0 或 TC 都增加正反用例。
- 系统侧结果优先由低成本合适接缝证明；browser 断言须关联本次操作新产生的用户可见结果，不得以页面旧文本、按钮可用或固定等待代替目标行为。视口、输入方式和数值阈值须与冻结断言一致，环境降级或证据不足记 BLOCKED，不改弱断言冒充通过。
- 证据只认特性目录内文件；命令通过 qa-run 真实执行，PASS 日志必须 exit 0。browser 需要独立截图加日志，其他接缝需要日志，同一截图不得跨 TC。
- `## 修复前复现` 仅在 `QA Kind: fix` 时必需；每个 TC 都要引用同 argv、早于绿日志且 tree 不同的红日志。
- 交付验证在规划时写全量命令，按改动范围选择 typecheck、测试和 lint，不得在审查前临时缩小。
- Schema 3 的 qa-plan 不放 `## Spec 对账` 或 `## 遗留事项`，它们属于 review-report。
- 规划后运行 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`。

### 3. 实现（阶段 4）

- 改第一行代码前运行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>`，同时冻结计划；禁止重复 init 或手改 `scope.json` / `prechange/`。
- 阶段 1–2 产物和流程工具修复需要纳入时，运行 `node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>`，以 base 为前值扩大范围。
- 单文件测试使用 `pnpm --filter @repo/web test "<相对 apps/web 的路径>"`；含 `[id]` 的路径必须加引号。
- 每个垂直切片遵循 TDD 红绿循环；修复轮先保存同命令红日志，再实现并保存绿日志。
- 命令证据统一使用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>`，同名日志不得覆盖，失败时换新标签。

### 4. 真实验收（阶段 5）

- **探活**：运行 `node tooling/scripts/dev-port.mjs --probe --wait 90`；未就绪时后台运行 `pnpm dev:web`，不得关闭标题不匹配的其他进程。
- **客户端就绪**：等待水合后才出现的可操作元素，不用 `networkidle` 判断 SSR/HMR/SSE 页面就绪。
- **定位与断言**：可按真实组件校准定位器；换入口或换操作方式等于改变断言，必须先在 `## 计划变更` 说明，不能冒充原验收。
- **真实输入**：使用真实输入事件；`evaluate` 中的 `el.click()` / `dispatchEvent` 只用于读取状态或构造前置条件。注入仅限前置条件并在备注列标明。
- **核心链路**：P0 至少一条从真实入口端到端，不能用单元测试或命令输出替代。
- **数值阈值**：在脚本或测试内严格断言，不得四舍五入，截图不能证明数值。
- **过程脚本**：放在特性目录并经 qa-run 运行，不得删除；每个 TC 在自己的场景独立截图。
- **登录顺序**：可见窗口已有会话 → seed 的 `test_user`（密码从 `SEED_TEST_PASSWORD` 等环境变量读取）→ 真实注册页新建一次性账号。
- **登录红线**：禁止签发令牌、写库造会话或改密码、注入 Cookie；凭据不得出现在命令行、日志或证据中。
- **工具选择**：遵循宿主优先级；macOS 无更高优先级规则时先探活并默认可见 `ego-browser`，不可用时说明后降级 Playwright。
- **异步与失败**：等待成功或明确失败终态并设置上限；保留失败截图、Console/网络证据，修复后重跑原断言。

验收后运行 `node tooling/scripts/qa-check.mjs acceptance .scratch/<feature>`。

### 5. 双轴审查（阶段 6）

- 通过宿主真实技能机制调用 `code-review`，由其统一组织 collect、独立 Standards / Spec、报告与三档分流。未实际调用或没有独立结果时保持“待独立审查”；实现者不得凭空生成 `review-report.md` 或填写“独立审查”，主 Agent 只能汇总真实审查返回并保留原结论。
- 由 `code-review` 运行 `node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>`，生成 diff 与 v2 manifest；不得为审查 `git add -N` 或自动 commit。
- 中大型改动的 Standards 与 Spec 必须由独立于实现者的审查者完成；报告写明审查方式，宿主提供技能轨迹或子代理 ID 时一并记录，没有此类标识时记录可定位的独立会话或人工审查者。
- `review-report.md` 必须含 `## Standards`、`## Spec`、`## 证据审计`、`## Spec 对账`、`## 三档分流` 和 `## 范围说明`。
- 证据审计逐个 TC 对照冻结断言与过程脚本，核对接缝、入口、输入事件、注入范围、截图独立性与新鲜度、数值断言和实际目标行为，不只复述“真实有效”；Spec 对账只采信报告中的表格。
- NOTE 处置按变化性质决定：核心实现变化重跑受影响验收，能确认仅为非行为文档变化时记录不重跑理由，无法判断时保持 BLOCKED；TC tree 不一致仍为 NOTE，不改为一律 FAIL。
- 范围外改动属于本任务时 `add` 后重新 collect，其他来源在范围说明中逐项解释；`preexisting` 未进入审查包时如实保留 NOTE。
- 代码变化后重新 collect 并复审过期内容；转专项与遗留事项写入报告，不改写 qa-plan 来消除问题。

### 6. 交付验证（阶段 7）

- 由 `code-review` 在最终代码上通过 qa-run 执行计划声明的每条交付命令，并更新 `## 交付验证` 的日志路径；实现者不另跑替代审查的交付流程。
- 运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`，核对交付日志 argv、exit、tree 以及审查包新鲜度。
- 本会话上述命令输出的 `结果: PASS` 只称“机器校验通过”，汇报须附该行；真实 `code-review` 及独立 Standards / Spec 结果才构成“独立审查完成”，两者不能互相替代。
- 汇报的测试结论必须与最后一次实际运行一致，不自动重试或只选择有利输出；人工可重跑检查器复核，人工终审单独认定。

### 7. 人工终审

- 先核对 spec、冻结断言、证据与审查报告，再看高危发现；文件存在和截图本身不证明语义。
- `/pr` 汇总真实 Before/After、最后一次测试输出、爆炸半径和遗留事项，不自动 commit、push 或合并。
- 复盘优先沉淀回归测试和精简规则，删除长期不改变决策的流程负担。

方案评审与按需清理的快捷指令见 `docs/agents/prompt-shortcuts.md`。
