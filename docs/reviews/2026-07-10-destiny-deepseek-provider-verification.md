# Destiny 多模型（DeepSeek + doubao）完成前验证报告

- Feature ID: `2026-07-10-destiny-deepseek-provider`
- Level: M（标准 M）
- 验证时间：2026-07-10
- Head SHA: `582a9636eb2cd513a1673ffd3d2a87d288dceb78`（改动未提交，工作区 dirty=21）

## 结论

**静态门禁：通过。** `pnpm typecheck` 8/8、`pnpm lint` 7/7 全绿（含本次补完后的 Web 包 cache miss 重跑）。
**行为门禁：待执行。** 已产出可执行脚本 `2026-07-10-destiny-deepseek-provider-manual-test.md`（8 链路 + 缺 key + 持久化 + 窄屏热区），需在 `pnpm dev` + Worker 在线、真实 ARK/DeepSeek key 下由人勾选。本报告不声称运行时验证已完成。

## 静态验证证据

| 命令 | 结果 | 备注 |
|------|------|------|
| `pnpm typecheck` | `Tasks: 8 successful, 8 total` `EXIT=0` | 补完切换入口 JSX 后 `@repo/web` cache miss 重跑通过 |
| `pnpm lint` | `Tasks: 7 successful, 7 total` `EXIT=0` | 同上，`@repo/web` cache miss 重跑通过 |

> 注：项目 `automated-tests: none`，typecheck/lint 不作为功能正确性证据，仅作静态门禁。

## 需求 → 代码落点核对（实现满足性）

| 编号 | 满足方式 | 关键落点 |
|------|----------|----------|
| REQ-F1 provider schema 默认 doubao | 四 route `.default('doubao')`；start route 单独 safeParse 缺省 doubao | `report/route.ts:54`、`ziwei-report/route.ts:50`、`qimen/analyze/route.ts:38`、`copilot/route.ts:106`、`qimen/analyze/start/route.ts:59-62` |
| REQ-F2 按 provider 选协议/凭据 | `resolveModelConfig(provider)` 返回 ark-responses / deepseek-chat，key 取 `ARK_API_KEY` / `DEEPSEEK_MODEL` | `packages/shared/src/destiny-model-client.ts:108-137` |
| REQ-F3 结构化输出 | doubao `json_schema`；deepseek `json_object` + 抽象层 `injectJsonSchemaSample` 注入结构样例（plan-review HIGH-1）；客户端 `parseModelJson`/`extractJsonBlock` 兜底 | `destiny-model-client.ts:235-247,296-336,454-530` |
| REQ-F4 流式对外帧不变 | `streamModel` 归一 ARK `response.output_text.delta` 与 DeepSeek `delta.content` → 统一 `text-delta/done/error`；report/copilot 前端解析零改动 | `destiny-model-client.ts:364-535`、`report/route.ts:264-279`、`copilot/route.ts:241-258` |
| REQ-F5 奇门 Worker 透传 | payload 带 `provider`；Worker `resolveModelConfig(job.data.provider ?? 'doubao')`；用量 `config.provider/config.model`（plan-review HIGH-2） | `qimen/analyze/start/route.ts:90,106`、`worker/qimen-base.ts:32`、`worker/qimen-section.ts:36,60-61`、`packages/queue/src/jobs.ts:58,66`、`packages/shared/src/qimen-analysis-store.ts:212` |
| REQ-F6 前端共享切换 + 持久化 + 不丢表单 | `persist({ name:'destiny-provider', partialize: provider })`；`setProvider` 仅 `set({provider})` 不动 formData；三页共享同一入口 | `stores/destiny-workspace-store.ts:174-233`、`components/destiny/model-switcher.tsx`、`destiny-page-client.tsx:118,190` |
| REQ-F7 用量动态 + 缺 key 500 不泄露 | 各 route `provider: config.provider, model: config.model`；`ModelConfigError` message 不含 key 值 → 500 | `destiny-model-client.ts:115`、`report/route.ts:340-348`、`ziwei-report/route.ts:411-420,470-479`、`copilot/route.ts:261-272`、`qimen/analyze/route.ts:736-749` |
| REQ-USAGE 奇门用量落点 | 奇门用量由 **Worker 直写**（`recordAiUsage`），已随 provider 动态化 | `worker/qimen-section.ts:57-65` |
| AC1 默认 doubao 与改动前一致 | provider 缺省 doubao；doubao 分支保留 ARK Responses + json_schema + reasoning effort | `destiny-model-client.ts:124-136,251-294` |
| AC2 DeepSeek 全链路 + 上报正确 | 见 REQ-F2/F3/F4/F5/F7 落点 | 上表 |
| AC3 切换记忆（刷新 + 三页同步） | persist + 父容器统一渲染入口（移动 sticky 头 / 桌面 fixed 右上） | `destiny-page-client.tsx:118,190` |
| AC4 DeepSeek 非法/空 JSON 不崩 | 空 content / `finish_reason==='length'` 由调用方兜底：ziwei quick 跳过/full 可识别 502；qimen 截断重试后 502；report 流末解析失败走缺省分区兜底 | `ziwei-report/route.ts:443-452`、`qimen/analyze/route.ts:680-690`、`report/route.ts:220-281` |
| AC5 缺 key 500 不泄露 | `ModelConfigError('DeepSeek 模型未配置（缺少 DEEPSEEK_MODEL）')` 不携带 key；非 2xx `ModelUpstreamError(mapModelError(status),status)` 不回显 errText | `destiny-model-client.ts:115,274-276,317-319` |
| OUT-1~OUT-5 | 未改 `packages/providers/deepseek.ts`、`/chat`、`/resume`、计费规则、`DEEPSEEK_MODEL` 命名；流式丢弃 `reasoning_content` | grep 确认 chat/resume 仍写死 doubao（属范围外，预期不变） |

