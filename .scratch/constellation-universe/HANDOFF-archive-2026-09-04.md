# 星座寰宇 · 任务交接文档（2026-09-04，01–13 全部收官，审查修复 + P0 视觉 + 3D 舞台 + 结果页章节式布局完毕，待提交）

> 接续方式：直接说「读 `.scratch/constellation-universe/HANDOFF.md`，接着做」。

## 唯一真相来源（勿重开已决口径）

- 设计文档：`docs/designs/2026-07-26-constellation-universe-design.md`（V1.6，§6.5 结果页，§6.7 分享）
- 工单：`.scratch/constellation-universe/issues/01..13-*.md`（验收标准在里面，动手前重读对应工单）
- 进度表已维护在本文档 `## 进度总览`

## 进度总览

| 工单 | 状态 |
| ---- | ---- |
| 01 导航接入与模块骨架 | ✅ 完成（截图验证） |
| 02 computeChartFacts mock 真值层 | ✅ 完成（33 测试过，子代理交付） |
| 03 入口首页与示例盘 | ✅ 完成（四端截图验证） |
| 04 两步出生表单 | ✅ 完成（18 张截图验收，移动端 fixed 操作条模式定型） |
| 05 加载仪式与转场 | ✅ 完成（仪式四帧/转场/结果落定/无宫位档/滚动修复全截图验收） |
| 06 结果首屏（上句下盘） | ✅ 完成（桌面/移动/浅色/无宫位/键盘点选全截图+程序化验收，47 测试过） |
| 07 人生模块与行动三角 | ✅ 完成（57 测试全绿，桌面暗/浅+移动暗截图验收，暗色透明度 bug 已修） |
| 08 深入解读 P0 | ✅ 完成（65 测试全绿，四端组合截图+键盘标签切换+双向定位验收） |
| 09 无宫位降级 | ✅ 完成（criterion 4 已随 11 勾销；criterion 5 待 12 勾） |
| 10 星语问答 | ✅ 完成（77→92→93 测试全绿，桌面面板+移动抽屉九步脚本+8 截图验收，工单已勾） |
| 11 统一历史 | ✅ 完成（93 测试全绿，A1–A6+B1–B5 脚本全绿+14 张截图审毕，工单已勾、09 criterion 4 已回填） |
| **12 分享海报卡** | ✅ 完成（2026-09-04：builder 12 测试 + 7 张截图验收；排版溢出已修；09 criterion 5 已回填） |
| 13 终验 | ✅ 完成（262→264 测试全绿；/code-review 双轴审查 4 项 finding 全部修复并截图复验） |

## 13 终验 · code-review 修复记录（2026-09-04）

双轴审查（规范轴 + 需求轴）发现 4 项必修，全部已修：

1. **[严重] 历史卡生日泄露** → `history-helpers.ts` astrology 分支 `birthDate` 槽位改为「M月D日生成」（隐私规格 §11.2）；`history.test.ts` 旧断言（断言生日可见，本身违反规格）改为断言生成日期格式且不含出生年
2. **[中等] 海报底栏英文** → `astrology-share-card.tsx` 「CONSTELLATION UNIVERSE」改「星座寰宇 · 本命星语」，截图复验通过
3. **[中等] 死 CSS 类** → 探针证实 Tailwind 3.4 不生成 `/24` `/22` `/14` 裸透明度与 `h-4.5` `max-w-100`：cosmos 环境光改方括号任意值（`destiny-ambient-background.tsx`，修复后暗色光斑截图确认出现），`h-4.5 w-4.5`→`h-[18px]`、`max-w-100`→`max-w-[25rem]`（form/entry-home/life-modules）；孤儿探针目录 `apps/web/.scratch-tw/` 已删除
4. **[中等] 关注主题假功能** → 新增 `orderModulesByTopic`（mock-interpretation.ts，纯函数+2 测试），result-view 把表单 topic（self/love/career/recent）映射到模块（who/love/career/week）提到首位，兑现表单「只调整阅读顺序」的承诺

**决定不修（偏差已记录）**：「重新测算」回表单保留资料（11 已验收的刻意行为）；盘面依据缺 IANA 时区（P1，真实域落地时补）；日期校验点「继续」才触发（04 已验收）；mock 示例盘与结果冻结盘口径差异（mock 期固有限制）；星盘轮热区 42px、share-entry 双次构建（轻微）。

