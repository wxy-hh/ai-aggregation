# 跨模态单引用接力 — 功能说明

> Feature：`2026-07-14-cross-modal-reference-relay`（标准 L）
> 状态：已实现并通过验证（outcome: verified）

## 一句话概述

打通对话、图像、语音、视频、命理五个模块，让用户把任一模块的稳定结果以「单引用」形式接力到另一模块继续创作，全程不自动产生模型费用、不静默覆盖用户输入、失败可原地重试。

## 核心能力

### 统一引用协议（`@repo/shared`）

- `RelayReferenceItem`：来源模块/类型/对象标识/标题/模型/时间 + 文本或媒体快照（至少一种）。
- `RelayBundle`：`items[]` 集合 + 目标模块/角色 + 创建时间；首版界面限 1 条（`MAX_RELAY_ITEMS=1`），协议不假设单元素，便于第二阶段提上限且无需迁移首版数据。
- `DerivationMetadata`：`derivedFromRelayId` / `derivedFromReferenceIds`，写入历史项记录派生来源。

### 发起侧（显式入口）

- 每个模块的稳定结果提供显式「接力」按钮；桌面右键、移动端长按复用同一菜单，均非唯一入口。
- 菜单标题「用此继续」，按目标能力过滤（语音不作目标、unsupported 不显示）。
- URL 仅携带 `?relayId=`，快照正文/媒体地址持久化在 IndexedDB（Dexie `ai-relay-db`）。

### 接收侧（ReferenceBar）

- 显示来源摘要、查看来源、移除引用；草稿可编辑、快照不可改；到达不自动执行。
- 已有草稿时不覆盖，提供「填入输入框 / 填入 Prompt」显式操作；已有引用时新接力先进入替换确认候选。
- 三态容错：包不存在提示「接力内容已失效」；来源删除后快照可用并提示「来源已删除，快照仍可使用」（隐藏查看来源）；媒体失效保留元信息。

### 各模块承接

- **对话**：单聊/并行对比均可发起与接收；对比每模型独立接力（快照仅含该列内容 + 模型名）。
- **图像**：文本→Prompt 可编辑；图片→对话分析/视频参考图/再次绘图；快照用 DataURL 可恢复地址，禁临时 objectURL。
- **语音**：实时/上传稳定结果可接力，默认全文、选中片段优先；录音中全文禁用并给中文原因。
- **视频**：文本→描述、图片→参考图；移动端自动开配置抽屉定位字段；agnes 模型或已有手动参考图时中文提示不静默覆盖。
- **命理**：三术数（八字/紫微/奇门）平级无推荐/预选/自动路由；文本只作问题/背景绝不进出生字段；八字/紫微预填命理顾问不自动发送（发送成功才完成接力）；奇门预填所问之事确认后起局；紫微无顾问，生成命盘即完成接力。

### 执行与失败（两阶段）

- `prepareExecution()` 执行前只读派生元数据（不清状态）；`commitExecution()` 成功回调才清活动引用与草稿。
- 失败/取消保留引用与草稿，允许原地重试；离开返回未执行引用可恢复。
- 成功结果（含命理命盘/起局）写历史并带派生元数据，历史卡片可「查看来源」，不展示关系图。

## 关键文件

- 协议类型：`packages/shared/src/types/relay.ts`
- 持久化 Store：`apps/web/src/stores/relay-store.ts`（含 `markSourcesInvalidBySourceIds`）
- 共享组件：`apps/web/src/components/relay/`（use-relay-launcher / use-relay-receive / relay-menu / reference-bar / use-long-press）
- 目标注册/适配：`apps/web/src/lib/relay/target-registry.ts`、`adapters.ts`
- 命理能力注册：`apps/web/src/lib/relay/destiny-capabilities.ts`、`relay-method-picker.tsx`

## 已知 accepted gap（首版不修复，列入后续迭代）

- **M3**：图像「作为参考图」目标在当前 Kolors/Agnes 无参考图 UI，无字段承接；后续在 `getAvailableTargets` 加目标能力上下文做过滤或加提示。
- **M4**：RelayMethodPicker ready/needs_input 保留颜色分级；严格平级（统一灰色小字、去品牌色）待产品确认。

## 验证边界

真实模型计费调用、真机移动端窄屏、实时录音中/报告流式生成中等特定运行时态未在自动验证中触发，由代码审查 + 单元测试覆盖执行边界，详见 `completion.md` 与验证报告。
