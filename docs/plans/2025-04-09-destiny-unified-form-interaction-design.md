# 命理分析模块统一表单交互设计

**日期**: 2025-04-09  
**功能**: 统一八字、紫微、奇门遁甲的交互体验  
**状态**: 设计完成，待实施

---

## 背景与目标

### 当前问题

- **交互不一致**：八字和紫微使用弹框（`OnboardingModal`）输入，奇门遁甲使用内嵌表单（`QimenInputForm`）
- **用户体验割裂**：同一个命理分析模块内，不同功能的交互方式差异过大
- **维护成本高**：弹框和内嵌表单两套实现，增加维护复杂度

### 设计目标

1. **统一交互体验**：将八字和紫微改为与奇门遁甲一致的内嵌表单形式
2. **代码复用**：八字和紫微共用同一个表单组件（输入信息相同）
3. **保持现有功能**：Loading 动画和结果展示保持不变

---

## 设计方案

### 1. 整体架构

```
destiny-page-client.tsx (主容器)
├── bazi-workspace.tsx (新建，八字工作区)
│   ├── bazi-input-form.tsx (新建，共用表单)
│   ├── StarDecodeOverlay (复用，Loading 动画)
│   └── DestinyShell (现有，结果展示)
│
├── ziwei-workspace.tsx (重构)
│   ├── bazi-input-form.tsx (复用表单)
│   ├── StarDecodeOverlay (复用，Loading 动画)
│   └── ZiweiWorkspace 内容 (现有，结果展示)
│
└── qimen-workspace.tsx (保持不变)
    ├── QimenInputForm (现有)
    ├── QimenLoadingAnimation (现有)
    └── QimenAnalysisResult (现有)
```

### 2. 表单设计

#### 2.1 表单组件：`BaziInputForm`

**输入字段**：

- 姓名（文本输入）
- 性别（单选：乾/坤）
- 出生日期（年/月/日下拉选择）
- 出生时间（时/分下拉选择）
- 出生地点（城市搜索输入）

**视觉风格**：

- 简洁卡片布局（白色背景 + 圆角边框）
- 与奇门遁甲表单保持一致的样式
- 响应式布局，适配移动端和桌面端

**表单验证**：

- 姓名：必填，非空
- 出生地点：必填，非空
- 其他字段：默认值有效，无需额外验证

#### 2.2 数据类型

```typescript
// 复用现有的 OnboardingInput 类型
export type BaziFormData = {
  name: string;
  gender: 'male' | 'female';
  birthDate: { year: number; month: number; day: number };
  birthTime: { hour: string; minute: string };
  location: { name: string; lat: number | null; lon: number | null };
};
```

### 3. 交互流程

#### 3.1 八字格局精批流程

```
[表单输入] → [提交] → [星空 Loading] → [结果展示]
     ↑                                        ↓
     └──────────── [重新排盘] ←──────────────┘
```

**状态管理**：

```typescript
type Step = 'form' | 'result';
const [step, setStep] = useState<Step>('form');
const [loading, setLoading] = useState(false);
const [formData, setFormData] = useState<BaziFormData>(...);
const [report, setReport] = useState<DestinyReport | null>(null);
```

#### 3.2 紫微斗数排盘流程

与八字流程完全一致，只是 API 端点和结果展示组件不同。

### 4. Loading 状态

**复用现有组件**：`StarDecodeOverlay`

**展示方式**：

- 全屏覆盖（z-index: 50）
- 星空粒子汇聚动画
- 中心显示文案："星空解码中 / 提取命运密码"
- 背景模糊效果（backdrop-blur）

**触发时机**：

- 表单提交后立即显示
- API 调用完成后隐藏

### 5. 结果展示

#### 5.1 八字结果

**组件**：`DestinyShell`（现有）

**展示内容**：

- 左侧：导航与历史（`LeftNav`）
- 中间：排盘主视图（`ChartCenterPanel`）
- 右侧：报告与时间轴（`ReportRightRail`）

**操作**：

- 点击"重新排盘"按钮返回表单

#### 5.2 紫微结果

**组件**：`ZiweiWorkspace` 内容（现有）

**展示内容**：

- 紫微星盘（12 宫位网格）
- 命理总论、大限流年、六亲缘分（右侧面板）
- 性格、事业、财富模块卡片

**操作**：

- 点击"重新排盘"按钮返回表单

### 6. 错误处理

**错误类型**：

- `validation`：表单验证错误
- `model`：模型调用失败
- `timeout`：请求超时
- `unknown`：未知错误

**错误展示**：

- 表单验证错误：字段下方显示红色提示文字
- API 错误：结果区域显示错误卡片，提供"重试"和"修改信息"按钮

---

## 技术实现细节

### 1. 新建组件

#### `bazi-input-form.tsx`

```typescript
export function BaziInputForm({
  value,
  submitting,
  error,
  fieldErrors,
  onChange,
  onSubmit,
  onReset,
}: BaziInputFormProps) {
  // 表单渲染逻辑
}
```

#### `bazi-workspace.tsx`