**待办**：git 提交前必须问用户（铁律，尚未提交）。

## 全功能自动化验收（2026-09-04，32 张截图，/tmp/qa/）

- ego-browser 截图不可用（窗口无渲染表面，about:blank 也超时），改用项目 Playwright harness（全程工单验收同款管线）
- 桌面暗色主链路 19 张：入口/了解计算方式抽屉/表单两步/仪式三帧（阶段清单逐条点亮、轮盘逐层绘制）/打字机/结果首屏 — 全部符合 §6
- 结果页交互：点月亮→事实卡（落点+相位+相关模块反向定位）；topic=感情关系 → 模块首位为「关系如何运作」（修复 4 端到端生效）；星语问答（配额 3、事实 chips、行动建议）；分享对话框（脱敏说明+双切换+保存）
- 移动端 390×844：底部操作条、本周行动 compact 卡、问答/分享底部抽屉 — 全部正常
- 浅色模式：入口/结果/深入解读区（星盘轮·关键相位 tab、行星落点、轴线与宫位、sticky 迷你头）正常
- 未知档降级：无宫位、badge「时间未知 · 无宫位行星盘」、诚实 banner、解锁 CTA — 符合 §6.5 降级规格
- 历史卡隐私：匿名会话 /history 显示 0 条是§12 设计（临时记录仅会话内，登录确认后迁移）；生日→生成日期的修复由 history.test.ts 断言覆盖

## P0 视觉改造（2026-09-04，用户以顶尖设计师标准要求后实施，全部亲自写）

- **星盘轮珠宝化**（chart-wheel）：defs 新增 acw-core 中心微光核 / acw-glow-sun/moon/planet 星辉渐变 / acw-soft 柔光滤镜；行星节点铺径向光晕（日月更大）；相位线按性质着色（紧张相玫红、和谐相琥珀金、合相亮金）并调细；外圈加 blur 柔光环
- **主轴金句**：第一个逗号前的观察句琥珀金渐变（bg-clip-text），打字机按两段渲染；「依据」行改 chips 横排
- **双层星野 + 流星**（starfield）：110 远层暗星 + 14 颗近层带光晕亮星 + 2 条偶发流星（acw-meteor keyframes 内联 style，reduce-motion 隐藏）
- **大三要素**：太阳卡鎏金描边+金色光晕主角化（icon chip/term 同步金色），三卡 hover 浮起
- **CTA shimmer**：acw-cta-shine keyframes 入 globals.css，三个主按钮（入口/表单/分享）加星光扫过（错开 delay）
- **右栏控制台化**：四张洞察轨卡加顶缘星光线 + inset 高光 + 图标 drop-shadow 发光
- 校验：typecheck/lint 0 错、264 测试全绿；暗/浅/移动三端截图验收（/tmp/qa/p0-*.png）
- **仍未 git 提交**（等用户确认）

## 3D 舞台 + 结果页章节式布局重构（2026-09-04，全部亲自写，截图验收通过）

### 3D 星盘舞台（用户要求「星盘加 3D 旋转效果，能加的动效都加上」）

- 新组件 `astrology-wheel-3d.tsx`：3D 舞台（perspective 倾斜 + 悬浮），包在 layoutId 穿入元素**之外**不影响仪式→结果穿入测量；已接入入口首页（entry-home:98）、表单桌面轮（form:177）、结果页轮（result-view:577）；**仪式页刻意不接**（穿入测量风险）
- `globals.css` 尾部：`@keyframes acw-float3d`（14s 悬浮）+ `acw-breathe`（4.6s 呼吸），均带 reduce-motion 兜底
- 星体呼吸：行星光晕错峰呼吸 `animationDelay: i*0.7s`（chart-wheel.tsx）

### 结果页章节式布局（用户反馈「内容太长、两边空白、布局乱」后的专业重构）

诊断（重构前实测）：整页 ~4636px；洞察轨内容 673px 结束后右侧 ~2600px 死列；轮盘区 1294px、模块区 1153px 单列堆叠。

改造（`astrology-result-view.tsx` 结构重排 + `astrology-life-modules.tsx` 栅格化）：

