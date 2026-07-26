# AI 命理大师 · 星座寰宇模块视觉交付附录（V3）

本附录配套《AI 命理大师 · 星座寰宇模块设计文档》。它替换此前所有将桌面端和移动端拼在一张画板的方案：**每个状态都提供独立的桌面端图和独立的移动端图**，可直接对照开发。

## 0. 已确认的系统边界

- **产品容器**：AI 聚合工作台 → AI 命理大师；“星座寰宇”只是在“命理分析类别”中的第四项，固定排在“奇门遁甲演化”之后。
- **桌面端壳层**：保留当前 AI STUDIO 全局工具栏；进入 AI 命理大师后保留二级模块栏，四项依次为八字格局精批、紫微斗数排盘、奇门遁甲演化、星座寰宇。
- **移动端壳层**：保留现有“AI 命理大师 / AI 聚合工作台”页头、四分段“八字 / 紫微 / 奇门 / 星座”切换及底部“首页 / 对话 / 图像 / 语音 / 更多”全局导航。
- **历史与删除**：测算结果页只提供阅读、问星语、分享和重新测算；不提供删除、个人档案、收藏、报告中心或我的报告。查看与删除只发生在现有统一“历史记录”。
- **视觉规则**：外层导航和焦点容器使用 DESIGN.md 的 G-2/G-3 磨砂玻璃；表单、长文本、卡片主体保持高对比实体底；遵守 8px 网格、44px 点击热区与移动端安全区。

## 1. 视觉资产总览

| 流程状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 模块入口 | [查看](./2026-07-26-constellation-universe-desktop-entry-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-entry-v3.png) |
| 基本资料 1/2 | [查看](./2026-07-26-constellation-universe-desktop-birth-profile-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-birth-profile-v3.png) |
| 出生时空 2/2 | [查看](./2026-07-26-constellation-universe-desktop-birth-time-place-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-birth-time-place-v3.png) |
| 时间未知 | [查看](./2026-07-26-constellation-universe-desktop-unknown-time-input-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-unknown-time-input-v3.png) |
| 表单校验 | [查看](./2026-07-26-constellation-universe-desktop-form-validation-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-form-validation-v3.png) |
| 星盘校准加载 | [查看](./2026-07-26-constellation-universe-desktop-loading-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-loading-v3.png) |
| 加载失败恢复 | [查看](./2026-07-26-constellation-universe-desktop-loading-error-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-loading-error-v3.png) |
| 完整本命盘总览 | [查看](./2026-07-26-constellation-universe-desktop-result-overview-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-result-overview-v3.png) |
| 无宫位结果 | [查看](./2026-07-26-constellation-universe-desktop-unknown-time-result-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-unknown-time-result-v3.png) |
| 星盘轮 | [查看](./2026-07-26-constellation-universe-desktop-chart-tab-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-chart-tab-v3.png) |
| 关键相位 | [查看](./2026-07-26-constellation-universe-desktop-aspects-tab-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-aspects-tab-v3.png) |
| 宫位地图 | [查看](./2026-07-26-constellation-universe-desktop-palace-map-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-palace-map-v3.png) |
| 近期星运 | [查看](./2026-07-26-constellation-universe-desktop-transit-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-transit-v3.png) |
| 术语百科 | [查看](./2026-07-26-constellation-universe-desktop-glossary-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-glossary-v3.png) |
| 星语问答 | [查看](./2026-07-26-constellation-universe-desktop-qa-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-qa-v3.png) |
| 分享卡生成完成 | [查看](./2026-07-26-constellation-universe-desktop-share-success-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-share-success-v3.png) |
| 统一历史记录删除确认 | [查看](./2026-07-26-constellation-universe-desktop-history-delete-v3.png) | [查看](./2026-07-26-constellation-universe-mobile-history-delete-v3.png) |

## 6.1 模块入口

唯一入口是“填写出生资料”。桌面端在 AI 命理大师二级栏中激活第四项“星座寰宇”；移动端在顶部四分段中激活“星座”。两端都不新建系统名、侧边栏或模式选择。

| 桌面端 | 移动端 |
| --- | --- |
| ![桌面端星座模块入口](./2026-07-26-constellation-universe-desktop-entry-v3.png) | ![移动端星座模块入口](./2026-07-26-constellation-universe-mobile-entry-v3.png) |

## 6.3 出生资料输入

### 6.3.1 基本资料 1/2

昵称只用于本次结果称呼；阳历生日为必填；关注主题只影响结果排序，不改写星盘事实。

| 桌面端 | 移动端 |
| --- | --- |
| ![桌面端基本资料](./2026-07-26-constellation-universe-desktop-birth-profile-v3.png) | ![移动端基本资料](./2026-07-26-constellation-universe-mobile-birth-profile-v3.png) |

### 6.3.2 出生时空 2/2

城市必须从候选中精确选中并确认 IANA 时区；桌面端在内容区左右组织，移动端用单列和固定安全区主按钮。

| 桌面端 | 移动端 |
| --- | --- |
| ![桌面端出生时空](./2026-07-26-constellation-universe-desktop-birth-time-place-v3.png) | ![移动端出生时空](./2026-07-26-constellation-universe-mobile-birth-time-place-v3.png) |

### 6.3.3 出生时间未知与表单校验