```typescript
export function BaziWorkspace({
  onRecalculate,
  onLoadingChange,
}: BaziWorkspaceProps) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<BaziFormData>(...);
  const [report, setReport] = useState<DestinyReport | null>(null);

  // 表单提交、API 调用、状态管理逻辑
}
```

### 2. 重构组件

#### `ziwei-workspace.tsx`

- 移除现有的 `loading` 和 `error` props
- 添加 `step` 状态管理
- 集成 `BaziInputForm` 和 `StarDecodeOverlay`
- 保持现有的结果展示逻辑

### 3. 主容器更新

#### `destiny-page-client.tsx`

- 移除 `OnboardingModal` 的使用
- 移除 `stage` 状态（不再需要 'onboarding' 和 'decoding' 状态）
- 简化八字和紫微的状态管理逻辑
- 保持奇门遁甲的现有实现

### 4. 样式规范

**卡片容器**：

```css
.form-card {
  border-radius: 30px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  background: rgba(255, 255, 255, 0.75);
  padding: 2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
```

**输入框**：

```css
.input-field {
  height: 48px;
  border-radius: 12px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  background: white;
  padding: 0 1rem;
}
```

**按钮**：

```css
.submit-button {
  height: 48px;
  border-radius: 24px;
  background: linear-gradient(to right, #2f6bff, #5d7cfa);
  color: white;
  font-weight: bold;
}
```

---

## 实施计划

### 阶段 1：创建共用表单组件

1. 创建 `bazi-input-form.tsx`
2. 创建 `bazi-types.ts`（类型定义）
3. 创建 `bazi-mappers.ts`（数据映射）

### 阶段 2：实现八字工作区

1. 创建 `bazi-workspace.tsx`
2. 集成表单、Loading、结果展示
3. 实现状态管理和 API 调用

### 阶段 3：重构紫微工作区

1. 重构 `ziwei-workspace.tsx`
2. 集成共用表单组件
3. 添加 Loading 动画

### 阶段 4：更新主容器

1. 更新 `destiny-page-client.tsx`
2. 移除弹框相关代码
3. 简化状态管理

### 阶段 5：测试与优化

1. 功能测试（表单验证、API 调用、结果展示）
2. 交互测试（Loading 动画、错误处理）
3. 响应式测试（移动端、桌面端）
4. 性能优化（组件懒加载、状态优化）

---

## 预期效果

### 用户体验提升

- ✅ 统一的交互模式，降低学习成本
- ✅ 流畅的表单到结果的过渡体验
- ✅ 沉浸式的 Loading 动画
- ✅ 清晰的错误提示和重试机制

### 代码质量提升

- ✅ 表单组件复用，减少重复代码
- ✅ 统一的状态管理模式
- ✅ 更清晰的组件职责划分
- ✅ 更易于维护和扩展

### 技术债务清理

- ✅ 移除不再使用的 `OnboardingModal` 组件
- ✅ 简化 `destiny-page-client.tsx` 的状态管理
- ✅ 统一三个模块的实现模式

---

## 风险与注意事项

### 潜在风险

1. **API 兼容性**：确保新表单提交的数据格式与现有 API 兼容
2. **状态同步**：确保表单、Loading、结果之间的状态切换正确
3. **样式一致性**：确保新表单与奇门遁甲的样式高度一致

### 注意事项

1. **保留现有功能**：不要破坏现有的结果展示和 AI 分析功能
2. **渐进式重构**：先完成八字，再重构紫微，避免一次性改动过大
3. **充分测试**：每个阶段完成后进行充分测试，确保功能正常

---

## 附录

### A. 相关文件清单

**新建文件**：

- `apps/web/src/app/destiny/_components/bazi-input-form.tsx`
- `apps/web/src/app/destiny/_components/bazi-workspace.tsx`
- `apps/web/src/app/destiny/_components/bazi-types.ts`
- `apps/web/src/app/destiny/_components/bazi-mappers.ts`

**修改文件**：

- `apps/web/src/app/destiny/_components/ziwei-workspace.tsx`
- `apps/web/src/app/destiny/_components/destiny-page-client.tsx`

**可能删除的文件**：

- `apps/web/src/app/destiny/_components/onboarding/onboarding-modal.tsx`（如果不再使用）

### B. API 端点

**八字分析**：

- `POST /api/destiny/report`
- 请求体：`OnboardingInput`
- 响应：`DestinyReportResponse`

**紫微分析**：

- `POST /api/destiny/ziwei-report`
- 请求体：`OnboardingInput`
- 响应：`DestinyReportResponse`

### C. 参考组件

**奇门遁甲实现**：

- `apps/web/src/app/destiny/_components/qimen-workspace.tsx`
- `apps/web/src/app/destiny/_components/qimen-input-form.tsx`
- `apps/web/src/app/destiny/_components/qimen-loading-animation.tsx`

**星空 Loading**：

- `apps/web/src/app/destiny/_components/onboarding/star-decode-overlay.tsx`

---

**设计完成日期**: 2025-04-09  
**设计审核**: 已通过  
**下一步**: 开始实施阶段 1 - 创建共用表单组件