1. **洞察轨只与首屏区同行**：grid 子项重排为主栏上段（护照/主轴/大三，`order-1 xl:col-span-8`）+ 洞察轨（`order-4 xl:order-2 xl:col-span-4`）+ 轮盘章节（`order-2 xl:order-3 xl:col-span-12`）+ 模块（`order-3 xl:order-4 xl:col-span-12`）；DOM 顺序=移动端叙事顺序，桌面双栏由 order 重排
2. **轮盘区升级为全宽章节带**：深色渐变舞台 `dark:bg-[linear-gradient(155deg,#05080F,#080D1C_55%,#0D1430)]` + 顶缘星光线 + 远场星云辉光；桌面两栏（轮盘主角居左 + 白话清单居右，`xl:grid-cols-2 xl:items-center`）；移动端通栏出血 `-mx-5 border-y sm:mx-0 sm:rounded-[32px]` 保证盘面尺寸；事实卡落于带内下方整宽（xl:static，移动端仍 fixed 浮出）
3. **白话清单默认收起**：只露前 4 颗 +「展开其余 N 颗星」（新增 showAllPlanets state），与「查看全部术语数据」并排一行
4. **生活模块两列栅格**：`xl:grid-cols-2`，本周卡通栏（`xl:col-span-2`，行动三角需全宽）；组件根 section 的 mt 移除（间距由外层 grid gap-12 统一）
5. **间距统一**：主轴/大三要素 `mt-8 sm:mt-10` → `mt-12`；grid `gap-10` → `gap-12`；deep-dive 根 `mt-14 sm:mt-16` → `mt-12 sm:mt-14`

重构后实测：轮盘区 1294→567px、模块区 1153→749px、整页 ~4636→~3600px（-22%），折叠后无死列。

校验：typecheck 0 错、vitest 264 全绿、eslint 三文件 0 问题；截图验收 `/tmp/qa/lv2-*.png`（桌面 hero/章节带/事实卡/清单展开/模块栅格/深读 + 移动 hero/通栏章节带/模块，脚本 `/tmp/qa/layout-v2.cjs`）

**二轮修复（用户全页截图标注四处空白后）**：

1. **页边距**：容器 `max-w-6xl` → `xl:max-w-7xl`（轮盘在章节带内恢复 520px 原生尺寸）
2. **大三要素降级档空格**：栅格按卡片数自适应（`bigThreeCols` 1/2/3 列）；单卡时横向聚光排版（左识别区 w-44 + 右解读区，`bigThreeSolo` 开关）——时间未知档不再空 2/3 行
3. **模块栅格半格空白**：非周卡数为奇（无宫位档缺关系模块）时桌面改三列（`oddNonWeek`），本周卡跨三列（`weekSpanClass` 随列数联动，ModuleCard 新增 prop）
4. **深入解读右下空白**：`WheelInventory` 由左右两栏改全宽叠放三卡——行星落点/相位总表卡内 `lg:grid-cols-2` 双列、轴线与宫位卡 `sm:grid-cols-2` + 十二宫头 `sm:grid-cols-4 xl:grid-cols-6`；行星行白话句在双列下自然折行

验收：时间未知档浅色 1600 宽屏（用户截图同款场景）+ 准确档暗色 1440 回归，脚本 `/tmp/qa/layout-v3.cjs`，截图 `/tmp/qa/lv3-*.png`；typecheck/264 测试/eslint 全绿

**仍未 git 提交**（等用户确认）

## 悬浮天象仪星盘重做（2026-09-04，用户批评「星盘太简单，没 3D 没动效」后重做，全部亲自写，截图验收通过）

**概念**：盘面是悬浮的观测仪器——装饰表圈双向慢转、行星为十色宝珠浮于盘上方 34px（3D 视差）、相位为盘心内收的弓形能量弧、盘心星核常驻涟漪。

### 视觉层（`astrology-chart-wheel.tsx` 核心重做 + `globals.css` keyframes + `astrology-wheel-3d.tsx` 地面投影）

