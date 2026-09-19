# 星座寰宇 · 任务交接文档（2026-09-07 版：「星渊」WebGL 深空星盘上线，下一阶段 = 接入真实模型测算）

> 接续方式：直接说「读 `.scratch/constellation-universe/HANDOFF.md`，接着做」。
> 历史工单细节归档：`.scratch/constellation-universe/HANDOFF-archive-2026-09-04.md`（01–13 验收史、P0 视觉、3D 舞台、天象仪重做、布局重构、工具链套路全在里面，别重写本文档已有的结论）。
> 设计文档：`docs/designs/2026-07-26-constellation-universe-design.md`（V1.6）；全局主题文档：项目根 `DESIGN.md`（已含「星渊」章节 10.1 与 6.4/6.5 的 WebGL 规则，改 UI 必须同步更新它）。

## 2026-09-07 本轮新增：结果页星盘升级为「星渊」WebGL 场景

- 起因：用户对 SVG 星盘不满（要星空/3D/动效/神秘感）。方案 = 三层 R3F 深空场景，计划文件在会话 plans 目录（carnage-magik-jay-garrick.md），已批准。
- 新文件：`apps/web/src/lib/astrology/wheel-scene-layout.ts`（事实→3D 映射纯函数，与 SVG 轮同几何口径）+ 14 测试；`app/destiny/_components/astrology/astrology-wheel-scene.tsx`（~1060 行，主对话亲自写）；`astrology-wheel-scene-switch.tsx`（WebGL 探测/按需分包/SVG 三级兜底，`useWheelSceneAvailable` 导出）。
- 接线：`astrology-ritual.tsx` wheelSlot 结果相位切场景（SVG 为 fallback 节点）；`astrology-result-view.tsx` Wheel3D `parallax={wheelSceneOk !== true}` 防双重视差。
- 依赖：apps/web 新增 three@0.185 / @react-three/fiber@9.7 / @react-three/drei@10.7 / @react-three/postprocessing@3.1。
- **两个真实 bug 已修**（教训已入 DESIGN.md 6.4）：
  1. R3F 测量竞态：容器尺寸被布局瞬态污染且不自愈（场景缩成 1/4 卡左上），修法 = 场景内 `SizeGuard`（读容器布局盒多次复查校正）+ Canvas `resize={{ scroll:false }}`；验收截图必查项。
  2. 预存 console 噪音：chart-wheel 相位弧 `motion.path` 把 `d` 放 `animate` 没放 `initial`，首帧写入 `"undefined"`；修法 = `initial` 补 `d`（astrology-chart-wheel.tsx:573/585 附近）。
- 验收基线：`pnpm vitest run` **278/278 绿**（264+14 新增）；eslint 干净；typecheck 仅 HEAD 预存 4 错（layout 组件 icon props，非本功能引入）；Playwright 截图全绿（桌面暗/浅、移动、选中态、reduce-motion 静态帧、WebGL 关闭 SVG 兜底）。
- 截图套路更新：用 `--use-angle=metal --enable-gpu` 起浏览器（SwiftShader 会跑死主线程）；裁剪用场景容器 boundingBox（恒定正方形）；WebGL 兜底用 `addInitScript` 打桩 `getContext` 返回 null（GPU 开关参数无效）。
- **git 状态**：9/5 用户已自行提交全部旧工作（`5109b1d`）；本轮星渊改动**未提交**，提交前必须问用户。

### 2026-09-07 下午追加：交互细节打磨（用户反馈驱动）

- **选中脉冲克制化**：删掉盘心半径 4.6 共振波、双冲击波改单柔波（opacity 0.5）、删双伴星与旋转星芒、雷达环 8s→16s 半透明度、选中增亮 1.35→1.18 / emissive 2.8→2.2。原则：高级感来自克制。
- **星盘居中**：SceneRig 基础倾角 -0.14→-0.055 rad（大倾角投影会让盘面「上面多下面少」），并加 +0.06 世界单位 y 补偿；悬浮呼吸叠加其上。
- **轴线标签**：上升/天顶 加 `whitespace-nowrap`（Html 零宽容器会把两字标签挤成竖排）。
- **度数标签**：推出宝珠光晕亮核（±16/15 → ±26 单位），外轨向内/中轨向外/内轨向内避开黄道符号带。
- 复验：278 测试绿、eslint 净、六场景截图重拍确认；控制台仅剩预存匿名 401。
- dev server 曾被 kill，已由主会话后台任务重启（端口 3030）。

