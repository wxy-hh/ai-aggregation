# 交接文档：/chat Agent 迁 Responses API + 内置联网搜索 · 四期①收官

> 一期二期交接见 `2026-10-01-chat-agent-tools-phase1-to-phase2.md`（含 2026-10-03 根因批注），三期见 `2026-10-02-chat-agent-webhook-tools-phase3.md`。
> 本文档聚焦四期①（Responses API 迁移 + web_search）的部署要点、验收结论、记债清单与委派记录。

## 0. 一句话现状

四期① 5 个工单（补验 spike / include shim / runner 迁移 / web_search 接入 / 验收与回写）全部完成，门禁全绿、真机验收五条全过（结论见 §3）；真机验收额外抓到并已修多轮 400 回归（shim 补 `type:"message"`）。

## 1. 一期 400 根因修正（本期最重要的认知更新）

一期结论「Responses API 多轮回传 messages 报 400」**归因错误**。真实根因：`@ai-sdk/openai` 在 `store:true`（默认）下把响应历史项序列化为 `item_reference`，Ark 不支持该类型 → 400（`input ... <nil>`）。Responses API 本身支持多轮，两条路都通：

- `previous_response_id` 链式：追问只带 id + 增量 input，服务端保留搜索结果（实测第二步 input 仅 ~340 tokens vs 全量重发 12K）。**本期采用**。
- `store:false` 全量重发：可绕 400，但服务端工具结果不跨步保留（拜登幻觉实锤），弃用。

证据脚本归档：`.scratch/spike-ark-responses/`（本地目录，不进仓库）。

## 2. 四期①交付概览（勿重做，只给指针）

- spec：`docs/features/2026-10-02-chat-agent-responses-web-search/spec.md`（D-四期-1~7 决策表 + §0 spike 证据）
- 工单：`.scratch/2026-10-02-chat-agent-responses-web-search/issues/01-05`（本地，不进仓库）
- include shim：`packages/providers/src/factory.ts` 的 `doubaoFetch`（双职责：剥除 SDK 自动附加的 OpenAI 专属 `include` 值 + 给缺 `type` 的 message 历史项补 `type:"message"`；仅 doubao、仅 POST /responses；契约测试 `src/__tests__/factory.test.ts`）
- runner 迁移：`apps/web/src/app/api/chat/_lib/agent/agent-runner.ts`（`provider(model)` + 链式增量 + `maxToolCalls=3` 按轮封顶 + providerExecuted 事件直透）
- 观测：`ChatStreamFinish.searchCalls` → 结算 metadata.searchCalls（与 webhookCalls 并列，只观测不影响计费）
- 前端：`agent-trace.tsx` 的 `TOOL_LABELS`/`TOOL_ICONS` 登记 `web_search`（各 +1 行，既有本地化接缝）
- 测试：`agent-runner.test.ts`（runner 级新接缝，11 用例）+ 既有两个 handler 级回归网（46 用例原样未动）

## 3. 验收结论

### 门禁（全绿，父代理亲验）

- typecheck（web + providers）绿；lint 8 任务绿；全量 web 测试 134 文件 1266 用例绿。
- 回归网 46 用例原样未动全绿；新增 `agent-runner.test.ts` 11 用例 + `agent-trace.test.tsx` 1 用例。
- 离线捕获验证：stub 全局 fetch 实测出站 `/responses` 请求体无 `include` 字段、tools 透传 `[{"type":"web_search"}]`（脚本归档 `.scratch/spike-ark-responses/spike-verify-include-shim-offline.mts`）。
- 双轴审查（Standards/Spec 两 reviewer 子代理）发现并已修 2 个实缺陷：链 id 缺 id 不断链（必 400）、providerExecuted-only 无文本步误判最终回答（验收项④的直接路径）；细节见 spec §8。

### 真机验收（五条全过，2026-10-03 ego-browser 真实浏览器）

> 代理恢复后按序复验完成。过程中抓到并已修一个真缺陷：**多轮对话 400（missing `input.type`）**——SDK 生成的 message 历史项不带 `type`，Ark 对缺 type 的 assistant 项直接 400（user 项豁免，单轮场景幸免）；修为 `doubaoFetch` shim 给「有 role 无 type」的 input 项补 `type:"message"`，回归测试 `packages/providers/src/__tests__/factory.test.ts`（3 用例）。逐项细节见 spec §8。

1. 纯搜索时效性 ✓（真实当日新闻 + 2 张「联网搜索」卡片查询词正确，searchCalls=2 对账一致）。
2. 搜索+出图混用 ✓（两工具都触发、出图失败自动重试成功、收尾准确引用搜索结果 = 链式生效直接证据）。
3. 老三样回归 ✓（纯对话不触工具；纯出图成功；webhook 经临时实名用户 + test_echo 回声验证声明/派发/结果回注全链路，验收后已还原）。
4. max_tool_calls=3 封顶 ✓（诱导 4 话题同轮搜，恰好 3 次封顶，不出错、回答完整，searchCalls=3）。
5. 事件序列成对 ✓（各场景卡片严格调用→结果成对，无重复）。

### 计费观测（已首验）

- `AIUsageRecord` 结算 metadata 的 `searchCalls` 存在且与 UI 卡片数一致（场景①=2、场景④=3），`webhookCalls` 计数正确。
- 上线后仍需盯 ark 账单的联网搜索计费项（是否启用、单价），与 searchCalls 长期对账。

## 4. 部署备忘

1. **生产 ARK_API_KEY 确认联网搜索服务已开通**（本地 key spike 实测可用；生产 key 需人工在火山引擎控制台确认）。
2. 无新环境变量、无数据库迁移、无新依赖。
3. 回滚 = `git revert` 本期 commit（直切无开关，D-四期-6）。
4. 观察项：web_search 无 failed 事件（搜索失败时卡片恒显示成功）——列入上线后观察，不阻塞。

## 5. 记债清单（记录在案，本期不修）

1. runner 内 providerExecuted 部分访问用了防御性类型断言（`as { providerExecuted?: boolean }`），SDK 类型补全后可去断言。
2. 决策步每轮重建 ToolSet（含 webSearch 实例化），最多 4 轮、开销可忽略；若未来工具变多再考虑提升为常量。

## 6. 委派记录（delegate-antigravity）

- 本期 4 次委派（02 shim / 03-A 迁移 / 03-B 测试 / 04-A 接入 / 04-B 测试），除 02 首跑因子代理闲逛 stall（36 步零产出）外全部一次通过。
- 教训：**给全精确代码的简报最稳**（02 重跑给全代码后 10 步 23 秒完成）；探索型简报在巨型暂存工作区里容易迷失。
- 每批父代理均亲自 diff + 重跑门禁验收（不自证不信）。
- 委派简报原文：`.scratch/delegation-brief-04p1-{02,03a,03b,04a,04b}.md`。

## 7. 后续方向（未立项）

- 豆包内置工具矩阵评估：spike 已确认 `web_search` 可用；`doubao_app_call`（助手 API，搜索事件带 queries/results/summary 正文下发）是「搜索结果与引用源对用户可见」的备案路线（spec §Further Notes）。
- 跨请求链式（跨用户请求复用 previous_response_id）已明确不做（spec Out of Scope）。