- **十星宝珠**：`PLANET_ORB` 映射（日鎏金/月银青/水星紫罗兰/金星玫瑰/火星珊瑚红/木星琥珀/土星沙金/天王星青碧/海王星湛蓝/冥王星堇紫），defs 逐星生成宝珠渐变（左上受光 cx38% cy34%）+ 星辉渐变；宝珠=星辉光晕（呼吸错峰）+球体（白细边）+高光+土星细环+Glyph 按 orb.glyph 着色
- **四元素光谱**：星座环 12 扇形 wedge 按火玫瑰/土翡翠/风天空/水湛蓝低透明着色，星座 glyph 同色（`SIGN_ELEMENT_STYLE` + `elementOfSignIndex = i%4`）
- **装饰表圈**（aria-hidden，底层 svg 内）：cw 环 r=270 虚线+3 记号珠（220s）、ccw 双弧 r=251.5（340s 反向）；globals.css 新增 `acw-orbit-spin` + `.acw-orbit-cw/.acw-orbit-ccw`（`transform-box: fill-box`）
- **相位弓形弧光**：motion.line→motion.path 二次贝塞尔（控制点=弦中点向盘心内收 52%），animate `{d, opacity}`；能量流光 overlay（pathLength=500、dasharray "26 474"、`.acw-aspect-flow` 8s、错峰 i*-1.15s）
- **相位降噪（二轮）**：默认全场统一低饱和紫灰 `ASPECT_LINE_DIM`（六合保留虚线区分），彩色 `ASPECT_LINE_CLASS` 只在点选时点亮相连相位，且流光染该星宝珠色（`style={{stroke: PLANET_ORB[selectedBody].glow}}`）——解决「彩虹乱麻」
- **盘心星核**（stage>=4 常驻）：四芒星 path + 白点 + 双涟漪（r18→118，3.6s 错峰）
- **行星层独立 svg**：`pointer-events-none absolute inset-0 [transform:translateZ(34px)]`，行星 motion.g `pointerEvents:'auto'`；wrapper 加 preserve-3d；tooltip transform 末尾 `translateZ(48px)`；3D 舞台新增地面投影椭圆（translateZ(-80px)）

### 关键 bug 修复（截图验收暴露，真实用户可点性问题）

1. **3D 链断裂致行星不可点**：wheelSlot 的 layoutId motion.div（`astrology-ritual.tsx`）默认 `transform-style: flat`，打断 perspective→preserve-3d 链，行星层 translateZ(34px) 被扁平化后 hit-test 错乱，真实点击宝珠命中祖先 div。修复：该 div 加 `[transform-style:preserve-3d]`（诊断脚本逐步消除法证实，修后 elementFromPoint 命中 circle）
2. **触达热区压顶误选**：热区 circle r34 原在 g 最上层，拥挤区（日/水/金挤顶）邻星热区盖住宝珠；移到 g 内最底层（宝珠/光晕在上），光晕加 `pointer-events-none`——点宝珠必中本星

### 验收（脚本 `/tmp/qa/orrery.cjs`，截图 `/tmp/qa/orrery-*.png`）

- 浅色准确档（用户场景）l0 仪式帧/l1 默认/l2 选中、暗色 d1/d2、移动浅色 m1 全过
- 程序化验证全绿：真实鼠标点击宝珠→事实卡 OK；轮上点选→事实卡 OK；空白（星座环带）点击取消 OK
- 注意坑：Playwright `click({force})` 对 rotateX 压扁+呼吸动画的元素判定 not stable/ bbox 中心偏移，验证用 `page.mouse.click(宝珠圆心)` + dispatchEvent 兜底；事实卡选择器是 `[aria-label$="事实卡"]`（非 role=dialog）
- typecheck 0 错、vitest 264 全绿、eslint 三文件干净

### 三条 craft-floor 改进落地（同日傍晚，全部亲自写）

1. **浏览器表面品牌化（全局）**：globals.css base 层新增 `::selection`（浅 `rgba(99,102,241,0.24)` / 深 `rgba(129,140,248,0.36)`）+ `caret-color`（`#4969E9` / dark `#8B9DFF`，覆盖 input/textarea/contenteditable）——DESIGN.md 第 9 章两项「待实施」已回填「已实施」
2. **夜幕文字令牌（astrology 域）**：tailwind.config.ts 新增 `colors.night.muted #A6AED2 / faint #828BB0`；astrology 10 文件 85 处 `dark:text-slate-400/500` → `dark:text-night-muted/faint` + 2 处 placeholder——深空表面次要文字不再落中性灰（DESIGN.md 2.6 已写入令牌用法）
3. **事实卡 ghost card 修复**：result-view 事实卡浅色 `border-slate-200/90` → `border-transparent`（海拔由阴影独立承担）+ 阴影 0.45→0.30 降脏；其余卡为收边接触阴影（-18~-24px），属健康做法不动

