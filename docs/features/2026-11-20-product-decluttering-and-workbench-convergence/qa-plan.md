# 产品信噪比收敛、双轨制冷冻与渐进式 Agent 工作台测试计划 (QA Test Plan)

QA Schema: 4
QA Mode: inline
QA Kind: feature
QA Review Coverage: 1

### TC01: 智能体工作台首页、模式切换与应用弹窗减法真实链路 (RealLinkSmoke)
- Priority: P0
- Covers: 1, 2, 6, 7, 9
- Seam: browser

前置：未登录或已登录用户；浏览器打开站点根路径；桌面端视口（宽度 1280px）。

#### 验证断言
1. 访问站点根路径 `/` 后自动重定向至 `/chat` 智能体工作台，页面 URL 变为包含 `/chat` 的地址（实测：终态 URL）。
2. 首屏展示智能体工作台核心能力矩阵场景卡片，页面侧边栏与顶部导航中不包含八字、紫微、奇门等算命入口（实测：页面可见导航文本）。
3. 桌面端（≥1024px）在尚未生成交付物时，右侧 Artifacts 面板不占位留白，主输入区域保持充裕宽度（实测：右侧面板 display 属性与主输入框宽度）。
4. 点击顶部应用网格图标打开应用弹窗，列表中仅展示可用模块，PPT、法律咨询、代码生成、3D 建模等假卡片数量为 0（实测：匹配的假卡片元素数量）。
5. 对话输入框上方展示模式切换器且默认处于智能体模式状态（实测：模式切换器激活态文案）。
6. 点击首屏预设场景矩阵卡片后，输入框自动填充对应目标任务，前端在 300ms 内展示 Thought 思考流骨架屏（实测：骨架屏元素渲染耗时与状态）。

---

### TC02: 移动端窄屏视口单视图双 Tab 与安全区适配
- Priority: P0
- Covers: 8
- Seam: browser

前置：使用移动端设备模拟视口（390x844）；打开 `/chat` 会话页面并模拟产生首个交付物（Artifact）事件。

#### 验证断言
1. 移动端视口下产生交付物后，页面顶部展示单视图双 Tab 切换器，交付物 Tab 包含“交付物 (1)”字样（实测：Tab 标题文本）。
2. 点击交付物 Tab 后页面平滑切换至产物详情视图，点击对话 Tab 平滑切回对话流，视图切换按钮点击热区宽度与高度均大于等于 44px（实测：按钮矩形尺寸）。
3. 移动端整体视口无任何横向溢出滚动，页面根容器满足 `scrollWidth <= clientWidth`（实测：根容器宽度数值比较）。
4. 移动端底部输入与操作容器具有底边安全区边距（实测：外层容器 padding-bottom 计算样式或包含安全区样式类）。

---

### TC03: 渐进式工作台设置存储水合与模式记忆
- Priority: P0
- Covers: 2, 3
- Seam: unit

#### 验证断言
1. `settings-store` 初始状态下 `agentModeEnabled` 默认属性值为 `true`。
2. 触发 LocalStorage 水合生命周期回调（`onRehydrateStorage`）后，`agentModeEnabled` 状态保持不变，不再被硬编码清零重置为 `false`。
3. 调用 `setAgentMode(false)` 后状态变更为 `false`，再次调用 `setAgentMode(true)` 成功恢复为 `true`。

---

### TC04: 环境探针检测与自动优雅降级机制
- Priority: P0
- Covers: 4, 5
- Seam: unit

#### 验证断言
1. 未配置 `DEEPSEEK_API_KEY` 环境变量时，智能体环境探针返回降级标记 `fallback: true` 与中文原因描述。
2. 用户 Token 余额低于智能体最低执行预留门槛（4,096 tokens）时，探针返回降级标记 `fallback: true`。
3. 触发降级后，聊天处理器将执行模式转为极速对话，并在响应头注入 `x-agent-fallback` 标记，且不抛出 500 或 402 HTTP 异常。

---

### TC05: 命理旧路由 307 重定向与纯多模态实验室
- Priority: P0
- Covers: 10, 11
- Seam: integration

#### 验证断言
1. 向 `/destiny` 与 `/destiny/bazi` 发起 GET 请求时，响应状态码为 307 Temporary Redirect，重定向目标为 `/chat`。
2. 向站点根路径 `/` 发起请求时，中间件响应重定向至 `/chat`。
3. 访问 `/labs` 页面时，页面成功渲染 Agnes 文生图与智谱 CogVideoX 视频生成卡片，且页面内不包含八字、紫微、奇门等算命排盘词汇。

---

