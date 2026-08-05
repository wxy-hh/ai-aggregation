# 星座寰宇（Astrology）· 模块说明

> AI 命理大师的第四个同级模块：以出生时空确定性计算本命星盘真值，再由 AI 翻译成克制、可行动的个人洞察。
> 本目录为「星座寰宇」右侧内容区组件；壳层（系统导航/命理模块侧栏/页头）复用既有 destiny 结构，不重绘。

## 设计依据

- 流程/数据/计算/隐私唯一真相源：`docs/designs/2026-07-26-constellation-universe-design.md`
- 右侧内容区视觉状态：`docs/designs/2026-07-28-constellation-universe-visual-delivery-v3-1.md`
- 设计系统：`DESIGN.md`（玻璃拟态 / 柔光阴影 / 8px 网格 / 蓝—靛—紫—青 token / reduced-motion 降级）

## 真值先行架构

确定性计算在 `packages/astrology`（`@repo/astrology`），**不依赖大模型排盘**：

| 文件 | 职责 |
| --- | --- |
| `packages/astrology/src/time.ts` | 儒略日、GMST、UTC↔当地民用时（P0 固定 Asia/Shanghai） |
| `packages/astrology/src/ephemeris.ts` | 太阳/月亮/行星黄经（±0.1° 金样回归锚定）、逆行 |
| `packages/astrology/src/houses.ts` | 上升/天顶、Placidus 十二宫、Whole Sign 回退（极区/异常标注） |
| `packages/astrology/src/aspects.ts` | 五大相位（容许度冻结，`orbTableVersion` 标识） |
| `packages/astrology/src/stability.ts` | 约时/未知时间区间稳定性校验（≤4 分钟步长 + 容差） |

**事实层与 AI 解释层严格分离**：`chart-facts` 由计算域产出，AI 只解释给定真值；`apps/web/src/app/api/destiny/astrology/_lib/astrology-truth-guard.ts` 机械校验 AI 引用的事实必须命中真值层（且不引用 unstable/隐藏项）。

## API 流式协议

`POST /api/destiny/astrology/report`（SSE），事件顺序固定：

```
chart-facts → bigThree → headline → modules → transits → complete
```

- 真值完成即先渲染星盘骨架，再流式填充解读；解读超时可仅重试解读，不重算真值。
- 星语问答：`POST /api/destiny/astrology/qa`，每报告≤3 问，敏感话题安全拦截。

## 组件地图（本目录）

| 组件 | 职责 |
| --- | --- |
| `astrology-workspace.tsx` | 工作区编排：入口 → 表单 → 加载 → 结果/深度/问答/分享 |
| `astrology-input-form.tsx` | 两步出生资料表单（身份日期 → 时间地点） |
| `astrology-city-search.tsx` | 中国城市搜索（候选项必填，保证真值可复现） |
| `astrology-form-utils.ts` | 太阳星座预览、字段校验、时间精度/约时段常量 |
| `astrology-loading.tsx` | 真实四阶段加载页（系统×3 + AI×1） |
| `astrology-chart-canvas.tsx` | 星盘画布（共用渲染器，含宫位/无宫位两种形态） |
| `astrology-passport-header.tsx` | 宇宙护照头（精度/盘面范围标签 + 盘面依据） |
| `astrology-result-overview.tsx` | 结果总览（主轴/大三要素/五模块/行动三角） |
| `astrology-module-card.tsx` | 生活模块卡（可展开盘面依据） |
| `astrology-chart-wheel.tsx` | 交互星盘轮（点选 + 等价文本清单） |
| `astrology-aspects-panel.tsx` | 关键相位关系卡 |
| `astrology-qa-panel.tsx` | 星语问答面板（≤3 问、敏感拦截） |
| `astrology-share-card.tsx` | 脱敏分享卡 |
| `astrology-history.ts` | 统一历史记录载荷与脱敏 |
| `astrology-types.ts` | 领域类型 |

## P0 范围与诚实降级

- 三档时间精度：准确到分钟（含宫位）/ 大约时段（稳定性校验，不稳定降级）/ 完全未知（无宫位行星盘）。
- 未知时间不出现上升、天顶、十二宫与宫位解读，且**不以 12:00 或区间中点伪造单值**。
- P1 功能（宫位地图、完整近期星运、术语百科、双向索引）在 P0 不以 Tab/占位/禁用控件出现。

## 隐私

- 出生资料为高敏感个人数据；分享卡默认脱敏（仅昵称/匿名 + 核心要素 + 主轴 + 生成日期）。
- 历史列表与最近记录不显示生日、城市、精确时间与度数；删除在统一历史记录，结果页无删除入口。
