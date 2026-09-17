---
target: 星座寰宇 astrology 模块
total_score: 26
max_score: 32
na_heuristics: 7
p0_count: 0
p1_count: 4
target_identity: "file:/Users/weixiaoyu/Desktop/practice/AI-aggregation-other/ai-aggregation/apps/web/src/app/destiny/_components/astrology"
timestamp: 2026-09-17T16-03-53Z
slug: apps-web-src-app-destiny-components-astrology
---
# 星座寰宇 · Impeccable 全面排查报告

> **Method**: dual-agent（评估 A：设计评审 agent-3 · 评估 B：检测器 agent-4）+ 独立技术审计（agent-5）+ 主会话浏览器补查（移动端仿真点击通道证伪、暗色主题实测）
> **目标**: `apps/web/src/app/destiny/_components/astrology`（slug: `apps-web-src-app-destiny-components-astrology`）
> **日期**: 2026-09-18 ｜ **基准文档**: `PRODUCT.md`、`DESIGN.md`、`docs/designs/2026-07-26-constellation-universe-design.md`
> **范围**: 引导页 / 表单两步 / 仪式加载 / 结果页 / 深读区 / 分享与问答；桌面 + 窄屏移动布局；亮色 + 暗色主题
> **覆盖限制**: 仪式页 3.2s 过场未截图（播完即落结果页）；移动端触摸仿真通道点击事件不生效（工具限制，已用鼠标模式旁证），移动端事实卡抽屉实机交互未验证；URL 渲染态扫描仅覆盖引导页（结果页在表单流程后）

---

## 一、Design Health Score（Nielsen 启发式，评估 A）

| # | 启发式 | 分数 | 关键发现 |
|---|--------|------|----------|
| 1 | 系统状态可见性 | 4 | 四阶段进度主语「系统×3/AI×1」；时区确认条、太阳星座预览即时反馈 |
| 2 | 贴近真实世界语言 | 3 | 主轴/事实卡白话优秀；但表单步骤名「黄道历法基准/地平经纬校准」是术语墙 |
| 3 | 用户控制与自由 | 3 | 返回上一步、重新演算、事实卡可关可切；仪式 3.2s 不可跳过（可接受） |
| 4 | 一致性与标准 | 2 | 「了解计算方式」写「整宫制」与设计文档 §9.2 Placidus 口径冲突；副标题偏离基线文案 |
| 5 | 错误预防 | 4 | 城市必须精确选中、时间不默认推测值、约时稳定性校验 |
| 6 | 识别优于回忆 | 4 | 轮旁白话清单「每一颗星的白话位置都在这里」 |
| 7 | 灵活性与效率 | n/a | Experience 沉浸模式首跑流程，快捷键非目标（重归一化剔除） |
| 8 | 美学与极简 | 3 | 视觉完成度高；星空+3D 视差+WebGL+打字机+扫描光同页叠加，动效密度逼近上限 |
| 9 | 错误恢复 | 3 | 安静恢复卡「出生资料已保留」+ 双按钮（未实机触发） |
| 10 | 帮助与文档 | 3 | 「了解计算方式」抽屉存在且先讲可得后讲边界；但内容与真实口径不符 |
| **总分** | | **26/32（约 81%）** | **Good（良好）** |

## 二、Audit 技术健康分（评估 C）

| 维度 | 得分 | 关键发现 |
|------|------|----------|
| 无障碍 | 3/4 | 键盘漫游/aria-live 罕见地完整；浅色 11px slate-400 对比度约 2.5:1 系统性不达标 |
| 性能 | 2/4 | WebGL 场景 60fps 常驻（Bloom+MSAA，无 demand 帧循环）；34ms 打字机驱动整树重渲染；1s 心跳轮询常驻 |
| 主题化 | 3/4 | dark: 覆盖率高（result-view 152 处）；主 CTA 渐变在 7 个文件手工复制且已分叉 |
| 响应式 | 3/4 | 安全区/出血/断点规范；移动端事实卡星体切换按钮 28×28px |
| 实现完整性 | 3/4 | 无死代码、mock 边界清晰；但用户文案声称的 AI 能力不存在 |
| **总分** | **14/20** | **Good（良好）** |

## 三、设计特异性判定

**高特异性，为此产品而作。** 宇宙护照、星盘共享元素转场（`layoutId="astrology-wheel"`）、MiniClock 时段弧带钟面、太阳卡鎏金主角化、点选星体后「其余星体降 55% 透明度 + 相位提亮」的精密仪器交互——换一个产品无法原样复用。局部文案（「洞悉」「生命潜能」「宝珠」）向通用玄学产品语气滑落，是特异性唯一失血点。

