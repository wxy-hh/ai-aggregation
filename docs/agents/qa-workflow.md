# 研发与真实浏览器验收闭环工作流 (QA & Browser Testing Workflow)

本规范组合规格、TDD、真实验收和独立双轴审查。提示词、显式检查、可核查产物与人工终审各自承担边界，不把格式完整等同于行为真实。

---

## 一、核心闭环

```text
[1. 需求对齐] /grill-with-docs → 领域词汇、边界与 ADR
[2. 规格确立] /to-spec → .scratch/<feature>/spec.md
       ├─[3A. 条件拆票] /to-tickets → issues/*.md
       └─[3B. 测试规划] /qa-test-planner → qa-plan.md → qa-check plan → init 建基线并冻结计划
[4. 串行实现] add（按需）+ TDD + qa-run → 单元、集成与静态检查
[5. 真实验收] 按接缝执行 → qa-check acceptance
[6. 双轴审查] collect → 调用 /code-review（上游双轴）→ review-report.md 原样落盘 + 三档分流
[7. 交付收口] QA 工作流最终交付验证 → qa-check review（机器校验通过）→ 人工终审清单
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
2. 默认 inline 规划、单会话串行实现，不自动增加规划或实现代理、选择或升级模型；显式独立规划最多 1 个，显式并行实现最多 2 个。标准/慢车道的独立上下文审查按阶段 6 执行，不属于可选实现代理。
3. Worktree 不隔离数据库、Redis、端口、上游额度或测试账号，高耦合任务回退串行。
4. `qa-check.mjs` 的 `CURRENT_SCHEMA = 3`；新计划使用 Schema 3。
5. Schema 1/2 冻结并按原规则校验。
6. 未声明受支持的 Schema（1/2/3）时返回 LEGACY，退出 0 仅表示未校验，不得称为 PASS。
7. 不强制迁移历史产物，不用截图语义识别、Hooks 或额外代理替代人工判断。
8. 只保证 Claude Code。Claude Code 中个人级技能优先于项目级，`qa-check` 在 plan 与 review 阶段检测个人级同名技能，流程技能同名且内容不同时为 BLOCKED。

## 四、阶段执行规范

### 1. 需求与规格（阶段 1–2）

- 未解决事项不会改变实现方向和验收标准时即可停止追问；人工独占技能只由用户显式触发。
- Spec 使用 `## User Stories` 数字列表，必须包含 Testing Decisions、Out of Scope 和 `## 交付命令`（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令），保持需求、异常边界和测试接缝可追踪。
- 需要架构取舍时写 ADR，不把补 ADR 与既定的下一技能并列成多个后继。
- 推翻既有 ADR、评测结论或默认值时，盘问题干先引用原决策与证据路径，各选项写出代价；确认后在 ADR 写明取代了什么。宣称质量或性能收益时写明所需效果证据，否则写成机制描述。

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
- 条件断言写明前置状态与构造方式（例如接口响应注入，并在备注写明）；给不出构造方式的分支改到能触发它的接缝。
- 交付验证原样复制 spec 的 `## 交付命令`（`qa-check plan` 校验包含关系），可以按改动范围追加 typecheck、测试和 lint，不得删减；确需缩减先改 spec 并写明理由。每条验收标准都要映射到 TC 或交付命令。
- Schema 3 的 qa-plan 不放 `## 遗留事项`，它属于 review-report。
- 规划后运行 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`，通过后立即运行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>` 建立基线并冻结计划，阶段 1–2 产物按 init 提示 add。冻结计划已有执行结果或证据早于基线时，后续检查不通过。

### 3. 实现（阶段 4）

