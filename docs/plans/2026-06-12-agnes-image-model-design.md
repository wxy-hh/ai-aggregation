# 图片生成页新增 Agnes Image 2.1 Flash 模型 — 设计文档

**日期:** 2026-06-12
**状态:** 已确认

## 背景

当前图片生成页面（`apps/web/src/app/image/page.tsx`）仅支持 Kolors 模型（通过 SiliconFlow），用户反馈效果不好，希望新增 Agnes Image 2.1 Flash 模型。要求现有功能保持不变，新模型作为可选项加入。

## 参数对比

| 参数 | Kolors | Agnes Image 2.1 Flash |
|------|--------|----------------------|
| prompt | 必填（中文，通过 STYLE_PROMPTS 增强） | 必填（建议英文，原生处理） |
| negative_prompt | 可选 | 可选 |
| size | ratio → imageSize 6种映射 | 7种预设尺寸（无比例映射） |
| steps | 20-50 | ❌ 不支持 |
| guidance_scale (CFG) | 1-20 | ❌ 不支持 |
| quality | ❌ 不支持 | standard / hd |
| style | 6种（通过 prompt 前缀/后缀工程） | 3种原生 API 参数 |
| n / batch_size | 1-4 | 1-4 |
| seed | 可选 | 可选 |

## 架构决策

1. **模型切换器**: 顶部 header 区域新增 Tabs/SegmentedControl
2. **风格适配**: 按模型动态显示不同风格列表
3. **API 路由**: 走 BFF 代理（新增 `/api/image/agnes` 路由）
4. **快速开始**: 保持不变（通用 prompt，两种模型均可使用）

## UI 变化

### 模型切换器（页头）

- 位置：header 右侧，Badge "READY" 旁边
- 样式：分段控制器（SegmentedControl），两个选项：
  - "Kolors"（默认选中，现有体验不变）
  - "Agnes Flash"

### 按模型动态显示的参数

**两种模型共有的 UI 元素：**
- Prompt 输入框（保持）
- Negative Prompt（保持）
- 宽高比选择 → 根据模型映射为不同 size 值
- 生成数量 1-4（保持）
- 种子输入（保持）

**仅 Kolors 显示：**
- 生成质量 Steps 滑块（20-50）
- Guidance Scale (CFG) 滑块（1-20）
- 风格选择器（6 种 Kolors 风格）

**仅 Agnes 显示：**
- 质量选择（standard / hd）
- 风格选择器（3 种原生风格：photographic / anime / cinematic）

### 参数面板调整

- SettingsPanel → 拆分为 `KolorsSettings` 和 `AgnesSettings` 两个子组件，或通过条件渲染
- StyleSelector → 根据 `model` prop 渲染不同风格列表

## 文件变更清单

### 新增
- `apps/web/src/lib/api/agnes.ts` — Agnes API 客户端
- `apps/web/src/app/api/image/agnes/route.ts` — Agnes BFF 代理路由
- `apps/web/src/components/image/model-switcher.tsx` — 模型切换器组件
- `apps/web/src/components/image/agnes-settings.tsx` — Agnes 专属参数面板

### 修改
- `apps/web/src/app/image/page.tsx` — 集成 model 状态、切换器、条件渲染
- `apps/web/src/lib/constants/image-generation.ts` — 新增 AGNES_STYLES、AGNES_SIZES、AGNES_DEFAULTS 等常量
- `apps/web/src/components/image/settings-panel.tsx` — 支持 model prop 条件渲染
- `apps/web/src/components/image/style-selector.tsx` — 支持 model prop 显示不同风格
- `apps/web/src/lib/utils/history-helpers.ts` — createImageHistoryItem 记录模型信息
- `apps/web/.env.local` — 新增 AGNES_API_KEY（用户自行配置）

## 数据流

```
用户选择模型 → model state 变更
  → StyleSelector 切换风格列表
  → SettingsPanel 切换参数控件
  → 生成按钮调用 handleGenerate
    → 按 model 选择不同 API 客户端（kolors.ts / agnes.ts）
    → BFF 代理处理 token 扣费 + 使用量记录
    → 返回图片结果
    → 保存到历史记录（标注模型名）
```

## 不涉及的变更

- 对话页、视频页、语音页不做修改
- 创作灵感舱（CreativeCockpit）保持不变（通用 prompt，两种模型共用）
- 历史记录页面数据类型不变（`model` 字段已存在）
- 快速开始区保持 3 个卡片不变
- 移动端体验：模型切换器在移动端与"参数设置"按钮共存