## 四、检测器证据（评估 B，61 条确定性规则）

- **源码扫描**（astrology 目录）：**0 发现，干净**。旁证：对父目录重扫报出 37 条（全部来自八字/紫微/奇门文件），证明 0 是真实结果而非引擎失效。
- **URL 渲染态扫描**（桌面 78 条 / 移动 73 条）：因 `/destiny` 默认挂载八字模块且四工作区 CSS 隐藏常驻，命中多为全局 chrome 与八字表单。归属于 astrology 的 26 条（dark-glow ×24、pulsing-dot ×2）**逐条核实后全部为误报**——`#818cf8`/`#f59e0b` 等色值指纹精确对应 `astrology-starfield.tsx:190` 与 `astrology-wheel-3d.tsx:78-119` 的星环辉光，均属 DESIGN.md §2.2 白名单「命理夜幕辉光」令牌，且脉冲星点均带 `motion-reduce:animate-none` 降级。
- **真实但超出本次范围的发现**（记录在案，不计入本报告问题清单）：全局侧边栏 10px 导航文案、命理左 nav 玻璃底文字对比度 1.1-1.7:1、八字表单卡中套卡、`destiny-page-client.tsx:107,346` 对 padding-left 做布局属性过渡。
- **覆盖盲区**：astrology 工作区默认 `display:none`，像素级规则（低对比、文字尺寸）对其不生效——astrology 结果态的对比度未被检测器实际评估，该维度由人工审计（评估 C）补齐。

## 五、整体印象

这是一套完成度显著高于同类 AI 生成界面的作品：诚实性被编码进组件逻辑而非停留在宣言，读屏处理（打字机中间态不透传、落定一次性朗读）是业界罕见正确做法，WebGL 三级降级链堪称教科书。**最大的单一机会不在视觉而在「文案与实现的对齐」**：「真值先行」的立身之本正被两处超前话术（AI 声称、宫制口径）从内部侵蚀。其次是性能纪律——动效密度与常驻渲染正在透支移动端的续航与流畅度预算。

## 六、做得好的（值得保持）

1. **诚实性内嵌于代码**：无宫位时明示「不猜测、不补算」（`astrology-result-view.tsx:684-689`）；降级路径给「可看到/可解锁」双列而非置灰（`astrology-form-step2.tsx:388-417`）。
2. **事实卡 ⇄ 生活模块双向定位**，且处理了「展开动画落定后再滚动」的定位失效边角（`astrology-result-view.tsx:496-507`）。
3. **无障碍基础设施扎实**：深读标签页完整 tablist 漫游（`astrology-deep-dive.tsx:90-105`）、WebGL 场景方向键循环与 SVG 轮同契约、城市 combobox 全键盘导航、SVG defs id 唯一化（`useId`）。
4. **表单第 1 步「太阳已滑入双鱼座」占有感动效**是全程最聪明的情绪设计——填写成本即时兑换为「这是我的盘」。

## 七、优先问题（跨评估合成，按重要性排序）

### P1-1 用户可见文案声称的 AI 能力不存在（诚实性红线）
- **证据**: `astrology-ritual.tsx:56`「AI 解读请求已发出」——全链路无任何 AI 请求被发出（`buildMockInterpretation` 为本地确定性字典）；`astrology-entry-home.tsx:107`「解读由 AI 深度生成」。
- **影响**: 与产品「真值先行、严谨不虚构」的立身之本直接矛盾；仪式页内部「无虚假百分比」的纪律与这句话自相矛盾。
- **修复**: 接入真实 AI 前改为「系统正在基于星盘事实整理宇宙重点」；或在 mock 接缝后接入真实模型。
- **建议命令**: `$impeccable harden`

### P1-2 计算口径文案与设计文档/实现矛盾
- **证据**: `astrology-entry-home.tsx:301` 与 `astrology-result-view.tsx:598` 均写「整宫制」，设计文档 §9.2 规定 Placidus 默认、整宫制为高纬回退并需标注。
- **影响**: 深度用户核对口径时信任链断裂——恰是「经得起细看」承诺的核心受众。
- **修复**: 统一为「Placidus 宫制（高纬回退整宫制并标注）」，或修订设计文档。
- **建议命令**: `$impeccable clarify`

