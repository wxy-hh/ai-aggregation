---
dev_flow_status:
  schema_version: "1"
  feature_id: "2026-07-10-destiny-deepseek-provider"
  level: "M"
  current_gate: "verification_before_completion"
  completed_gates:
    - "requirement_confirmation"
    - "writing-plans"
    - "requirements-coverage"
    - "plan-review"
    - "rollback-units"
    - "executing-plans"
    - "code-review"
  next_action: "静态验证已通过；行为验证按 manual-test 由用户在 dev server 执行 → finishing-a-development-branch"
  auto_continue: false
  assets:
    - "docs/features/2026-07-10-destiny-deepseek-provider/status.md"
    - "docs/features/2026-07-10-destiny-deepseek-provider/需求说明书.md"
    - "docs/features/2026-07-10-destiny-deepseek-provider/初步实现计划.md"
    - "docs/features/2026-07-10-destiny-deepseek-provider/context/implement.jsonl"
    - "docs/features/2026-07-10-destiny-deepseek-provider/context/review.jsonl"
    - "docs/features/2026-07-10-destiny-deepseek-provider/context/verify.jsonl"
    - "docs/reviews/2026-07-10-destiny-deepseek-provider-manual-test.md"
    - "docs/reviews/2026-07-10-destiny-deepseek-provider-verification.md"
  context_manifests:
    implement: "docs/features/2026-07-10-destiny-deepseek-provider/context/implement.jsonl"
    review: "docs/features/2026-07-10-destiny-deepseek-provider/context/review.jsonl"
    verify: "docs/features/2026-07-10-destiny-deepseek-provider/context/verify.jsonl"
  human_gates:
    requirement_confirmation:
      required: true
      status: "confirmed"
      evidence: "用户在 /dev-task 答复中确认：①DeepSeek 官方直连 deepseek-v4-flash，key 用 DEEPSEEK_MODEL；②覆盖 八字+紫微+奇门(含 Worker)+copilot；③三页共享全局 provider 开关 + localStorage 持久化，默认 doubao；④DeepSeek 用 response_format json_object + 客户端兜底。补充：变量名 ARK_DEEPSEEK_MODEL 已改为 DEEPSEEK_MODEL。"
    implementation_approval:
      required: true
      status: "confirmed"
      evidence: "用户 2026-07-10 明确指令「继续 DeepSeek 接入的实现」，确认按当前计划、回撤边界与已采纳 HIGH 修订进入 executing-plans 实现。"
  risk_gates:
    requirements_coverage: "light"
    plan_review: "light"
    rollback_units: "light"
    security_review: "light"
    behavior_verification: "required-pending-manual"
  validation:
    base_sha: "582a9636eb2cd513a1673ffd3d2a87d288dceb78"
    head_sha: "582a9636eb2cd513a1673ffd3d2a87d288dceb78"
    working_tree_dirty: "dirty(21)"
    diff_stat_hash: "c4be1f154ab36a42988c28000872a0f5"
    business_diff_fingerprint: "c4be1f154ab36a42988c28000872a0f5"
    last_validation_at: "2026-07-10"
    last_validation_commands:
      - "pnpm typecheck  # Tasks: 8 successful, 8 total, EXIT=0"
      - "pnpm lint       # Tasks: 7 successful, 7 total, EXIT=0"
  accepted_risks: []
---

# 2026-07-10-destiny-deepseek-provider 状态

- Level: M（标准 M）
- Current gate: verification_before_completion（静态通过，行为验证待用户执行）
- Completed gates: requirement_confirmation → writing-plans → requirements-coverage → plan-review → rollback-units → executing-plans → code-review
- Human gates: requirement_confirmation=confirmed；implementation_approval=confirmed
- Next action: 用户按 manual-test 跑 8 链路行为验证 → finishing-a-development-branch
- Auto-continue: no（行为验证需用户在 dev server 执行）
- Assets: 见 frontmatter
- Last updated: 2026-07-10
- Base SHA: 582a9636eb2cd513a1673ffd3d2a87d288dceb78
- Head SHA: 582a9636eb2cd513a1673ffd3d2a87d288dceb78
- Working tree dirty: dirty(21)
- Last validation: pnpm typecheck 8/8、pnpm lint 7/7（2026-07-10）

## Risk Gates 形态

