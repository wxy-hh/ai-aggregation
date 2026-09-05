# 星座寰宇 · 任务交接文档（2026-09-05 版：UI 全部收官，下一阶段 = 接入真实模型测算）

> 接续方式：直接说「读 `.scratch/constellation-universe/HANDOFF.md`，接着做」。
> 历史工单细节归档：`.scratch/constellation-universe/HANDOFF-archive-2026-09-04.md`（01–13 验收史、P0 视觉、3D 舞台、天象仪重做、布局重构、工具链套路全在里面，别重写本文档已有的结论）。
> 设计文档：`docs/designs/2026-07-26-constellation-universe-design.md`（V1.6）；全局主题文档：项目根 `DESIGN.md`（已全量重写，改 UI 必须同步更新它）。

## 一句话现状

星座寰宇 13 个工单 + 终验 code-review + 三轮视觉重做（珠宝化星盘 → 3D 舞台+章节式布局 → 悬浮天象仪）全部完成并截图验收，测试 264 全绿（2026-09-04）；**但内容层 100% 是本地确定性生成，没有接入豆包/DeepSeek，没有任何 API 路由，没有一次 LLM 调用。**

## 模型接入真相（用户最关心，已逐文件核实）

### 星座寰宇（astrology）—— 纯本地，零模型

- `grep astrology apps/web/src/app/api/` → 空，**无 API 路由**
- 内容层全部由本地模块生成（文件名 mock 指「不经服务端」，其中天文计算是真实算法）：
  - `apps/web/src/lib/astrology/mock-chart-facts.ts` — 真值层：行星黄经/星座/相位/宫位，真实天文算法（配合 `solar-longitude.ts`），锚点验证过（示例盘 1995-10-08 14:30 上海，太阳天秤 194.5°，上升水瓶 312.1°）
  - `apps/web/src/lib/astrology/mock-interpretation.ts` — 模板组装文案：`buildMockInterpretation`（主轴金句）/ `buildModuleReadings`（五模块）/ `buildWeeklyGuidance`（周运）/ `buildKeyAspects`（关键相位）
  - `apps/web/src/lib/astrology/mock-qa.ts` — 规则路由式问答 `answerAstrologyQuestion`（敏感拦截 + 事实引用 citations）
- 前端消费点：`astrology-result-view.tsx`（解读）、`astrology-qa.tsx`（问答）—— 接模型时只换这两个取数来源

### 其他命理盘 —— 已真实接入豆包/DeepSeek（现成范式，直接抄）

- 路由：八字 `app/api/destiny/report/route.ts`、紫微 `api/destiny/ziwei-report/route.ts`、奇门 `api/destiny/qimen/`、copilot `api/destiny/copilot/`
- 共用基建（`app/api/destiny/_lib/` + `@repo/shared`）：
  - `@repo/shared`：`streamModel` / `resolveModelConfig` / `ModelConfigError` / `ModelUpstreamError`（火山方舟 ARK，模型如 `doubao-seed-2-0`）
  - `_lib/report-generation.ts`：`createReportHandler` 适配器 —— SSE 流式报告通用骨架，八字/紫微共用
  - `_lib/bazi-json-schema.ts`：Doubao json_schema 结构化输出范例
  - 配额计费：`@/lib/billing/quota-service`（reserveChatQuota / settleAiQuota / releaseAiQuota）+ `@/lib/ai-usage` + `_lib/report-normalizer.ts`
  - SSE 编码：`@/lib/utils/sse` 的 `encodeSseEvent`
- provider 选择：`stores/destiny-workspace-store.ts` 的 `provider: 'doubao' | 'deepseek'`（默认 doubao）；切换 UI `components/destiny/model-switcher.tsx`
- 前端流式消费参考：`bazi-workspace.tsx` / `ziwei-workspace.tsx`

## 下一阶段蓝图：星座寰宇接模型测算（明天的活）

**必须保留的架构哲学**：星象事实（行星位置/相位/宫位）永远来自 `computeChartFacts` 真实计算，LLM 只做「表达层」（解读、金句、问答），且输出必须绑定事实引用 —— mock-qa 的 citations 模式就是现成的防幻觉骨架，设计文档的诚实性规格（不虚构不稳定数据、时间未知档降级）在模型时代依然生效。