### P1-3 浅色模式次要文字对比度系统性不达标
- **证据**: `text-slate-400` 11px ×13+ 处（`astrology-result-view.tsx:285,313,657,727,843,1022`、`astrology-deep-dive.tsx:229,382,472,529`、`astrology-form-step1.tsx:248,316,320` 等），白底上约 2.5:1。暗色侧 night-faint ≈5.8:1 合格，问题集中在浅色。
- **影响**: 低视力用户与强光下移动端几乎不可读；WCAG 1.4.3 AA（4.5:1）违规。
- **修复**: 浅色次要文字收敛到 slate-500（≈4.6:1）并新增 `text-day-muted` 令牌回写 DESIGN.md。
- **建议命令**: `$impeccable colorize`

### P1-4 WebGL 星渊场景 60fps 常驻渲染，无节流无离屏暂停
- **证据**: `astrology-wheel-scene.tsx:1035-1077`（Canvas 无 `frameloop="demand"`，14 处 `useFrame`）；叠加 `astrology-wheel-scene.tsx:957` SizeGuard 1s 心跳常驻、`astrology-result-view.tsx:381-399` 打字机 34ms 驱动整树重渲染。
- **影响**: 结果页全程每帧重绘（Bloom + MSAA×4），滚出视口也不停；移动端中低端机持续耗电发热。
- **修复**: 静止期 `frameloop="demand"` + 交互时 `invalidate()`；IntersectionObserver 离屏暂停；打字机状态下沉为独立 `<TypewriterHeadline>` 组件；心跳降频或自愈后自动停止。
- **建议命令**: `$impeccable optimize`

### P2-1 引导页「一次一事」认知负荷失败：5 个竞争焦点
- **证据**: 首屏同时存在主 CTA、可交互示例盘（含「✨ 点击宝珠或星座探索」胶囊把它提升为显式任务）、三个价值徽章、时间未知提示、最近记录卡（`astrology-entry-home.tsx:133-139,226-257,262-280`）。
- **影响**: 稀释「3 秒内理解价值并点按钮」的引导页首要目标；桌面端 CTA 被价值卡压后（`xl:order-2`）。
- **修复**: CTA 提至价值卡之前；探索胶囊降级为被动提示（非按钮、移出盘面、改文案为「示例星盘 · 可点选星体体验」——同时满足 §6.2 要求的「示例星盘」标注，当前缺失）。
- **建议命令**: `$impeccable distill`

### P2-2 主 CTA 渐变按钮 7 处手工复制且已分叉
- **证据**: `astrology-workspace.tsx:145`、`astrology-entry-home.tsx:195`、`astrology-ritual.tsx:252`、`astrology-form-step1.tsx:307`、`astrology-qa.tsx:396`、`astrology-deep-dive.tsx:184` 等；entry-home 起始色为 `#3B5BDB`，其余为 `#4969E9`——漂移已发生。DESIGN.md:58 明令「不要另写渐变按钮」。
- **修复**: 收敛为共享 destiny 变体（`astrology-share-entry.tsx:10` 已有先例）。
- **建议命令**: `$impeccable distill`

### P2-3 移动端亚 44px 触控热区
- **证据**: 事实卡星体切换按钮 28×28px（`astrology-result-view.tsx:210-224`，该组件在 <xl 时以移动端抽屉呈现）；QA 引用片 min-h-7（`astrology-qa.tsx:305`）、模块事实片 min-h-8（`astrology-life-modules.tsx:295`）。
- **影响**: 违反 AGENTS.md 44×44 规范与 WCAG 2.5.8 意图，横排 10 颗星易误触。
- **建议命令**: `$impeccable adapt`

### P2-4 问答与表单的无障碍缺口
- **证据**: 问答消息列表无 `role="log"`/aria-live（`astrology-qa.tsx:276-350`）；入口按钮 `aria-expanded={false}` 硬编码（`astrology-qa.tsx:161`）；表单错误与输入无 `aria-invalid`/`aria-describedby` 关联（`astrology-form-step1.tsx:47-64`、`astrology-form-step2.tsx:431`）。
- **影响**: 读屏用户感知不到新回复；聚焦报错字段听不到「无效」状态。
- **建议命令**: `$impeccable polish`

### P2-5 文案偏离设计基线与品牌语气
- **证据**: 副标题实现为「洞悉你的性格底色、关系引力与生命潜能」（`astrology-entry-home.tsx:103-105`），设计文档 §6.2 指定「看懂你的性格底色、关系模式与本周行动」——「洞悉/生命潜能」是泛玄学承诺，丢掉了「本周行动」可行动卖点；「宝珠」「✨」与 PRODUCT.md「轻盈、克制、可信」不符。
- **建议命令**: `$impeccable clarify`