## 本次「接着实现」补完的关键缺口

接入计划在实现阶段遗留一处 UI 接线：`DestinyModelSwitcher` 组件已建（`components/destiny/model-switcher.tsx`）且在 `destiny-page-client.tsx` import，但**未在 JSX 渲染**——切换入口不出现在页面上，用户无法切换模型（REQ-UI-2/REQ-F6 未真正落地）。本次补完：

- 移动端：sticky 顶部栏内、模块 tab 下方居中渲染 `<DestinyModelSwitcher />`（`destiny-page-client.tsx:118`），三页共享、拇指易触达、热区 ≥44×44。
- 桌面端：内容区右上角 `fixed right-6 top-4 z-30` 渲染（`destiny-page-client.tsx:190`），`z-30` 低于奇门 loading `z-35`（loading 时自动被遮，防误触），不占布局流、不挤压 workspace。

补完后 `pnpm typecheck`/`pnpm lint` 均重新通过。

## 行为验证结果（待执行）

执行人需在 `pnpm dev` + Worker 在线、真实 key 下按 `2026-07-10-destiny-deepseek-provider-manual-test.md` 勾选。以下留空待回填：

- [ ] 八字 × doubao / deepseek
- [ ] 紫微 × doubao / deepseek
- [ ] 奇门 × doubao / deepseek（Worker 日志含所选上游域名）
- [ ] copilot × doubao / deepseek
- [ ] 缺 `DEEPSEEK_MODEL` 500 且响应体无 key 字符串
- [ ] localStorage 持久化 + 三页同步 + 表单不丢
- [ ] 390px 窄屏热区 ≥44×44

## 已知遗留与风险（非阻塞）

1. **死代码**：`extractArkOutputText` 在 `apps/web/src/app/api/destiny/_lib/ark-response.ts:1` 与 `packages/shared/src/qimen-analysis.ts:1048` 各一份，当前已无静态引用（改用 `result.text`）。`eslint` 未将 unused export 列为 error，本次保留以控制改动面；后续可作为独立清理 PR 删除。
2. **Worker/Web 同版本**：奇门 `provider` 经 job payload 透传，部署须先 Worker 后 Web（Worker `?? 'doubao'` 兼容旧 payload）。本任务未涉及部署，记录备查。
3. **DeepSeek 思考模式**：默认开启，`temperature/top_p` 不生效（抽象层已不发送），输出稳定性与 doubao 不可严格对齐（需求已确认只取 `content`）。
4. **行为验证未在本会话执行**：静态通过 ≠ 运行时正确；上线前必须完成 manual-test 勾选。
