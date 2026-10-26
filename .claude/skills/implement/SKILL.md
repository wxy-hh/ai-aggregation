---
name: implement
description: "依据技术规格或任务工单串行实现功能，在代码接缝处驱动 TDD，并完成验收与审查。"
disable-model-invocation: true
---

依据用户提供的 spec 或工单实现功能，默认在单会话中连续串行推进，不默认派发实现子代理。

## 1. 固化范围、基线与冻结计划

- 阅读 spec、工单依赖和 `docs/agents/qa-workflow.md`，先查看 `git status`，区分既有改动与本任务改动。
- 改第一行代码前执行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>`，固化 HEAD、开工前内容和 `prechange/qa-plan.md`；禁止重复 init 或手改 `scope.json` / `prechange/`。
- 阶段 1–2 产物和流程工具修复需要纳入时，执行 `node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>`，以 base 为前值扩大范围，不修改 Git index。
- 禁止为实现自动切换分支或提交代码。

## 2. 串行实现与测试

- 在预先确认的公共接缝调用 `tdd`，遵循一次一个失败测试、一个最小实现的红绿循环。
- 单文件测试使用 `pnpm --filter @repo/web test "<相对 apps/web 的路径>"`；含 `[id]` 的路径必须加引号，避免 shell 通配。
- 显式指定单张工单时，完成该工单及其测试后停下汇报；无工单参数或用户要求连续冲刺时，按依赖顺序承接全部就绪工单，不逐票询问。
- 修复已交付特性时使用独立修复目录和 `QA Kind: fix`；先用同一命令保存修复前红日志，再实现并保存绿日志，确保红日志更早且 tree 不同。
- 命令证据统一经 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>` 生成，同名日志不得覆盖，失败或旧证据换新标签。

## 3. 验收

- 新计划使用 Schema 3。规划后运行 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`，验收后运行 `acceptance`；Schema 1/2 按旧规则处理，LEGACY 仅表示未校验。
- 先用 `node tooling/scripts/dev-port.mjs --probe --wait 90` 探活；未就绪时后台运行 `pnpm dev:web`，不得关闭标题不匹配的其他进程。
- 触及核心链路时按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收，遵守真实入口、真实输入事件、独立截图和数值严格断言规则；非核心改动按 spec 运行单元、集成和静态检查。
- 登录依次使用可见窗口已有会话、seed 的 `test_user`（密码从环境变量读取）或真实注册一次性账号；禁止签发令牌、写库造会话或改密码、注入 Cookie，凭据不得进入命令行、日志或证据。
- 未执行或证据不足只能记 BLOCKED，不得宣称 PASS。

## 4. 审查与交付

- 阶段 5 验收后，通过宿主真实技能机制调用 `code-review`，提供特性目录、`scope.json`、spec、冻结计划和本任务路径范围；由其统一完成 collect、独立 Standards / Spec、报告、三档分流和最终交付校验，不得因尚未 commit 而报空 diff。
- 未实际调用 `code-review` 或没有独立审查结果时，状态为“待独立审查”。实现者不得凭空生成 `review-report.md` 或填写“独立审查”；主 Agent 只能在真实技能流程中汇总实际返回并保留原结论。
- 由 `code-review` 在最终代码上执行全部交付命令并运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`，核对 argv、exit、tree 和审查包新鲜度；本会话 `结果: PASS` 只称“机器校验通过”，汇报须附该行，不替代独立审查与人工终审。
- 审查发现的问题由实现者明确修复，再重跑受影响验证并复审，不自动循环；测试结论必须与最后一次实际运行一致。
- 报告实际修改、测试输出、未验证项和新增 Agent 次数，如实区分独立审查完成与待人工终审。不要自动 commit、push 或合并；是否提交由用户按 `.claude/rules/git-workflow.md` 决定。