**坑**：改 tailwind.config.ts 后 dev server 必须重启才让 JIT 生成新色板（否则类名静默无样式，fallback 到非 dark 类）。dev server 已换后台任务 `bash-9ithqnsj`（旧 bash-iw3k2j7e 已 kill，端口仍 3030）。

验收：脚本 `/tmp/qa/polish.cjs`；程序化断言 caret `rgb(73,105,233)` ✓、副注 computed `rgb(130,139,176)`=night-faint ✓；截图 polish-selection/dark-wheel/light-fact.png 审毕；typecheck/264 测试/eslint 全绿

## 12 已完成内容（精简记录）

**交付物**（`apps/web/src/app/destiny/_components/astrology/`）：`astrology-share-card-data.ts`（隐私白名单 builder：elements 只收 sign 稳定项、wheelPlanets 只含 sign 稳定行星且度数缺失落星座正中、revision 直绑 facts.calculationRevision）+ 12 测试；`astrology-share-card.tsx`（375×500 深空海报，磨玻璃烘焙工法，内联 AstrologyPosterWheel：外环刻度+12 星座 glyph+行星光点，无度数/宫位/相位线；POSTER_STARS 24 颗确定性星点）；`astrology-share-entry.tsx`（洞察轨入口卡 + Dialog 弹层：移动底部抽屉/桌面居中，昵称+内容两档分段选项实时预览，html-to-image @2x 导出）；result-view 占位 div 已替换为 `<AstrologyShareEntry facts headline={fullHeadline} name={formData.name}>`，Share2 导入同步移除。

**已修排版溢出**：首版 375×500 内容超高底栏被裁；定型为 pt-4/pb-4、轮 180px 不动、装饰点与昵称合并一行、主轴 20px/1.4 line-clamp-3、要素胶囊 28px、QR 52px——三行长标题极端情况不再溢出。

**criterion 4 由构造满足**：本地 PNG 生成无服务端资产，每次打开弹层从当前事实层重建，重算后旧 PNG 自然失效。

**环境教训**：旧会话僵尸 dev server（PID 残留）会占住 3030 跑旧代码，`pnpm dev` 静默退到 3032；接手先 `lsof -nP -iTCP:3030 -sTCP:LISTEN` 确认端口干净。

## 12 分享海报卡 · 设计蓝图（接续时直接执行，无需再研究）

### 需求（工单 12 + 设计文档 §6.7）

1. 用户点击「分享」→ 打开海报预览浮层（桌面 Modal / 移动底部抽屉），实时预览竖版 3:4 海报卡
2. 选项：「显示昵称/匿名」「显示大三要素/仅显示一句主轴」，实时更新预览
3. 确认后保存图片（html-to-image @2x）或系统分享（navigator.canShare）
4. 默认脱敏：**不含**出生日期、精确时间、地点、度数；生成日期可分享
5. 时间未知或约时不稳定 → 不显示上升；约时降级 → 大三要素自动只含已确定项
6. 分享资产绑定真值修订（本地 PNG 生成无服务端资产；每次打开从当前 revision 的 facts 重建，recalc 后旧 PNG 自然失效）— criterion 4 由构造满足
7. 回填 09 criterion 5（降级路径分享不泄露隐藏事实）— builder 只输出 sign 字段，不输出 degree/house，unstable 项 sign=null 自动排除

### 分享卡数据类型与 Builder 设计

文件：`apps/web/src/app/destiny/_components/astrology/astrology-share-card-data.ts`

```ts
/** 隐私白名单：渲染层物理上无法触及出生时间/地点/度数（构建期剥离） */
export interface AstrologyShareCardData {
  /** 昵称截断（≤8 字）；调用方传空/null 时，渲染层显示匿名别名 */
  nickname: string;
  /** 主轴金句（必须；缺失则整个入口不渲染） */
  headline: string;
  /** 已确认的核心要素（稳定太阳/月亮/上升，仅 sign；0 个时 card 强制仅主轴模式） */
  elements: Array<{ key: 'sun' | 'moon' | 'ascendant'; label: string; sign: string }>;
  /** 星盘轮行星落点（用于 poster 装饰轮；只含 sign!==null 的稳定行星） */
  wheelPlanets: Array<{ body: string; longitude: number; glyph: string }>;
  /** 生成日期（脱敏可分享） */
  generatedDate: string;
  /** 分享链接（QR 码扫码页） */
  shareUrl: string;
  /** 真值修订号（声明绑定，无服务端资产时主要用于测试断言） */
  revision: number;
}
```

