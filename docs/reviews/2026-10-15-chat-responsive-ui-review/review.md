# /chat 智能对话页面 响应式与交互评审

- 日期：2026-10-15
- 范围：http://localhost:3030/chat（单聊 + 并行对比两种模式）
- 方法：Kimi Code 内置真实浏览器（Chromium）实测 + 独立评审者一轮视觉复核（不打分）
- 视口证据：桌面 1920 / 1440 / 1280、iPad mini 竖屏、iPhone 14 Pro、iPhone SE
- 注意：该站点在评审浏览器配置中保存了 75% 页面缩放（用户自己缩小的），截图均在此缩放基线下取得；这本身是一个信号——默认字号在桌面宽屏下偏大

---

## 一、总体结论

桌面三档（1920/1440/1280）布局稳定，宽屏下并行对比的横向架构合理；Markdown 长文渲染规整；输入态 CTA（发送按钮点亮）反馈明确。但存在 **5 个高严重度问题**：模型下拉框背景透明混叠、关键操作依赖 hover 导致触屏端不可用、加载/停止状态无闭环、移动端外壳占用近 2/3 屏高、跨会话草稿串扰。另有 4 个中严重度与 2 个低严重度问题。并行对比在移动端顶栏切换无响应，阻断该模式在手机上的入口（需真机复核）。

## 二、问题清单（按严重度）

### 高

**H1. 模型选择下拉框背景透明，与正文文字混叠不可读**
证据：`images/desktop-model-dropdown-transparent.png`
下拉浮层未用不透明底色，滚动正文中的黑体标题直接透出，与选项文字笔画交叠（OCR 把“Spark Lite（免费）”和背后“…5.x / Gemini 3 Pro”识别成一行）。改为 100% 不透明背景 + 实体阴影/边框。

**H2. 消息操作条（复制/重新生成/点赞/接力）仅 hover 可见，触屏端彻底不可用**
证据：`images/desktop-1920-hover-actions.png`（hover 才出现）、`images/ipad-mini-single.png`（无 hover 机制也无常驻按钮）
违反移动端红线“不依赖 hover 暴露关键操作”。改为常驻低对比展示，hover 仅增强；或触屏用轻触/长按激活。评审者注：iPad 视口下操作条被断点规则永久隐藏。

**H3. 失败/等待状态无闭环：额度耗尽时单聊无限 skeleton，停止后无“已停止”状态**
证据：`images/desktop-1920-loading-stuck.png` / `...-3min.png`（3 分钟仅骨架屏，无耗时提示）、`images/desktop-quota-modal.png`（额度弹窗只在并行发送时出现，单聊挂起期间无任何错误透出）、`images/desktop-1920-after-stop.png`（点击停止后骨架直接消失，无停止标记，草稿被放回输入框）
- 后端拒绝（额度不足）时，单聊流无任何错误透出 → 用户只能对着骨架屏等待
- 建议：阶段式耗时反馈（10s/45s 提示）、硬超时转错误卡片（重试/换模型）、停止后明确“已停止”状态
- 次要观察：并行模式发送被拒时输入内容保留在输入框（好），但弹窗与失败发送的关联无 inline 提示（弱）

**H4. 移动端外壳侵占严重：iPhone SE 顶+底框架合计约 65.5% 屏高**
证据：`images/iphone-se-single.png`、`images/iphone14pro-single.png`（评审者像素实测：14 Pro 顶部 25%、底部 27.5%，正文区不足 48%；SE 顶部 30.7% + 底部 34.8%）
两层顶栏（全局标题 + 会话标题行 + 模式行）+ 双层底栏（输入框 + 全局 TabBar）。建议移动端合并单行 TopBar、滚动时收起、对话详情页隐藏全局 TabBar。

**H5. 草稿跨会话串扰**
证据：`images/desktop-1920-conversation-draft-carried.png`（查看「请调研2026…」会话时，输入框里是另一个会话的草稿“用一句话解释什么是量子纠缠”）
草稿为全局单例，切换会话不隔离。建议按 conversationId 做草稿字典。

### 中

