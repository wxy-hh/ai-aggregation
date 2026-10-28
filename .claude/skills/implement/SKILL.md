---
name: implement
description: "依据技术规格或任务工单串行实现功能，在代码接缝处驱动 TDD，并完成验收与审查。"
disable-model-invocation: true
---

依据用户提供的 spec 或工单实现功能，默认在单会话中连续串行推进，不默认派发实现子代理。

## 1. 固化范围、基线与冻结计划

- 阅读 spec、工单依赖和 `docs/agents/qa-workflow.md`，先查看 `git status`，区分既有改动与本任务改动。
- 已有 `_qa/scope.json`（规划收口时已 init）时不再 init；没有时在改第一行代码前执行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>`，固化 HEAD、开工前内容和 `_qa/prechange/qa-plan.md`。禁止重复 init 或手改 `_qa/`。
- 阶段 1–2 产物和流程工具修复需要纳入时，执行 `node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>`，以 base 为前值扩大范围，不修改 Git index。
- 禁止为实现自动切换分支或提交代码。

## 2. 串行实现与测试

- 在预先确认的公共接缝调用 `tdd`，遵循一次一个失败测试、一个最小实现的红绿循环。
- 单文件测试使用 `pnpm --filter @repo/web test "<相对 apps/web 的路径>"`；含 `[id]` 的路径必须加引号，避免 shell 通配。
- 显式指定单张工单时，完成该工单及其测试后停下汇报；无工单参数或用户要求连续冲刺时，按依赖顺序承接全部就绪工单，不逐票询问。
- 修复已交付特性时使用独立修复目录和 `QA Kind: fix`；先用同一命令保存修复前红日志，再实现并保存绿日志，确保红日志更早且 tree 不同。
- 命令证据统一经 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>` 生成，同名日志不得覆盖，失败或旧证据换新标签。
- unit/integration 的 PASS 行在执行记录「绑定」列写 `` `<测试文件>` › <用例标题> ``；绑定写错只改执行记录，不重跑证据。

## 3. 验收

- 计划使用 Schema 4。规划后运行 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`，验收后运行 `acceptance`，并把输出的对账表留给人工终审。
- 先用 `node tooling/scripts/dev-port.mjs --probe --wait 90` 探活；未就绪时后台运行 `pnpm dev:web`，不得关闭标题不匹配的其他进程。
- 触及核心链路时按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收，遵守真实入口、真实输入事件、独立截图和数值严格断言规则；非核心改动按 spec 运行单元、集成和静态检查。
- 过程脚本放在 `scripts/`，每条冻结断言先硬断言再输出 `[TC01-1] PASS 实测：<观察值>`，失败输出 `[TC01-1] FAIL <原因>` 并非零退出，不能只打印成功文本；调试截图写入 `_qa/debug/`。环境无法验证 DOM、真实交互或移动几何时记 BLOCKED 或经计划变更转人工，不用低接缝证据替代。
- 登录：已有会话直接用；没有时用用户在对话中提供的测试账号在可见窗口真实登录页登录一次；未提供则打开登录页并在终端提示用户登录，无人值守记 BLOCKED。过程脚本从已登录状态开始，禁止签发令牌、写库造会话或改密码、注入 Cookie，凭据不得进入命令行、日志或证据。
- 未执行或证据不足只能记 BLOCKED，不得宣称 PASS。

## 4. 审查与交付

- 阶段 5 验收后按 `docs/agents/qa-workflow.md` 阶段 6 串联：先运行 `node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>`，再通过宿主真实技能机制调用 `code-review`，固定点取 `_qa/scope.json` 的 base、diff 使用审查包，由 Standards / Spec 两个独立上下文子代理（继承主会话模型）各自把带编号的原文写入 `review/r<n>-*.md`；不得因尚未 commit 而报空 diff。
- 两份原文落盘后，主 Agent 在 `review-report.md` 写审查方式行、按编号逐条对账的 `## 三档分流` 表与范围说明，不改写 `review/` 原文；实现串行不排斥这项必要审查。
- 未实际调用 `code-review` 或拿不到两份真实独立返回时，状态为“待独立审查”。实现者不得凭空生成 `review/` 原文、`review-report.md` 或填写“独立审查”。宿主完全没有独立上下文能力时，只交付待审查材料包并合法暂停，不运行最终 `qa-check review`，由独立会话或人工接续，不自动重试或提出 commit。
- 本次修由实现者明确修复（先读 `## 修复尝试记录`，不重复已判失败的改法），重跑受影响验证后重新 collect 并按正本做增量复审，自动上限 2 轮；用尽后仍有未修或修错时停止自动修复，照常完成交付验证，由 `qa-check review` 输出 BLOCKED 交人工裁决。测试结论必须与最后一次实际运行一致。
- 独立审查完成前不得把 backlog、计划等文档写成完成态，状态回填放在人工终审之后。
- QA 工作流负责最终交付，在全部浏览器验收结束后于最终代码上执行全部交付命令（之后重跑验收先探活），并运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`，核对 argv、exit、tree 和审查包新鲜度；本会话 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，汇报须附该行及范围说明，不替代独立审查与人工终审。
- 报告实际修改、测试输出、未验证项和新增 Agent 次数，如实区分独立审查完成与待人工终审，并附正本阶段 7 的人工终审清单。不要自动 commit、push 或合并；是否提交由用户按 `.claude/rules/git-workflow.md` 决定。
