# 0004: 技能编排规则内置于项目，无需每次对话重复提示

项目根目录的 `CLAUDE.md` 与 `qa-workflow.md` 已构成工程准则的单一事实源，Agent 在任何新对话中均会自动识别顶层约束，无需用户每次显式发送重复的指令咒语。

## Status
active

## Evidence
`CLAUDE.md` 行 422 明确配置了 `Default Workflow Directive`，规定进行特性开发或架构重构时，默认主动按 7 阶段推进。无论用户是在第一步使用 `/grill-with-docs` 还是日常习惯使用 `/grill-me`，一旦进入 `/to-spec` 阶段，Agent 均会自动触发 `/qa-test-planner` 规划用例，且在编码完成后自动触发真实浏览器验收，体现了编排指令的自洽性。

## Implications
- 开发者与 Agent 协作时应关注业务决策本身，不必花费心智背诵繁琐的工作流咒语。
- `/implement` 与 `/implement-spec` 均驱动底层 `tdd` 技能，差异仅在于输入是工单还是单文件 Spec，二者在实现阶段等价。