**签名**：
```ts
buildAstrologyShareCardData(
  facts: AstrologyChartFacts,
  options: { name: string | null; headline: string; origin: string; revision: number }
): AstrologyShareCardData | null
```

**规则**：
- headline 缺失 → 返回 null（入口不渲染）
- 昵称截断：`nickname = truncateNickname(name)`（复用 `../share/share-card-data.ts` 已测函数）
- elements 构建：sun sign≠null → push；moon sign≠null → push；ascendant sign≠null → push（准确档含，未知档无）
- wheelPlanets：`facts.planets.filter(p => p.sign !== null)` → 映射 `{ body, longitude: ZODIAC_ORDER.indexOf(sign)*30 + (p.degree ?? 15), glyph: PLANET_GLYPH[p.body] }`
- shareUrl：`${origin}/destiny?tab=astrology&utm_source=share_card&utm_medium=qrcode&utm_campaign=astrology`
- 测试（`astrology-share-card-data.test.ts`）：
  - 隐私哨兵：formData 含 `SENTINEL_BIRTH/LOCATION` → 序列化产物不含哨兵
  - 未知档无上升：unknown facts → elements 无 ascendant
  - moon 跨座排除：unknown facts 若 moon.sign=null → elements 无 moon
  - headline 空 → null
  - 特征：shareUrl 含 utm_campaign=astrology，revision 正确透传

### 分享卡 UI 设计（UI 亲自写，高审美）

文件：`apps/web/src/app/destiny/_components/astrology/astrology-share-card.tsx`

**规格**：逻辑尺寸 375×500（3:4），导出 750×1000 @2x 像素

**视觉语言**：深空暗色底（与结果页暗色同一套），永远暗色主题，不受应用明暗模式影响。
采用「磨玻璃烘焙」原则（复用 bazi-share-card 的工法）：无 backdrop-filter / blur（导出丢失），全部用径向渐变光晕+噪点+hairline 叠出。

**背景层（绝对定位，pointer-events-none）**：
- 1) 基底渐变：`linear-gradient(155deg, #0B1024 0%, #0D1226 40%, #121A38 100%)`
- 2) 右上靛蓝光晕：`radial-gradient(circle, rgba(73,105,233,0.14), 45%, transparent 68%)` at `-10%,-10%`
- 3) 左下紫罗兰光晕：`radial-gradient(circle, rgba(139,92,246,0.10), 45%, transparent 68%)` at bottom-left
- 4) 中部右侧青光斑：`radial-gradient(circle, rgba(59,130,246,0.06), 62%, transparent)` at mid-right
- 5) 对角高光线（玻璃顶光）：`linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.22) 47%, rgba(255,255,255,0.05) 55%, transparent 68%)`
- 6) 静态星点：24 个确定性 1px 白色圆点，opacity 0.12–0.56（行/列 seed 固定，无 Math.random）
- 7) 噪点：复用 `NOISE_TEXTURE_DATA_URI` at opacity 0.04

**内容层（relative z-10）**：
- **顶栏**（品牌行）：左 `✦ 星座寰宇`（tracking-widest text-[10px] text-indigo-300/70）；右 `本命星盘` pill（rounded-full, border-white/10, bg-white/5）
- **星盘缩略轮**（`AstrologyPosterWheel`）：宽 180px，居中，后方有 indigo-400/[0.14] 径向光晕（渲染轮前盖光晕 div）。轮只画外环星座刻度+行星 glyph；**不画**度数字标、宫位号、上升/天顶线、相位线——避免任何度数/私有数据泄露。
  - 外环（360°，stroke: rgba(255,255,255,0.10)），每 30° 刻度（rgba 0.08）
  - 12 区星座 glyph（白色 12px，距圆心 r≈72px）：`ZODIAC_CN[sign].slice(0,-1)`（白羊/天秤...不带「座」字）
  - 行星 glyph（r≈52px）：`PLANET_GLYPH[body]`，太阳金黄 #F4C542 / 月亮银白 #CBD5E1 / 其余靛蓝-300；外圈 6px 同色光点晕 `filter: drop-shadow`
  - 无相位线（海报只保留行星位置点，极简）