### 2026-09-07 傍晚追加：「鼠标移入星盘黑屏」根因修复 + 全交互 12 项验收

- **根因（R3F v9.7 源码实证）**：指针坐标 = `offsetY ÷ state.size.height`（events chunk L16280）；size 一旦被布局瞬态污染成矮值（实测复现 518×15.5），`pointer.y` 爆到 ±32，SceneRig 视差倾角直接冲过 ±1.3 rad → 盘面转出视锥 = 用户看到的「黑屏+顶部一条横带」。污染高发窗口 = 事实卡开合的布局动画。
- **双层修复（astrology-wheel-scene.tsx）**：
  1. `SceneRig` 指针钳制：`state.pointer` 先 `clamp(-1,1)` 再参与倾角——size 再被污染旋转也不可能飞出（症状层防线，实测污染下 rx 稳锁 -0.005）。
  2. `SizeGuard` 升级：直接比对 R3F 内部 `state.size` 与容器布局盒（旧版只比 canvas CSS，`setSize` 不改 CSS 时漏检）；`setSize(w,h,top,left)` 补正 R3F v9 默认重置的 top/left；ResizeObserver 常驻 + 1s 心跳兜底（净变化为零的污染 RO 不触发）。
- **两条规则已入 DESIGN.md 6.4**：「指针驱动 3D 场景必须 clamp pointer」+ SizeGuard 必须比 state.size 且常驻监听。
- **完整交互验收 12/12 通过**（`/tmp/qa/accept-final.cjs`，用户真实视口 1138×900@2x + 移动 390×844@2x）：基线健康 / 悬停不黑屏 / 悬停浮中文名胶囊 / 鼠标点选开事实卡（太阳）/ Esc 关 / 键盘回车开（月亮）/ 点轮外空白取消 / 移出复位 / 移动端渲染+点按开卡。
- **验收套路沉淀**：宝珠命中定位别用 Html glyph 标签坐标（度数标签会误匹配），用「光标命中格扫描」（网格扫盘找 `body.cursor=pointer`）；「点空白取消」的真空白只有轮外四角——**整个黄道环扇区可点选该座内行星**（设计契约）；事实卡开合触发 layout 动画，截图/点击前必须重取 boundingBox。
- 复验基线：vitest 278/278 绿、eslint 净。本轮改动未提交，提交前必须问用户。

### 2026-09-17 追加：表单页预览星盘重新设计 = 修「浅色洗白」根因 + 接入星渊 3D 场景

- **起因**：用户在表单页框选右侧预览星盘要求「重新设计」。探针实测发现真 bug：同页两个 `AstrologyChartWheel` 实例（移动端横条 `xl:hidden` + 桌面预览）共用静态 defs id，`url(#acw-obsidian-stage)` 等全部解析到 display:none 实例，Chrome 不绘制 → 浅色主题盘心透明洗白（深色靠页面底色掩盖）。决定性验证：基底圆改纯色 lime 整盘变色 = 渐变引用全挂。
- **修复（astrology-chart-wheel.tsx）**：`useId()` 实例前缀 `gid()/orbId()/glowId()`，所有 defs id 与 `url(#…)` 引用改为实例唯一；规则已入 DESIGN.md 6.4。
- **重设计（astrology-form.tsx 桌面预览）**：接入 `AstrologyWheelSceneSwitch` —— 星渊 3D 场景接管（纯展示不传 onSelectBody），SVG 轮原地兜底；`AstrologyWheel3D parallax={wheelSceneOk !== true}` 防双重视差（同结果页口径）。移动端横条/未知档小轮保持 SVG（修复后浅色下正常深空盘）。
- **场景能力扩展（语义与 SVG 轮一致）**：`buildWheelSceneLayout(facts, planetOverrides?)` 支持黄经覆盖；`AstrologyWheelScene` 新增 `planetOverrides` prop；`PlanetOrb` 位移改为「阻尼基位 base ref + useFrame damp 3.2」——太阳滑向真实星座平滑移动、不瞬移，稳态即刻收敛不影响呼吸；非交互模式悬停不再显示手型光标。switch 透传 override。
- **验收**：vitest 278/278 绿、eslint 净、typecheck 仅预存 5 行旧错；截图：浅色/深色 3D 预览、6/15→双子座与 12/15→射手座太阳换位、未知档三实例共存、结果页悬停不黑屏 + 点选木星开事实卡回归通过。控制台仅预存匿名 401（/api/auth/refresh）。改动未提交，提交前必须问用户。