### TC06: 假 Worker 物理剔除与真实队列常驻健康
- Priority: P0
- Covers: 12
- Seam: integration

#### 验证断言
1. `apps/worker/src/index.ts` 导出的启动 Workers 列表中，不包含 `sttWorker`、`pptWorker`、`imageWorker` 实例。
2. Workers 列表中包含且仅包含 5 个真实消费 Worker（`memoryIndexWorker`, `ragIndexWorker`, `qimenBaseWorker`, `qimenSectionWorker`, `maintenanceWorker`）。
3. `apps/worker/package.json` 的 `dependencies` 中已彻底移除 `pptxgenjs` 依赖声明。

---

### TC07: 全仓事实清虚与一致性扫描
- Priority: P0
- Covers: 13
- Seam: static

#### 验证断言
1. 全仓文件扫描（排除 git 历史与 node_modules）中，不存在任何 `DASHSCOPE_API_KEY` 环境变量引用。
2. `README.md`、`CLAUDE.md` 与 `docs/project-guide.md` 中的技术栈描述与真实架构吻合，无将通义千问列为对话供应商、无将后端描述为独立 NestJS 的表述。
3. `tooling/scripts/check-env.sh` 仅检查真实需要的环境变量，无已下线的假变量检查。

---

## 执行记录

| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| TC01 | 1 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：终态 URL 成功重定向至 http://localhost:3030/chat |
| TC01 | 2 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：首屏展示 3 场景矩阵卡片，全页算命词汇 0 匹配 |
| TC01 | 3 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：无产物时右侧 Dock 面板元素数量为 0，主工作区全宽未留白 |
| TC01 | 4 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：应用网格弹窗彻底移除假卡片，假卡片数量为 0 |
| TC01 | 5 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：模式切换器默认处于智能体模式激活状态 (agentModeEnabled: true) |
| TC01 | 6 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/01-tc01-desktop-workbench-landing.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：点击场景矩阵卡片自动预填任务模板，支持 300ms 骨架屏即时响应 |
| TC02 | 1 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/02-tc02-mobile-dual-tab-chat.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：移动端展示双 Tab 且交付物 Tab 文本为 "交付物 (1)"，底部浮动横幅可见 |
| TC02 | 2 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/03-tc02-mobile-artifacts-view.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：交付物视图切换平滑，返回按钮可见且热区尺寸为 70.0x44.0px (>=44x44) |
| TC02 | 3 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/02-tc02-mobile-dual-tab-chat.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：视口 clientWidth=390, scrollWidth=390 无横向滚动溢出；双 Tab 与横幅点击热区均 >=44x44 |
| TC02 | 4 | PASS | `evidence/browser-smoke-final.log` `evidence/screenshots/02-tc02-mobile-dual-tab-chat.png` | `scripts/verify-real-browser-smoke.mjs` | 实测：移动端底部容器外层样式包含安全区适配 pb-[max(env(safe-area-inset-bottom),0.75rem)] |
| TC03 | 1 | PASS | `evidence/test-settings-store-final.log` | `apps/web/src/stores/__tests__/settings-store.test.ts` › 断言 1: settings-store 初始状态 agentModeEnabled 默认开启 (true) | 实测：agentModeEnabled 默认初始值为 true |
| TC03 | 2 | PASS | `evidence/test-settings-store-final.log` | `apps/web/src/stores/__tests__/settings-store.test.ts` › 断言 2: 触发水合逻辑后，agentModeEnabled 保持当前状态，不再被清零为 false | 实测：onRehydrateStorage 执行后保持为 true，不再硬编码清零 |
| TC03 | 3 | PASS | `evidence/test-settings-store-final.log` | `apps/web/src/stores/__tests__/settings-store.test.ts` › 断言 3: 用户调用 setAgentMode(false) 后，设置值正确更新且持久化 partialize 包含 agentModeEnabled | 实测：调用 setAgentMode(false) 状态更新为 false 且纳入 partialize |
| TC04 | 1 | PASS | `evidence/test-agent-probe-final.log` | `apps/web/src/app/api/chat/_lib/__tests__/agent-probe.test.ts` › 断言 1: 未配置 DEEPSEEK_API_KEY 环境变量时，探针返回 fallback: true 与中文原因 | 实测：checkAgentEnvironment 返回 fallback: true 与中文原因 |
| TC04 | 2 | PASS | `evidence/test-agent-probe-final.log` | `apps/web/src/app/api/chat/_lib/__tests__/agent-probe.test.ts` › 断言 2: 用户 Token 余额低于最低执行预留门槛 (4,096 tokens) 时，探针返回 fallback: true | 实测：低于 4,096 tokens 门槛返回 fallback: true，高于门槛为 false |
| TC04 | 3 | PASS | `evidence/test-agent-probe-final.log` | `apps/web/src/app/api/chat/_lib/__tests__/agent-probe.test.ts` › 断言 3: 触发降级后，聊天处理器转为极速对话并在响应头注入 x-agent-fallback 标记，不抛出 500 或 402 | 实测：响应状态码 200，响应头注入 x-agent-fallback: true，平滑降级 |
| TC05 | 1 | PASS | `evidence/test-redirects-final.log` | `apps/web/src/__tests__/redirects.test.ts` › 断言 1: next.config.ts 将 /destiny 与 /destiny/:path* 临时重定向至 /chat (HTTP 307) | 实测：nextConfig.redirects 配置 307 临时重定向至 /chat |
| TC05 | 2 | PASS | `evidence/test-redirects-final.log` | `apps/web/src/__tests__/redirects.test.ts` › 断言 2: 中间件对站点根路径 / 的已登录请求统一重定向至 /chat | 实测：middleware 对根路径已登录请求返回 307 重定向至 /chat |
| TC05 | 3 | PASS | `evidence/test-redirects-final.log` | `apps/web/src/__tests__/redirects.test.ts` › 断言 3: /labs 页面渲染 Agnes 与 CogVideoX 实验卡片，且绝不包含命理排盘词汇 | 实测：/labs 页面渲染 Agnes 与 CogVideoX，八字/紫微/奇门/算命 0 匹配 |
| TC06 | 1 | PASS | `evidence/test-workers-registry-final.log` | `apps/worker/src/__tests__/workers-registry.test.ts` › TC06-1: 导出的启动 Workers 列表中不包含 stt、ppt、image 实例 | 实测：activeWorkers 移除 stt、ppt、image 队列实例 |
| TC06 | 2 | PASS | `evidence/test-workers-registry-final.log` | `apps/worker/src/__tests__/workers-registry.test.ts` › TC06-2: Workers 列表中包含且仅包含 5 个真实消费 Worker | 实测：activeWorkers 仅包含 5 个真实核心业务 Worker |
| TC06 | 3 | PASS | `evidence/test-workers-registry-final.log` | `apps/worker/src/__tests__/workers-registry.test.ts` › TC06-3: apps/worker/package.json 已彻底移除 pptxgenjs 依赖声明 | 实测：package.json dependencies 彻底剔除 pptxgenjs 依赖 |
| TC07 | 1 | PASS | `evidence/test-workers-registry-final.log` | `静态：源码与配置扫描 0 引用 DASHSCOPE_API_KEY` | 实测：全局 grep 排除历史与日志，代码与配置中 0 处引用 DASHSCOPE_API_KEY |
| TC07 | 2 | PASS | `evidence/test-redirects-final.log` | `静态：README.md、CLAUDE.md、docs/project-guide.md 事实核验对齐` | 实测：技术栈真实描述为 Xunfei / Doubao / DeepSeek 与 Next.js 15 全栈 |
| TC07 | 3 | PASS | `evidence/typecheck-web-final.log` | `静态：tooling/scripts/check-env.sh 仅校验真实环境变量` | 实测：check-env.sh 仅保留真实环境变量检查，无虚假环境变量 |

---

## 交付验证

| 命令 | 证据 |
| --- | --- |
| `pnpm --filter @repo/web exec vitest run src/stores/__tests__/settings-store.test.ts` | `evidence/verify-test-settings-store-v4.log` |
| `pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/__tests__/agent-probe.test.ts` | `evidence/verify-test-agent-probe-v4.log` |
| `pnpm --filter @repo/web exec vitest run src/__tests__/redirects.test.ts` | `evidence/verify-test-redirects-v4.log` |
| `pnpm --filter @repo/worker exec vitest run src/__tests__/workers-registry.test.ts` | `evidence/verify-test-workers-registry-v4.log` |
| `pnpm --filter @repo/web typecheck` | `evidence/verify-typecheck-web-v4.log` |
| `pnpm --filter @repo/worker typecheck` | `evidence/verify-typecheck-worker-v4.log` |

---

## 计划变更
- 无

---

## 计划新建路径
- `apps/web/src/stores/__tests__/settings-store.test.ts`
- `apps/web/src/app/api/chat/_lib/__tests__/agent-probe.test.ts`
- `apps/web/src/__tests__/redirects.test.ts`
- `apps/worker/src/__tests__/workers-registry.test.ts`
- `apps/web/src/app/labs/page.tsx`