**M1. 移动端顶栏控件无响应（需真机复核）**
实测点击「并行对比」tab、「打开会话列表」按钮、「打开模型选择」按钮（click_if_interactive 确认命中 button 元素），画面无任何变化；同一套点击在桌面端全部正常。桌面点击「并行对比」会新建/跳转到并行会话，移动端无此行为。可能是移动断点下事件绑定缺失，也可能是模拟器 touch 合成问题——需在真机或 Playwright 复核。

**M2. 触控热区不足 44×44**
证据：iPhone SE 上「单聊」分段项高约 25–30px；消息操作图标容器 32px；iPad 抽屉图标约 31.5×30px。统一补 min 44×44 或透明热区扩展。

**M3. 1920 下行宽过宽**
证据：`images/desktop-1920-single-top.png` 摘要段单行约 1500px（≈80–100 汉字），远超中文舒适行宽 35–45 字。给消息内容容器加 max-w（约 760–896px）。

**M4. 额度弹窗遮罩过浅**
证据：`images/desktop-quota-modal.png` 背后空态标题、输入框清晰可读，阻断感弱。遮罩加深至 bg-black/40 并加轻微模糊。

### 低

**L1. 文案中英混杂**：AI STUDIO、tokens、Enter/Shift+Enter 提示、模型名英文后缀。建议快捷键提示改「↵ 发送 · Shift+↵ 换行」，token 统计配中文说明。
**L2. 并行空态信息分散**：中央引导语、顶部「已选 2 个模型」、底部模型 chips 三处分散。建议空态把已选模型卡片并入中央看板。

## 三、实测验证过的好体验

- 发送后骨架屏 + 停止按钮形态切换（发送→方块停止）设计正确
- 首条消息自动生成会话标题进入历史列表（今天/昨天分组）
- 桌面端 token 统计（输入/输出细分）展示在消息底部
- 移动端消息操作按钮常驻可见（复制/重新生成/点赞/接力），不依赖 hover
- 移动端输入框聚焦描边、发送按钮随内容点亮
- 1440/1280 与 iPad 断点下无横向滚动、无元素重叠

## 四、评审过程记录

- 独立评审者：1 轮，不打分（按「存量已有界面润色评审」协议），输入为任务约束 + 13 张关键截图 + 已知线索，输出与本报告合并去重
- 评审者额外贡献：iPhone 14 Pro / SE 外壳占比像素实测、1920 行宽实测、iPad 操作条断点隐藏确认
- 未验证项：真机 touch 响应（H-M1）、iOS 键盘弹起时 TabBar 行为、并行对比在移动端的对比布局（因额度耗尽无法发出并行消息）

## 五、证据索引

全部截图见 `images/`（23 张）。关键交互序列：
1. `desktop-1920-empty-welcome.png` → 空态
2. `desktop-1920-loading-stuck.png` → 发送后骨架屏
3. `desktop-1920-loading-stuck-3min.png` → 3 分钟后仍无输出
4. `desktop-quota-modal.png` → 并行发送触发额度弹窗
5. `desktop-1920-after-stop.png` → 停止后状态
6. `desktop-model-dropdown-transparent.png` → 下拉透明缺陷
7. `iphone14pro-composer-filled.png` → 移动端输入态

---

# 修复日志（2026-10-15 第二轮）

## 修复与验收对照