| Gate | 形态 | 状态/证据 |
|------|------|-----------|
| requirements_coverage | light | DONE — 19 COVERED / 1 PARTIAL(REQ-F3 已由 HIGH-1 采纳关闭) |
| plan_review | light | DONE — 0 CRITICAL / 2 HIGH(均已采纳) / 3 MEDIUM / 4 LOW，修订已嵌入计划 |
| rollback_units | light | DONE — 摘要见下，完整边界见计划「回撤边界草案」 |
| security_review | light | 并入 code-review（key 不入库、错误不回显密钥，已在 Task 1/HIGH 覆盖） |
| behavior_verification | required | dev server 手测 8 链路 + 缺 key 500 + 持久化 + 窄屏热区 |

## 回撤摘要（rollback-units light）

- R1 抽象层 Task 1：新增文件 `packages/shared/src/destiny-model-client.ts` + `src/index.ts` 导出；未被引用前可单独删，引用后须与引用方同批回滚。
- R2 各 route（Task 2/3/5）：`provider` 默认 `doubao`，撤回 deepseek 分支即复原；旧客户端不传 provider 不受影响。
- R3 奇门（Task 4）：shared/worker/start **同批回滚**（payload provider 字段耦合）；回滚后 `?? 'doubao'` 兜底。
- R4 前端（Task 6/7）：store provider 字段 + 切换组件独立撤回；后端默认 doubao 兜底。
- 全局止血：隐藏前端切换入口即可强制全量回 doubao；DeepSeek 分支异常不影响默认链路。

## plan-review HIGH 采纳记录

- HIGH-1 已采纳：抽象层 `callModel` 在 `protocol==='deepseek-chat' && json?.schema` 时把 schema 序列化为结构样例追加到 system prompt（已写入 Task 1 Step 2）。
- HIGH-2 已采纳：奇门 worker 三处全改（`qimen-base.ts:30`、`qimen-section.ts:39` 改 `resolveModelConfig(job.data.provider ?? 'doubao')`；`qimen-section.ts:59` 用量改 `config.provider/model`），奇门用量 worker 直写随 provider 动态化（已写入 Task 4 Step 4）。
- MEDIUM 一并纳入：deepseek 路径不发 temperature（Task 1）；manual-test 通过标志（验证总览）；架构选型决策说明（技术方案）。

## 实现完成摘要（2026-07-10）

Task 1–7 全部落地，`pnpm typecheck` 8/8、`pnpm lint` 7/7 通过：

- Task 1 抽象层 `packages/shared/src/destiny-model-client.ts`：`resolveModelConfig` / `callModel` / `streamModel` / `mapModelError` / `normalizeModelUsage` + `ModelConfigError` / `ModelUpstreamError`；doubao(ARK Responses+json_schema) 与 deepseek(Chat Completions+json_object) 双协议；HIGH-1 schema 样例注入 `injectJsonSchemaSample`；流式归一对外 `text-delta/done/error`，丢弃 `reasoning_content`，非 2xx 不回显 errText。`packages/shared/src/index.ts` 已导出。
- Task 2 紫微、Task 3 八字、Task 5 copilot、Task 4 奇门（shared + start + analyze + worker qimen-base/qimen-section）：`provider` schema 默认 doubao，调用走抽象，用量 `config.provider/config.model` 动态化；奇门 payload 经 `packages/queue` + `qimen-analysis-store` 透传 `provider`，Worker `resolveModelConfig(job.data.provider ?? 'doubao')` 且用量 Worker 直写随 provider 动态化（HIGH-2）。
- Task 6 store：`persist({ name:'destiny-provider', partialize: provider })`，`setProvider` 仅 set provider（不丢表单），`resetAllWorkspaces` 保留 provider。
- Task 7 前端：三页 workspace + ai-copilot-conversation 的 fetch body 均注入 `provider`；**本轮补完** `DestinyModelSwitcher` 在 `destiny-page-client.tsx` 的实际渲染（此前仅 import 未渲染）——移动端 sticky 头部居中、桌面端右上角 `fixed right-6 top-4 z-30`。

待办（行为验证）：`docs/reviews/2026-07-10-destiny-deepseek-provider-manual-test.md` 的 8 链路 + 缺 key 500 + 持久化 + 窄屏热区，需在 `pnpm dev` + Worker 在线、真实 ARK/DeepSeek key 下由用户勾选；完成后回填 `verification.md` 并进入 `finishing-a-development-branch`。

遗留（非阻塞）：`extractArkOutputText` 在 `ark-response.ts:1` 与 `qimen-analysis.ts:1048` 已无静态引用（改用 `result.text`），eslint 未报 unused export，本次保留，可后续独立清理。
