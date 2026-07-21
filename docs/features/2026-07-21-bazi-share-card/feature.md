# 八字测算结果分享（一期：图片卡片）

> Feature ID: 2026-07-21-bazi-share-card ｜ Level: M ｜ Route: risk-minimal-m ｜ Outcome: verified

## 功能概述

八字结果页新增分享能力：一键生成 750×1334 竖版命盘卡片，可保存为 PNG 或调起系统分享，好友扫码即可进入 `/destiny` 测算自己的八字，形成传播闭环的第一环。

## 使用方式

1. 完成八字排盘（或从历史记录恢复完整报告）
2. 结果页头部点击「分享」→ 预览弹层查看完整卡片
3. 「保存图片」下载 PNG；移动端支持时显示「系统分享」直发微信/朋友圈

## 卡片内容（隐私白名单）

昵称、四柱干支（日主高亮）、一句话命盘钩子、人生五维相对指数、二维码（`/destiny` + UTM）。**不渲染**出生时间、出生地点、农历、性别、经纬度——在 `share-card-data.ts` 数据构建层物理剥离，渲染组件类型上无法触及。

## 设计决策

- **磨玻璃烘焙**：DOM→PNG 导出会丢失 `backdrop-filter`，玻璃感改用径向渐变光晕 + 半透明白面板 + 高光 hairline + 64×64 PNG 噪点（6.8KB）叠出，预览与导出像素级一致。卡片始终浅色，不受暗色模式影响。
- **数据同源**：五维指数复用结果页 `resolveLifeDimensionsForDisplay`，卡片数值与页面所见一致。
- **按需加载**：`qrcode`/`html-to-image` 动态 import，不进 destiny 主包。
- **入口守卫**：报告数据不完整（缺五维/四柱/钩子）时入口整体隐藏，不产生半成品卡片。

## 关键文件

| 文件 | 职责 |
|---|---|
| `apps/web/src/app/destiny/_components/share/share-card-data.ts` | 白名单数据构建、UTM 链接、昵称/文件名处理 |
| `apps/web/src/app/destiny/_components/share/bazi-share-card.tsx` | 卡片渲染（375×667 逻辑尺寸，×2 导出） |
| `apps/web/src/app/destiny/_components/share/bazi-share-entry.tsx` | 入口按钮 + 预览弹层 + 动作编排 |
| `apps/web/src/app/destiny/_components/share/use-share-image.ts` | DOM→PNG 导出、下载、系统分享 |
| `apps/web/src/app/destiny/_components/layout/destiny-shell.tsx` | 结果页头部入口接入 |

## 二期方向（需求文档已定，本次未做）

`/share/bazi?ref=…` 专属落地页与合盘引导、H5/小程序链接分享、埋点漏斗、视频/动图模板。

## 参考

- 需求：`docs/share_bazi/需求设计文档.md`
- 验证：`docs/reviews/2026-07-21-bazi-share-card-verification.md`（含导出图/移动端证据截图）
- 审查：`docs/reviews/2026-07-21-bazi-share-card-code-review.md`
- 过程记录：`docs/features/2026-07-21-bazi-share-card/dev-flow-process-log.md`