时间未知是同一流程中的精度降级，不是第二种产品。日期非法或城市模糊时使用字段内联提示，阻止无效真值计算。

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 时间未知 | ![桌面端时间未知](./2026-07-26-constellation-universe-desktop-unknown-time-input-v3.png) | ![移动端时间未知](./2026-07-26-constellation-universe-mobile-unknown-time-input-v3.png) |
| 表单校验 | ![桌面端表单校验](./2026-07-26-constellation-universe-desktop-form-validation-v3.png) | ![移动端表单校验](./2026-07-26-constellation-universe-mobile-form-validation-v3.png) |

## 6.4 星盘校准与异常恢复

加载仅反映真实计算事件，不制造百分比。失败时保存已填资料并提供重试或修改，不能跳转到虚构的报告管理空间。

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 正在校准 | ![桌面端星盘校准](./2026-07-26-constellation-universe-desktop-loading-v3.png) | ![移动端星盘校准](./2026-07-26-constellation-universe-mobile-loading-v3.png) |
| 失败恢复 | ![桌面端失败恢复](./2026-07-26-constellation-universe-desktop-loading-error-v3.png) | ![移动端失败恢复](./2026-07-26-constellation-universe-mobile-loading-error-v3.png) |

## 6.5 本命盘结果

结果页是内容阅读页：主操作仅为问星语、分享、重新测算。无论桌面或移动端均不显示删除、收藏、个人档案或报告中心。

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 完整本命盘总览 | ![桌面端结果总览](./2026-07-26-constellation-universe-desktop-result-overview-v3.png) | ![移动端结果总览](./2026-07-26-constellation-universe-mobile-result-overview-v3.png) |
| 无宫位本命盘 | ![桌面端无宫位结果](./2026-07-26-constellation-universe-desktop-unknown-time-result-v3.png) | ![移动端无宫位结果](./2026-07-26-constellation-universe-mobile-unknown-time-result-v3.png) |

## 6.6 深度探索标签

标签仍属于同一次结果。桌面端使用页内标签和右侧解释区；移动端使用横向标签与底部抽屉。宫位地图只在出生时间可用时出现。

### 星盘轮与关键相位

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 星盘轮 | ![桌面端星盘轮](./2026-07-26-constellation-universe-desktop-chart-tab-v3.png) | ![移动端星盘轮](./2026-07-26-constellation-universe-mobile-chart-tab-v3.png) |
| 关键相位 | ![桌面端关键相位](./2026-07-26-constellation-universe-desktop-aspects-tab-v3.png) | ![移动端关键相位](./2026-07-26-constellation-universe-mobile-aspects-tab-v3.png) |

### 宫位地图、近期星运与术语百科

宫位地图使用西方占星的第一宫至第十二宫语义，不使用命宫、财帛宫等紫微术语。近期星运提供今天 / 7 天 / 30 天切换；百科可以回到当前盘面定位。

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 宫位地图 | ![桌面端宫位地图](./2026-07-26-constellation-universe-desktop-palace-map-v3.png) | ![移动端宫位地图](./2026-07-26-constellation-universe-mobile-palace-map-v3.png) |
| 近期星运 | ![桌面端近期星运](./2026-07-26-constellation-universe-desktop-transit-v3.png) | ![移动端近期星运](./2026-07-26-constellation-universe-mobile-transit-v3.png) |
| 术语百科 | ![桌面端术语百科](./2026-07-26-constellation-universe-desktop-glossary-v3.png) | ![移动端术语百科](./2026-07-26-constellation-universe-mobile-glossary-v3.png) |

## 6.7 星语问答与分享

问答以当前盘面事实为依据，分享默认脱敏。两者都是结果阅读页上的层，不建立新的系统级入口。

| 状态 | 桌面端 | 移动端 |
| --- | --- | --- |
| 星语问答 | ![桌面端星语问答](./2026-07-26-constellation-universe-desktop-qa-v3.png) | ![移动端星语问答](./2026-07-26-constellation-universe-mobile-qa-v3.png) |
| 分享卡生成完成 | ![桌面端分享卡生成完成](./2026-07-26-constellation-universe-desktop-share-success-v3.png) | ![移动端分享卡生成完成](./2026-07-26-constellation-universe-mobile-share-success-v3.png) |

## 6.8 统一历史记录：查看与删除

此处不是星座模块内的“报告中心”。它复用 AI 聚合工作台既有的统一历史记录：用户可以从命理分类筛选并继续查看星座结果；删除是唯一的历史条目危险操作，需要二次确认。

| 桌面端 | 移动端 |
| --- | --- |
| ![桌面端统一历史记录删除确认](./2026-07-26-constellation-universe-desktop-history-delete-v3.png) | ![移动端统一历史记录删除确认](./2026-07-26-constellation-universe-mobile-history-delete-v3.png) |

## 开发读取顺序

1. 先阅读主设计文档中的流程、数据精度与隐私边界。
2. 根据本附录的同名状态分别打开独立桌面端与独立移动端图片；不再使用旧版双端拼图或 V2 图稿。
3. 桌面端先实现全局工具栏与 AI 命理大师二级模块栏的现有壳层，再填入星座内容区；移动端先实现现有页头、四分段和底部安全区，再填入内容。
4. 测算结果页不得实现删除、收藏、个人档案、报告中心；删除只能复用统一历史记录的二次确认流程。
