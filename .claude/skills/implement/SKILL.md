---
name: implement
description: "依据技术规格或任务工单串行实现功能，在代码接缝处驱动 TDD，并完成验收与审查。"
disable-model-invocation: true
---

依据用户提供的 spec 或工单实现功能，默认在单会话中连续串行推进，不默认派发实现子代理。

## 1. 固化范围与基线

- 阅读 spec、工单依赖和 `docs/agents/qa-workflow.md`，先查看 `git status`，区分既有改动与本任务改动。
- 在特性目录写入当前 `git rev-parse HEAD` 到 `review-base`；已存在时保留并校验，不要覆盖任务起点。
- 记录本任务路径白名单，审查时避免混入无关工作区改动。禁止为实现自动切换分支或提交代码。

## 2. 串行实现

- 在预先确认的公共接缝调用 `tdd`，遵循一次一个失败测试、一个最小实现的红绿循环。
- 显式指定单张工单时，完成该工单及其测试后停下汇报；无工单参数或用户要求连续冲刺时，按依赖顺序承接全部就绪工单，不逐票询问是否继续。
- 每张工单完成后按 tracker 约定更新状态；未拆 `issues/` 时以 spec 的 Work Orders 为进度依据。
- 定期运行类型检查和相关测试，最后运行完整测试套件。遇到架构假设破裂、无法自愈的测试或外部阻断才暂停升级。

## 3. 验收

- 新生成或主动迁移的 qa-plan 使用 Schema 1。规划后运行 `pnpm qa:check -- plan .scratch/<feature>`，验收后运行 `acceptance`；旧计划只报告 LEGACY，不阻断或批量迁移。
- 触及用户可见核心链路（认证、流式对话、图像、视频、语音、历史、计费）时，在 code-review 前按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收；无 qa-plan 时按该文档补 3–5 条 P0 用例。
- 非核心改动按 spec 运行单元、集成和静态检查，不强行增加浏览器步骤。未执行或证据不足只能记 BLOCKED，不得宣称 PASS。

## 4. 审查与交付

- 调用 `code-review`，提供 `review-base`、spec 和本任务路径白名单。审查必须覆盖已提交、staged、unstaged 及相关未跟踪文本，不得因尚未 commit 而报空 diff。
- 完成 Standards + Spec 双轴和“本次修 / 转专项 / 驳回”分流；核心行为修复后重新执行对应浏览器验收，再运行 `pnpm qa:check -- review .scratch/<feature>`。
- 报告实际修改、测试输出、未验证项和新增 Agent 次数。不要自动 commit、push 或合并；是否提交由用户按 `.claude/rules/git-workflow.md` 决定。
