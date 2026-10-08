# 研发与浏览器真机测试闭环工作流 (QA & Browser Testing Workflow)

本规范定义了结合 **Matt Pocock 软件工程技能体系** 与 **`qa-test-planner` + 真实浏览器自动化工具** 的端到端闭环开发与验收流水线。

---

## 一、核心闭环全景流程

```
[1. 需求与对齐]       /grill-with-docs ──> 厘清业务边界，更新 GLOSSARY.md / ADR
        │
        ▼
[2. 规格确立]         /to-spec ──────────> 生成 .scratch/<feature>/spec.md
        │
        ├───────────────────────────────────────┐
        ▼ (研发轨)                              ▼ (测试轨)
[3A. 任务拓扑拆解]   /to-tickets               [3B. 测试集规划]   /qa-test-planner
     生成 tickets/*.md                              生成 .scratch/<feature>/qa-plan.md
        │                                           (含 P0 冒烟、关键定位器、断言)
        ▼                                       │
[4. 编码实现]        /implement (TDD)          │
     单测与集成测试绿灯 (Seam 契约保证)              │
        │                                       │
        ├───────────────────────────────────────┘
        ▼
[5. 真实浏览器验收]  执行 Agent 调用 ego-browser 逐条验收，Playwright 固化回归
                     逐条执行 qa-plan.md 中的用例：点击、输入、交互、截图
        │
        ├──────────── 若用例失败 (FAIL) ───> 捕获现场截图与 Console Error
        │                                   调用 diagnosing-bugs 定位并修复代码
        ▼ (全部 PASS)                       重新回到浏览器验证
[6. 双轴代码审查]    code-review ─────────> Standards 规范轴 + Spec 需求轴并行
        │
        ▼
[7. 交付与沉淀]      pr ──────────────────> 挂载浏览器真实操作的前后对比证据
                     /retro ──────────────> 会话复盘与环境优化
```

---

## 二、适用范围与剪裁

完整 7 阶段流程为**多会话、跨模块的特性开发**设计，请按改动规模剪裁，不要一刀切：

| 改动规模 | 适用流程 |
| --- | --- |
| 大型特性（多会话、跨模块、涉及核心链路） | 完整 7 阶段流程 |
| 中型改动（单会话可完成的独立功能） | 跳过 3A 工单拆解：`/to-spec` → `/qa-test-planner` → `/implement`（TDD）→ 浏览器验收 → `/pr` |
| 小型修复（文案、样式、单点 Bug） | 直接 `/implement` + TDD；触及 P0 链路时补跑一次 P0 冒烟 |

**不可剪裁的红线**：只要改动触及用户可见的核心链路（认证、流式对话、图像/视频生成提交、语音录制、历史记录），无论规模大小，阶段 5 的真实浏览器验收不可跳过。

**结果落盘**：浏览器验收结果（通过/失败、关键截图清单、Console 报错）以 `## 执行记录` 小节追加到 `.scratch/<feature>/qa-plan.md` 末尾；缺陷修复后的回归结果继续追加，形成完整证据链，供 `/pr` 阶段引用。截图统一存放 `.scratch/<feature>/screenshots/`（按 `01-登录成功.png` 顺序命名），与 spec、qa-plan 同目录归档；`.scratch/` 已在 `.gitignore` 中，不会污染代码树，禁止散落到 `/tmp` 或源码目录。

**成本控制（时间盒）**：交互式浏览器验收只跑本次改动直接影响的链路，默认不超过 **5 条用例 / 15 分钟**；已验收过的核心链路回归交给 Playwright 脚本（`pnpm --filter @repo/web test:e2e`，确定性执行、秒级完成、不耗模型 token），交互式浏览器只用于新行为的首次验收。超时或失败用例过多时，停下来排查或升级计划粒度，不要硬跑全量。