### P2-6 结果页主轴视觉重量失控（浅色模式尤甚）
- **证据**: `astrology-result-view.tsx:619` `clamp(40px,4vw,56px)` 大于引导页主标题 52px（层级倒挂）；琥珀金高亮按「第一个逗号」切分（:623），观察句多长金色就铺多长——浅色下 `#B47818` 大面积土黄与靛蓝星空色系冲突（暗色下 `#F3D17A` 实测观感良好）；窄屏实测主轴独占首屏，大三要素被挤出首屏。
- **修复**: 主轴压至 `clamp(30px,3.4vw,44px)`；高亮区间由 mock 解读库显式标注 4-8 字关键词，而非排版层猜逗号；段落间距 mt-12 收紧至 mt-8/10。
- **建议命令**: `$impeccable typeset` + `$impeccable layout`

### P3（高信噪比少量）
- mock 解读文案模板重复：月亮两条对冲相位白话逐字相同、深读区两张拱相卡练习建议相同（`lib/astrology/mock-interpretation.ts`）——冲击「具体而非空话」的成功标准。
- SVG 星体焦点反馈仅靠 1.15 倍缩放（`astrology-chart-wheel.tsx:937` `outline:none`）。
- 问答 520ms 模拟延迟 setTimeout 无清理（`astrology-qa.tsx:83-93`）。
- `querySelectorAll('.custom-scrollbar')` 命令式滚动复位重复两处（`astrology-result-view.tsx:370-373`、`astrology-ritual.tsx:161-163`）。
- 分享卡底栏 8-10px 低对比免责文字（`astrology-share-card.tsx:288-307`，海报导出场景可接受）。

## 八、用户画像红旗

- **Jordan（首次用户）**: 表单步骤名「黄道历法基准/地平经纬校准」是第一个人术语墙——前两秒好感被「这是不是很复杂」抵消。主轴与大三要素卡则出色完成「被击中」。
- **Casey（分心移动用户）**: ⚠️ 本次评审最大盲区。移动触摸仿真通道点击不生效（已用鼠标模式旁证分段控件本身无 bug），事实卡抽屉 `max-h-[82vh]` 的拇指可达性、与底部安全区间距**未实机验证**，需真机复查。
- **Sam（无障碍用户）**: 源码层面优秀（combobox 键盘导航、aria-live、焦点环）。残留风险：浅色琥珀金主轴大字 AA 余量不大；抽屉打开后焦点是否进入、Esc 是否关闭未实机测。

## 九、证伪记录（重要）

- **「移动端星座分段切换无响应」（评估 A 报告的 P1 候选）——证伪**。触摸仿真下整页所有点击（分段控件、底部导航链接）均不生效，窄屏鼠标模式下同一「星座」按钮点击正常切换。结论：仿真工具触摸通道限制，非应用 bug。移动端真机验证仍建议补做。

## 十、启发性问题

1. 当真值 3 秒算完、AI 解读 30 秒成为常态，仪式窗与打字机叠加后的真实等待是多少？仪式感预算是否应按「是否重算」差异化？
2. 示例盘可交互探索在引导页是加分还是分流？值得测一版「示例盘纯展示、CTA 唯一焦点」的对照。
3. 有没有可能让真值先行渲染（星盘轮+护照）与仪式清单同屏并行，把「等待 AI」变成「已经在看自己的盘」？

## 十一、Run Notes

- target slug: `apps-web-src-app-destiny-components-astrology`（critique-storage.mjs 生成）✅
- ignore list: 无（`.impeccable/critique/ignore.md` 不存在）
- 评估独立性: A（设计）/ B（检测器）隔离并行，A 全程未接触检测器输出；C（技术审计）独立第三代理 ✅
- CLI 检测器: 源码扫描 exit 0（0 发现）；URL 扫描桌面 exit 2（78）/ 移动 exit 2（73）✅
- 浏览器可视检查: 桌面全流程（评估 A）✅；窄屏布局 + 暗色主题（主会话实测）✅；移动触摸交互 ⚠️ 仿真通道故障，真机待查
- overlay 注入: 未尝试（回退信号：人工截图评审）；live server: 未启动（dev server 已存在）；临时文件: /tmp/impeccable-*.json 保留为扫描存档
- 遗留盲区: 移动端真机触摸交互、仪式页视觉帧、分享卡生成与星语问答实机交互、失败恢复卡触发