- 已有 `scope.json`（规划收口时已 init）时不再 init；没有时在改第一行代码前运行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>`。禁止重复 init 或手改 `scope.json` / `prechange/`。
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
- **过程脚本**：放在特性目录并经 qa-run 以脚本路径运行（qa-check 核对 browser 日志 argv 引用了特性目录内的脚本），不得删除；每个 TC 在自己的场景独立截图。
- **故障态 UI**：依赖故障才出现的 UI 状态，用接口响应注入构造前置状态并在备注写明；从真实故障到该状态由 integration 证明。
- **硬断言与失败**：关键预期必须有硬断言，目标缺失、动作未执行或数值不达标必须失败并非零退出，不能只打印成功文本。
- **环境不足**：DOM、真实交互或移动几何无法验证时只能记 BLOCKED，或经计划变更转人工；系统侧结果可下沉合适接缝，但不得用低接缝证据替代 browser。
- **登录顺序**：可见窗口已有会话 → seed 的 `test_user`（密码从 `SEED_TEST_PASSWORD` 等环境变量读取）→ 真实注册页新建一次性账号。
- **登录红线**：禁止签发令牌、写库造会话或改密码、注入 Cookie；凭据不得出现在命令行、日志或证据中。
- **工具选择**：遵循宿主优先级；macOS 无更高优先级规则时先探活并默认可见 `ego-browser`，不可用时说明后降级 Playwright。
- **异步与失败**：等待成功或明确失败终态并设置上限；保留失败截图、Console/网络证据，修复后重跑原断言。

验收后运行 `node tooling/scripts/qa-check.mjs acceptance .scratch/<feature>`。

**NOTE 处置**：tree 不一致的 NOTE 按变化性质处理。核心实现变化重跑受影响验收；能确认仅为非行为文档变化时记录不重跑理由；无法判断时保持 BLOCKED。TC tree 不一致仍为 NOTE，不改为一律 FAIL。

### 5. 双轴审查（阶段 6）

`code-review` 使用 Matt Pocock 上游原文，只在“项目定制”段替换 diff 来源；QA 特有步骤由本工作流串联：

1. **collect**：运行 `node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>`，生成包含未提交改动的审查包。范围外改动属于本任务时先 add 再重新 collect，其他来源在 `## 范围说明` 逐项解释；`preexisting` 未进入审查包时如实保留 NOTE。不得为审查 `git add -N` 或自动 commit。
2. **双轴**：通过宿主真实技能机制调用 `code-review`，固定点取 `scope.json` 的 base，diff 使用审查包；由它在前台并行启动 Standards、Spec 两个独立上下文子代理。独立审查指独立上下文，不要求另开用户会话。
3. **落盘**：`review-report.md` 含一行 `审查方式：`（写明子代理或会话标识），原样粘贴两份真实独立返回作为 `## Standards` 与 `## Spec`，再写 `## 三档分流`；有范围外改动或晚建基线 NOTE 时加 `## 范围说明`。不得删改两轴原文，不得凭空生成报告或填写“独立审查”。
4. **三档分流**：QA 工作流在 `## 三档分流` 表（表头含“档位”）逐条标注每条发现。本次修：当前修复并重跑受影响验证；转专项：写明本轮不处理的理由并列入遗留事项；驳回：引用 ADR 或契约。Standards 轴的硬违规，以及 Spec 轴“缺失或部分实现”“实现有误”两类发现默认本次修，改档须写明理由或依据。不得漏列发现，两轴都没有发现时写“无发现”；档位由人工终审确认，不改写 qa-plan 来消除问题。
5. **复审**：本次修之后重新 collect 并重跑完整 `code-review`；同一 tree、argv、断言与预期结果只更新日志标签或证据索引时不重跑。报告与证据索引指向最终材料。
6. **合法暂停**：未实际调用或拿不到两份真实独立返回时保持“待独立审查”；宿主完全没有独立上下文能力时，collect 后只交付待审查材料包，不运行最终 `qa-check review`，由独立会话或人工接续，不自动重试或提出 commit。

### 6. 交付验证（阶段 7）

- QA 工作流在最终代码上通过 qa-run 执行计划声明的每条交付命令，并更新 `## 交付验证` 的日志路径；`code-review` 只返回两轴发现，不承担交付总控。
- 运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`，核对交付日志 argv、exit、tree 以及审查包新鲜度。
- 本会话上述命令输出的 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，汇报须附该行及范围说明；真实 `code-review` 及独立 Standards / Spec 结果才构成“独立审查完成”，两者不能互相替代。
- 汇报的测试结论必须与最后一次实际运行一致，不自动重试或只选择有利输出；人工可重跑检查器复核，人工终审单独认定。
- 独立审查完成前不得把 backlog、计划等文档写成完成态，状态回填放在人工终审之后。

### 7. 人工终审

先核对 spec、冻结断言、证据与审查报告，再看高危发现；文件存在和截图本身不证明语义。逐条确认：

1. 截图支撑对应断言：结果非空，目标元素在画面内，没有与断言矛盾的内容。
2. browser 脚本使用真实输入事件，关键预期有硬断言，条件断言的前置状态确实构造出来。
3. 测试中的期望值与冻结断言一致，没有迁就实现。
4. spec 的每条验收标准都有对应证据（交付命令的包含关系已由 qa-check 检查）。
5. 推翻既有 ADR、评测结论或默认值时有依据；收益主张有效果证据。
6. 本次修已修复并复审，驳回与转专项理由成立；终审前没有把文档写成完成态；Claude Code 会话目录（`~/.claude/projects/<项目>/<会话>/subagents/`；设置 `CLAUDE_CONFIG_DIR` 时为其下的 `projects/`）有两份审查者转录。

- `/pr` 汇总真实 Before/After、最后一次测试输出、爆炸半径和遗留事项，不自动 commit、push 或合并。
- 复盘优先沉淀回归测试和精简规则，删除长期不改变决策的流程负担。
- 发布 QA 工作流自身时，另以干净会话的真实 /implement dogfood 验证独立上下文审查真实发生、无独立上下文能力时合法暂停；工具测试与手动派发 reviewer 不冒充这项发布验收。

方案评审与按需清理的快捷指令见 `docs/agents/prompt-shortcuts.md`。