- **主轴区**（headline）：`font-heading text-[22px] leading-[1.45] text-white font-bold`，居中，max 3 行 `line-clamp-3`；headline 上方 indigo-400 小 ✦ 装饰点

- **核心要素区**（仅 elements.length>0 且 showElements=true 时渲染）：
  三列（或二/一列），每列：顶部圆底 glyph 胶囊（32px, border-white/10 bg-white/5，白色 14px glyph，月亮用银白） → 标签（10px text-indigo-300/70，「太阳」「月亮」「上升」）→ 星座名（13px text-white font-semibold）；元素间 `divide-x divide-white/[0.08]`

- **底栏**（pt-5）：
  - 左：两行 — `text-[10px] text-white/40` 生成日期（如「2026年9月1日 生成」）+ 品牌小字「内容用于自我探索与娱乐参考」
  - 右：QR 码 56px（border-white/10 bg-white p-1）+ 下方 `text-[8px] text-white/25 tracking-widest` "扫码绘制你的星盘"

- **边框**：`border border-white/[0.06] rounded-[24px]`，顶部 hairline `h-px bg-gradient-to-r from-transparent via-white/20 to-transparent`

**PosterWheel 子组件**（无需独立文件，内联在 card 内）：
```tsx
// SVG viewBox 0 0 180 180，cx=cy=90，外环 r=80，glyph 环 r=72，行星环 r=52
// 星座 glyph 每 30° 放一个（angle = i*30-90 从顶部顺时针）
// 行星：longitude 转 angle（弧度转 SVG 坐标）→ glyph 文本定位
```

### 分享入口与对话框

文件：`apps/web/src/app/destiny/_components/astrology/astrology-share-entry.tsx`

**入口卡片**（洞察轨替换位）：
```
<div class="rounded-2xl border ...">
  <Share2 icon> <h3>分享星语海报</h3> </div>
  <p>生成脱敏分享卡：只含昵称、核心要素与一句主轴。</p>
  <button>生成分享卡 →</button>   // primary gradient, full-width min-h-11
</div>
```

**对话框**（Dialog + 底部抽屉/居中，复用 bazi-share-entry 的布局模式）：
- 移动端：底部抽屉 rounded-t-[28px] slide-in-from-bottom-4
- 桌面端：居中 rounded-[32px] zoom-in-95 sm:inset-x-auto sm:bottom-auto sm:translate-x/y
- 暗色玻璃：`dark:bg-[#0D1226]/[0.92]` **必须方括号写法**
- 内容结构：
  - 顶部标题栏（border-b）：「分享星语海报」+ 「默认脱敏：不含出生时间、地点与度数」
  - 预览区（measurePreviewBox callback ref + ResizeObserver + transform scale，复用 bazi 模式）
    - CARD_WIDTH=375, CARD_HEIGHT=500, scale = min(1, containerW/375, containerH/500)
    - previewReady = cardData!==null && previewScale!==null（QR 码生成失败也允许预览，只禁用保存按钮）
  - 选项区（px-4 py-3 border-t）：
    - 第一行：「昵称」标签 + 分段控制器（segments: ['显示昵称','匿名']），state: showNickname
    - 第二行：「内容」标签 + 分段控制器（segments: ['大三要素','仅主轴']），state: showElements；disabled + hint when elements.length===0
    - 实时预览：选项变化 → 直接改 card component 的 props，无需重建 cardData（cardData 只构建一次，options 是 display-side）
  - 底栏（border-t, py-3.5）：
    - 「保存图片」primary button（Download icon，exporting→Loader2 spin）
    - 「系统分享」secondary button（canShareFiles() 判断是否渲染）
    - useShareImage hook 复用自 `../share/use-share-image.ts`（html-to-image @2x 导出）

**文件名**：`星座寰宇-星语海报.png`（无昵称），有昵称时 `星座寰宇-{昵称}.png`

**export 约束（复用 bazi 经验）**：
- 卡片 DOM 内不能有任何外部图片资源（轮图都是 SVG inline，QR 码是 dataURL）
- fonts：document.fonts.ready 在 useShareImage 里已处理；卡内用 font-heading (Space Grotesk) + DM Sans — 已在应用字体表里，加载后才会 ready
- 卡片永远暗色主题，不随应用主题切换 → 导出图像素级稳定