建议切法（tracer bullet，动手前与用户确认粒度）：

1. 新建 `app/api/destiny/astrology-report/route.ts`：复用 `createReportHandler` + `streamModel`，输入 chart facts JSON，prompt 携带完整事实层，结构化输出对齐 `AstrologyMockInterpretation` 形状（前端可零改动切换）
2. `astrology-result-view.tsx` 的 interpretation 来源从 `buildMockInterpretation` 换成 SSE 流；mock 保留作降级/离线兜底
3. 星语问答 `answerAstrologyQuestion` → 同一路由或独立端点，敏感拦截前置保留
4. 配额走 `quota-service`，与八字/紫微同账；provider 复用全局 model-switcher

**动手前需先探明的未知项**：`@repo/shared` 的 `streamModel` 结构化输出能力边界；bazi-json-schema 能否泛化到星盘报告；facts 序列化体积（prompt token 预算）；流式中途失败的降级口径。

## 进度总览（全部 ✅，验收细节见归档文档）

| 范围 | 状态 |
| ---- | ---- |
| 工单 01–13（骨架/真值层/入口/表单/仪式/首屏/模块/深入解读/无宫位降级/问答/历史/分享海报/终验） | ✅ 全部完成，终验 code-review 4 项 finding 已修 |
| P0 视觉（星盘珠宝化/金句渐变/双层星野流星/CTA shimmer/右栏控制台化） | ✅ 完成 |
| 3D 星盘舞台 + 结果页章节式布局（二轮修四处空白） | ✅ 完成 |
| 悬浮天象仪星盘重做（十星宝珠/四元素光谱/装饰表圈/相位弓形弧光/盘心星核） | ✅ 完成，含两个真实可点性 bug 修复 |
| craft-floor 三条（::selection/caret、night-muted/faint 令牌、事实卡 ghost card） | ✅ 完成 |
| DESIGN.md 全局主题文档重写 | ✅ 完成 |
| **git 提交** | ❌ 未提交，22 项变更压在工作树，提交前必须问用户 |

## 环境与工具链（坑都踩过，直接照做）

- dev server：后台任务 `bash-9ithqnsj`（`cd apps/web && pnpm dev`），**端口 3030**；接手先 `lsof -nP -iTCP:3030 -sTCP:LISTEN` 确认无僵尸占口（旧会话残留会让 pnpm dev 静默退到 3032 跑旧代码）
- **改 `tailwind.config.ts` 后必须重启 dev server**，否则 JIT 不生成新色板，类静默失效
- 截图验收：项目 Playwright harness（createRequire 指向 `.pnpm/playwright@1.61.1`），脚本套路在 `/tmp/qa/*.cjs`；ego-browser 在本机无渲染表面不可用
- 校验：`cd apps/web && pnpm typecheck && pnpm vitest run`（接手先重跑确认基线 264 绿）
- 已清理：`apps/web/src/.scratch-tw/` 探针残留已删（2026-09-05）

## 硬约束（用户反复强调，违反即返工）

- **星盘/星座/动画/动效/UI 页面必须主对话亲自写**，子代理只打下手（纯逻辑层才可派）
- 全中文注释与 UI 文案；最小改动不重构无关代码；写代码后补中文注释
- 设计硬规则：无英文占星术语、先结论后术语、不虚构不稳定数据、尊重减少动态、移动端优先+安全区、热区 ≥44
- git 提交需用户明确确认

## 建议技能（suggested skills）

- 接模型 API 路由 → `/tdd`（接缝 = 新 API route + `@repo/shared` streamModel，八字路由是同型 prior art，测试可仿 `ziwei-report/route.test.ts`）
- 实现纪律 → `/implement`（typecheck 常跑、单测文件常跑、全量测试收尾）
- 完成后 → `/code-review` 双轴审查（规范轴+需求轴），再请求用户确认提交
- 若需先梳理「事实层 vs 表达层」的领域语义 → `/domain-modeling`