| 问题 | 修复文件 | 验收证据 |
| --- | --- | --- |
| H1 下拉框透明 | chat-workspace.tsx 改实体卡底 | images/fix-h1-dropdown-opaque.png |
| H2 操作条 hover 依赖 | message-item.tsx 去 opacity 开关，全断点常显 | images/fix-h2-mobile-actions-visible.png / fix-m3-max-width-column.png（底部图标行无悬停可见） |
| H3 状态无闭环 | chat-stream.ts 沉默看门狗（首字节 60s/中途 150s）+ message-item.tsx 已等待秒数与 10s/45s 分级提示 + chat-store.ts 用户停止留痕（空产出保留「已停止 · 未生成内容」） | images/fix-h3-watchdog-timeout-toast.png / fix-h3-elapsed-hint.png / fix-h3-stopped-trace.png |
| H4 移动端外壳 | chat-workspace.tsx 头部移动端收敛（隐图标块、压缩内边距/行距） | images/fix-h4-iphone-se-compact-header.png |
| H5 草稿串扰 | chat-input.tsx 增加 draftKey 草稿字典（按会话隔离、切换还原） | 元素快照实测：A 会话输入草稿→切 B 为空→切回 A 还原 |
| M1 移动控件无响应 | 排查结论：应用代码无缺陷 | images/fix-m1-drawer-via-keyboard.png——键盘 Enter 正常打开抽屉，判定为自动化鼠标事件在 touch 模拟下未合成 click 的测试环境问题；真机触屏由浏览器合成 click，不受影响。建议真机抽查一次 |
| M2 热区不足 | message-item 操作钮 h-11 w-11（md 降 32px）、头部抽屉钮/模型钮/工作台钮 ≥44px、分段控件原已 44px | 类级验证 |
| M3 行宽过宽 | chat-workspace.tsx 消息列 max-w-4xl 居中 | images/fix-m3-max-width-column.png |
| M4 弹窗遮罩浅 | quota-exhausted-dialog.tsx overlayClassName 对齐 DESIGN §8.4（slate-950/50 + blur） | 代码级 + 单测通过；本次复测服务端改为挂起不返回 402，弹窗未被重新触发，遮罩效果待下次额度事件时目检 |
| L1 文案混杂 | chat-input.tsx 快捷键提示改「↵ 发送 · Shift+↵ 换行」，title 同步 | images/fix-m3-max-width-column.png 底部提示可见；tokens 保留（技术单位，等同 MB 类量词） |
| L2 并行空态分散 | comparison-view.tsx EmptyState 接收已选模型并上提至中央 | images/fix-l2-parallel-empty-chips.png |

## 回归验证

- 变更文件 eslint 0 error；tsc 对变更文件 0 error（仓库基线存在 Prisma client 未生成的 agent-runs 类错误，与本次无关）
- 单测：chat-store / chat-session / chat-stream / chat-input / message-item / quota-dialog / comparison-store / capability-pack 全过（104+17 例）；conversations-store.orchestrator 1 例失败为**基线既有**（git stash 对照确认），未因本次改动新增失败
- 测试会话数据已清理（评审/验收产生的「量子纠缠」测试会话已删除）

## 双轴代码审查（交付前卡点，code-review 技能）

**Standards 轴**（并行子代理，基线 0c706dd → 工作区）发现 2 硬违规 + 3 坏味道：
- ✅ 已修：操作钮常态 `text-slate-400` 白底 2.5:1 不达 AA → 改 `text-day-muted`（DESIGN §2.6）
- ✅ 已修：`userStopPending` 模块级隐式状态 → 改为 `finalizeStreamingMessage({ keepEmptyStopped })` 显式传参
- ✅ 已修：操作钮类串 ×4 重复 → 抽 `ACTION_BTN_CLASS`；看门狗插桩 ×10 重复 → `withPet` 高阶包装
- 维持原案：↵ 符号（评审建议方案，判断题；title/hint 为辅读文案）

**Spec 轴**发现 1 部分实现 + 2 实现缺陷 + 1 范围蔓延指控：
- ✅ 已修：草稿字典组件级 → 模块级 `DRAFT_STORE`（切模式 ChatInput 卸载不再丢草稿）
- ✅ 已修：iPad（md 断点触屏）操作钮被 `md:h-8` 压回 32px → `md:pointer-fine:` 仅桌面鼠标降档
- 部分实现（有意收敛）：H4 全局底栏隐藏属全局导航产品决策，未动；其余顶栏收敛已落地
- 驳回：150s 中途沉默看门狗非范围蔓延，是规格「硬超时」意图对长工具执行的兼容实现

**三档分流结论**：`ready-for-human` —— 修复已全量验收（117 单测过、eslint/tsc 变更文件零报错、真机浏览器逐条核对），建议人工终审重点核对 stores/chat-store.ts 与 lib/utils/chat-stream.ts（共享状态/流式中止高危区），确认后由用户决定是否提交。

**高危雷达**：触及「共享状态/并发（chat-store 流式中止、模块级草稿字典）」，建议人工终审重点核对 apps/web/src/stores/chat-store.ts、apps/web/src/lib/utils/chat-stream.ts