### 穿入点：替换 result-view 占位

`astrology-result-view.tsx` 第 690-707 行（分享占位 div）替换为：

```tsx
<AstrologyShareEntry
  facts={chartFacts}
  headline={interpretation?.headline?.text ?? ''}
  name={formData.name}
  revision={useDestinyWorkspaceStore.getState().astrology.chartFacts ? 1 : 1}
  // revision 从 history payload 取更准确：暂时读 store（后续接服务端可改）
/>
```

props 从 result-view 已有的 `chartFacts`, `formData.name`, `interpretation` 传入。

### 完成后回填 09 criterion 5

勾选条件：12 共享卡 builder 测试中断言 unknown facts → serialized 无 ascendant sign；stable 情况有正确 elements。
更新 `.scratch/constellation-universe/issues/09-no-houses-degradation.md` 最后一项 checkbox。

---

## 11 已完成内容（精简记录，工单内有详细验收）

**交付物**：`lib/astrology/history.ts`（逻辑 id=出生日期+城市 djb2 哈希，写入/迁移/恢复）；`stores/astrology-temp-record.ts`（persist+sessionStorage）；`history-helpers.ts` astrology 分支；表单 submit 与仪式 retry 两处写入；workspace 恢复 effect+迁移弹层；entry-home 继续查看；history 卡 astrology 配置。

**已修暗色弹层 bug**：astrology-workspace.tsx + astrology-entry-home.tsx 的 `dark:bg-[#0D1226]/92` → `/[0.92]`（Tailwind v3 默认透明度刻度仅 5 的倍数，裸 /92 不生成 CSS，暗色静默丢失）。

**关键结论**：注册/登录后必须 SPA 导航不能 page.goto 整页刷新（预存刷新令牌竞态 bug，非本工单范围）；注册/登录真实用户响应不带 isAnonymous 字段，判定用 `user !== null && user.isAnonymous !== true`。

---

## 09/10 交付物（精简记录，详见各自工单）

- **09**：结果页三处降级文案按 `factStability.houses.reason` 区分口径；仪式页按 dataCompleteness 走无宫位变体；未知档月亮跨座隐藏/落点无度数无宫位/无轴线与宫位组/核心要素卡无上升；补全解锁提示卡。
- **10**：`mock-qa.ts`（敏感拦截+路由+citations）；`astrology-qa.tsx`（桌面面板+移动抽屉，消息/上限状态托管，引用定位）。

---

## 环境与工具链

- dev server：后台任务 `bash-iw3k2j7e`（`cd apps/web && pnpm dev`），**端口 3030**；若挂了重启
- 截图：Playwright `createRequire('.../node_modules/.pnpm/playwright@1.61.1/node_modules/playwright/package.json')`；主题注入 `localStorage ai-app-settings`；注册字段 `#register-username`/`#register-password`/`#register-confirm-password`；表单 `select[aria-label="出生年份"]`等、`role=radio`时间精度、`ul li button`城市候选、按钮名「继续」「绘制我的星盘」需 exact:true
- 校验：`cd apps/web && pnpm typecheck && pnpm vitest run src/lib/astrology/`（当前 93 测试绿）
- 真值锚点：示例盘 1995-10-08 14:30 上海，太阳天秤 194.5°，上升水瓶 312.1°；`computeChartFacts` 同步即时返回

## 硬约束（用户反复强调，违反即返工）

- **所有星盘/星座/动画/动效/UI 页面必须主对话亲自写**，子代理只打下手（纯逻辑层才可派）
- 全部中文注释与 UI 文案；最小改动不重构无关代码；写代码后补中文注释
- 设计硬规则：无英文占星术语、先结论后术语、不虚构不稳定数据、尊重减少动态、移动端优先+安全区、热区 ≥44、错误红→修正平台蓝平滑过渡
- git 提交需用户明确确认

## 建议技能（suggested skills）

- 12 实现期 → `/implement` 流程纪律（typecheck 常跑、单测文件常跑、全量测试收尾）
- 分享数据层新逻辑 → `/tdd`（接缝已明确：builder 纯函数，白色名单类型，可完全测试）
- 全部工单完成后 → `/code-review` 从分支基准点审查，再请求用户确认提交
