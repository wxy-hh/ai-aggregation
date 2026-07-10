# Destiny 多模型（DeepSeek + doubao）手动行为验证脚本

- Feature ID: `2026-07-10-destiny-deepseek-provider`
- Level: M（标准 M）
- 验证形态：behavior_verification = required（项目 `automated-tests: none`，运行时验证以本脚本为准）
- 静态门禁（已完成）：`pnpm typecheck` 8/8、`pnpm lint` 7/7，见 `verification.md`

## 前置条件

```bash
# 1) 基础设施（Postgres + Redis + MinIO）
pnpm infra:up

# 2) 确认 apps/web/.env.local 已配置：
#    ARK_API_KEY / ARK_BASE_URL / ARK_DESTINY_MODEL（doubao）
#    DEEPSEEK_MODEL（DeepSeek 官方 sk- apikey）
#    DATABASE_URL / REDIS_*

# 3) 启动 Web + Worker（奇门链路依赖 Worker）
pnpm dev
# Web: http://localhost:3030/destiny
```

> 奇门必须 Worker 在线：base + 三块（strategyOverview / timingWindows / chartSummary）由 BullMQ Worker 消费。

## 通用通过标志（每条链路都要勾选）

- [ ] DevTools Network 中上游命中域名与所选模型一致：
  - deepseek → `https://api.deepseek.com/v1/chat/completions`
  - doubao → `https://ark.cn-beijing.volces.com/api/v3/responses`
- [ ] 请求 body 含 `"provider":"deepseek"` 或 `"provider":"doubao"`（旧客户端不传则默认 doubao）。
- [ ] 用量记录（DB `ai_usage` / Worker 日志）`provider` / `model` 与实际选择一致：
  - deepseek → `provider=deepseek, model=deepseek-v4-flash`
  - doubao → `provider=doubao, model=<ARK_DESTINY_MODEL>`
- [ ] UI 无白屏/崩溃；结构化区块正常渲染。

## 八条主链路（4 接口 × 2 provider）

### 1. 八字 report（流式分块）

| 步骤 | doubao | deepseek |
|------|--------|----------|
| 切换入口选模型 | 豆包 | DeepSeek |
| 填表 → 提交 | `POST /api/destiny/report` body 含 provider | 同左 |
| 通过标志 | status→section-final→complete 顺序到达；sections 渲染；命中 ark 域名 | 同左，命中 `api.deepseek.com`；`complete` 正常 |
| 截断容错 | — | 把 `REPORT_MAX_OUTPUT_TOKENS` 临时调小（或弱网）→ 前端显示可识别错误而非白屏 |

- [ ] 八字 × doubao 通过
- [ ] 八字 × deepseek 通过

### 2. 紫微 ziwei-report（quick + full JSON）

| 步骤 | doubao | deepseek |
|------|--------|----------|
| 切换入口选模型 | 豆包 | DeepSeek |
| 提交 | `POST /api/destiny/ziwei-report` body 含 provider | 同左 |
| 通过标志 | quick（profileOverview/overviewModules/timeline/relations）+ full（palaceAnalysis/love/health）均渲染；命中 ark | 同左，命中 `api.deepseek.com`；quick 失败时跳过不崩、full 失败返回可识别 502 |

- [ ] 紫微 × doubao 通过
- [ ] 紫微 × deepseek 通过

### 3. 奇门（Worker：base + 三块）

| 步骤 | doubao | deepseek |
|------|--------|----------|
| 切换入口选模型 | 豆包 | DeepSeek |
| 提交 | `POST /api/destiny/qimen/analyze/start` body 含 provider | 同左 |
| Worker 日志 | `qimen-base` / `qimen-section` 命中 ark 域名 | 命中 `api.deepseek.com` |
| 通过标志 | base + strategyOverview + timingWindows + chartSummary 全部 `completed` | 同左；用量由 Worker 直写，`provider/model` 与实际一致 |
| 兼容 | 旧版 Worker（无 provider 字段）按 `?? 'doubao'` 兜底不崩 | — |

- [ ] 奇门 × doubao 通过
- [ ] 奇门 × deepseek 通过

### 4. copilot 追问（流式）

| 步骤 | doubao | deepseek |
|------|--------|----------|
| 在报告页发起追问 | `POST /api/destiny/copilot` body 含 provider | 同左 |
| 通过标志 | `text-delta` 持续到达、`done` 收尾；命中 ark | 同左，命中 `api.deepseek.com`；断网/超时 → 显示「追问超时，请稍后重试」 |

- [ ] copilot × doubao 通过
- [ ] copilot × deepseek 通过

## 额外门禁

### AC5 缺 key 500 不泄露

```bash
# 临时移除 DEEPSEEK_MODEL 后重启 Web，选 DeepSeek 发起任意测算
```

- [ ] 响应 HTTP 500，body `{ error: "DeepSeek 模型未配置（缺少 DEEPSEEK_MODEL）" }` 或同等中文文案。
- [ ] 响应体**不出现** `DEEPSEEK_MODEL` 的 key 字符串（grep 响应 `sk-` 无结果）。
- [ ] 恢复 env 后 doubao 链路不受影响。

### AC3 切换记忆（持久化 + 三页同步）

- [ ] 选 DeepSeek 后刷新页面，`localStorage['destiny-provider']` 含 `"provider":"deepseek"`，store 恢复为 deepseek。
- [ ] 八字页选 DeepSeek → 切到紫微/奇门页，入口仍显示 DeepSeek（同一全局选择）。
- [ ] 切模型后已填表单不丢失（`setProvider` 仅 `set({ provider })`，不动 workspace formData）。
- [ ] 清缓存（`localStorage.removeItem('destiny-provider')`）后回到默认 doubao。

### AC / UI 窄屏热区（mobile-first）

- [ ] 390px 宽屏：三页顶部均可见模型切换入口。
- [ ] 切换按钮热区 ≥ 44×44（DevTools 量取 `min-h-11 min-w-[88px]`）。
- [ ] 不依赖 hover 暴露关键信息（移动端点击即切换）。

## 收尾

- 全部勾选后：把本脚本结果（勾选状态 + 截图/日志）回填到 `docs/reviews/2026-07-10-destiny-deepseek-provider-verification.md` 的「行为验证结果」段。
- 任一链路失败：在 verification 报告记录失败链路、上游域名、错误帧/状态码，回到对应 Task 修复后重测。