**无 qa-plan 时的验收**：若实现前未运行 `/qa-test-planner`（如小改动直接 `/implement`），验收前由 Agent 从 spec / 工单 / 改动摘要推导 3–5 条 P0 冒烟用例，写入 `.scratch/<feature>/qa-plan.md`（无该目录时附到 PR 描述），再执行阶段 5；不触及核心链路的小改动可只跑单测与 typecheck。注意 `/implement`、`/implement-spec` 技能本身不包含浏览器验收步骤，阶段 5 是本流程对主编排 Agent 的指令——跨会话执行 `/implement` 时，需确认该会话已知读本流程。

---

## 三、关键阶段执行规范

### 1. 规格与测试规划阶段（阶段 2 & 3B）
- **触发时机**：在 `/to-spec` 产出技术规格后，立即触发 `/qa-test-planner`。
- **输出位置**：`.scratch/<feature>/qa-plan.md`。
- **QA Planner 规划原则**：
  1. **分级清晰**：标注 P0（核心阻断/Happy Path）、P1（重要分支与表单校验）、P2（边缘容错）。
  2. **自动化友好**：测试步骤中明确标注元素特征（如目标按钮文案 `text="立即提交"`、输入框标签 `placeholder="..."` 或语义化角色 `role="button"`）。
  3. **可量化预期断言**：避免“页面表现正常”等模糊描述，必须具体到“弹窗提示‘保存成功’且网络请求返回 200”。

### 2. 代码实现阶段（阶段 4）
- 由 `/implement` 或 `/implement-spec` 驱动底层 `tdd` 技能，通过纯代码层面的单测保证内部状态和公共接口（Seams）符合设计。

### 3. 真实浏览器执行与验收阶段（阶段 5）
- **环境就绪（先探活，再开浏览器）**：启动浏览器前先执行 `curl -s -o /dev/null -w "%{http_code}" http://localhost:3030`，确认返回 200；未返回时先启动 `pnpm dev:web` 或确认实际端口（3030 被占用时 dev 脚本会自动漂移）。**禁止把连接拒绝（ERR_CONNECTION_REFUSED）判定为业务 Bug 进入 `diagnosing-bugs` 排查**。
- **就绪锚点（防 SSR 水合假死）**：SSR 页面「HTML 可见 ≠ React 事件已挂载」，水合完成前点击会出现"点击无效"假报警。操作前以「客户端就绪后才出现的元素」为锚点确认就绪（如聊天页输入框、登录页标题；本项目主要交互页另有 AuthGuard 的「加载中...」闸门兜底）。**禁止用 networkidle 作等待条件**——dev 模式的 HMR 与 SSE 长连接会让网络永不空闲。
- **执行工具分工**：
  - **`ego-browser`（首选用于即时探索与验收）**：Agent 直接在真实 Chromium 窗口中加载页面，按照 `qa-plan.md` 逐步点击、输入并截取关键操作帧。
  - **Playwright（用于批处理与回归脚本固化）**：将验证通过的核心链路固化为 Playwright 用例（`apps/web/e2e/`，`pnpm --filter @repo/web test:e2e` 运行），防止后续迭代劣化。现有 P0 固化用例：`home.spec.ts`（首页渲染 + 匿名认证）、`chat.spec.ts`（流式对话收发）、`image.spec.ts`（图像生成提交与失败态）、`history.spec.ts`（历史列表与页签筛选）、`login.spec.ts`（登录页渲染与校验）、`constellation-universe.spec.ts`（命理主链路全流程）。打桩约定：LLM/上游一律 `page.route` 拦截返回确定性数据，认证走真实匿名链路并复用 `e2e/fixtures.ts` 的固定设备指纹（防匿名账号创建限流）。
- **异常自愈机制（Defect Remediation Loop）**：
  - 若在浏览器中遇到按钮点击无效、样式遮挡、控制台红字报错或断言不符：
  - 自动输出简明 Bug 记录（含报错日志与截图），交由 `diagnosing-bugs` 技能进行插桩排查与修复，修复后在浏览器重新回归。

### 4. 审查与 PR 证据链（阶段 6 & 7）
- 通过 `code-review` 完成双轴审查；
- 执行 `pr` 时，必须将浏览器中真实点击截取的成功操作图（Before/After 证据）作为 PR 描述的“证据附件”提交。