### 2026-09-17 追加：修「鼠标移入结果页星盘，整盘先放大又恢复」

- **症状**：悬停星体瞬间整盘瞬缩（视觉像先放大/跳一下），约 300-460ms 后被 SizeGuard 心跳拉回。
- **根因（三层探针实证）**：① `AstrologyWheel3D` 祖先层 `acw-wheel-float` 持续 3D 倾斜动画；② R3F 经 react-use-measure 以 `getBoundingClientRect` 测量容器——**gBCR 受 transform 透视压缩**，倾斜姿态下测得 402×389 脏值存入 RUM 状态（布局盒 425 全程不变，RO/window resize 均不触发，探针实测 0 事件）；③ CanvasImpl 的 `useIsomorphicLayoutEffect` **无依赖数组**（fiber esm L116），组件每次重渲染（悬停 `setHovered` 即触发）都 `configure({size: 脏值})` 重放 → canvas CSS+buffer 瞬缩。
- **修复（astrology-wheel-scene.tsx）**：Canvas `resize` 加 `offsetSize: true`（react-use-measure 2.1.7 支持，改读 offsetWidth/Height 布局值，transform 免疫，fiber 类型原生允许）；SizeGuard 注释更正（测量走 gBCR 非 contentRect），守卫保留为第二道防线。规则已入 DESIGN.md 6.4。
- **验收**：`repro-zoom.cjs` 58 采样 0 异常（修复前 8-9 个）；坏值 setSize 捕获 8→0；vitest 278/278、eslint 净；悬停 200ms 截图确认盘面稳定、tooltip 正常。改动未提交，提交前必须问用户。

## 一句话现状

星座寰宇 13 个工单 + 终验 code-review + 四轮视觉迭代（珠宝化 → 3D 舞台 → 悬浮天象仪 → **星渊 WebGL 深空星盘**）全部完成并截图验收，测试 278 全绿；**但内容层 100% 是本地确定性生成，没有接入豆包/DeepSeek，没有任何 API 路由，没有一次 LLM 调用。**

## 模型接入真相（用户最关心，已逐文件核实）

### 星座寰宇（astrology）—— 纯本地，零模型

- `grep astrology apps/web/src/app/api/` → 空，**无 API 路由**
- 内容层全部由本地模块生成（文件名 mock 指「不经服务端」，其中天文计算是真实算法）：
  - `apps/web/src/lib/astrology/mock-chart-facts.ts` — 真值层：行星黄经/星座/相位/宫位，真实天文算法（配合 `solar-longitude.ts`），锚点验证过（示例盘 1995-10-08 14:30 上海，太阳天秤 194.5°，上升水瓶 312.1°）
  - `apps/web/src/lib/astrology/mock-interpretation.ts` — 模板组装文案：`buildMockInterpretation`（主轴金句）/ `buildModuleReadings`（五模块）/ `buildWeeklyGuidance`（周运）/ `buildKeyAspects`（关键相位）
  - `apps/web/src/lib/astrology/mock-qa.ts` — 规则路由式问答 `answerAstrologyQuestion`（敏感拦截 + 事实引用 citations）
- 前端消费点：`astrology-result-view.tsx`（解读）、`astrology-qa.tsx`（问答）—— 接模型时只换这两个取数来源

> **T5 追记（星座寰宇 · 真实 API 接入，本节的三个 mock 模块已全部删除）**：真值改由服务端
> `lib/astrology/chart-engine.ts` 计算并经报告流 `app/api/destiny/astrology/report/route.ts` 下发；
> 解读改由 LLM 流式产出四分区；问答的敏感规则迁到服务端 `_lib/astrology-qa-safety.ts`。
> 本节「纯本地、零模型」的描述只反映当时状态，现行口径见 `docs/features/2026-09-19-constellation-real-api/feature.md`。

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
| 「星渊」WebGL 深空星盘（2026-09-07，本节顶部有专章） | ✅ 完成，含 SizeGuard 竞态修复与 path d 告警修复 |
| **git 提交** | 旧工作用户已自行提交（9/5 `5109b1d`）；星渊本轮改动未提交，提交前必须问用户 |

## 环境与工具链（坑都踩过，直接照做）

- dev server：后台任务 `bash-19fe1fav`（`cd apps/web && pnpm dev`），**端口 3030**；接手先 `lsof -nP -iTCP:3030 -sTCP:LISTEN` 确认无僵尸占口（旧会话残留会让 pnpm dev 静默退到 3032 跑旧代码）
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
