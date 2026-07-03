# 图片生成页新增 Agnes Image 2.1 Flash 模型 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在图片生成页面新增 Agnes Image 2.1 Flash 模型，通过模型切换器让用户在 Kolors 和 Agnes 之间切换，参数面板按模型动态适配。

**Architecture:** 新增 `ImageModel` 类型统一定义模型身份，model state 贯穿页面 → StyleSelector / SettingsPanel 按 model 条件渲染。Agnes API 通过新的 BFF 代理路由调用，复用现有 token 扣费逻辑。Kolors 现有功能零改动。

**Tech Stack:** React 19 + TypeScript + Zustand（不新增 store，model 保留在页面本地 state） + Next.js Route Handlers + Tailwind CSS

---

## 文件结构总览

### 新增文件
- `apps/web/src/lib/api/agnes.ts` — Agnes API 客户端
- `apps/web/src/app/api/image/agnes/route.ts` — Agnes BFF 代理
- `apps/web/src/components/image/model-switcher.tsx` — 模型切换器

### 修改文件
- `apps/web/src/lib/constants/image-generation.ts` — 新增 Agnes 常量
- `apps/web/src/components/image/style-selector.tsx` — 支持 model prop
- `apps/web/src/components/image/settings-panel.tsx` — 支持 model prop 条件渲染
- `apps/web/src/app/image/page.tsx` — 集成 model 状态与切换

---

### Task 1: 新增图像模型类型定义

**Files:**

- Modify: `apps/web/src/lib/constants/image-generation.ts`

在常量文件顶部新增 ImageModel 类型和 Agnes 的常量定义。

- [ ] **Step 1: 新增类型和常量**

在 `apps/web/src/lib/constants/image-generation.ts` 开头新增：

```typescript
// 图像生成模型类型
export type ImageModel = 'kolors' | 'agnes';

// Agnes 模型名（发送给 API）
export const AGNES_MODEL_NAME = 'agnes-image-2.1-flash';

// Agnes 支持的风格
export const AGNES_STYLES = [
  { id: 'photographic', name: '摄影写实', description: '照片级真实感' },
  { id: 'anime', name: '动漫风格', description: '二次元动漫画风' },
  { id: 'cinematic', name: '电影质感', description: '电影级光影构图' },
] as const;

// Agnes 尺寸选项
export const AGNES_SIZE_OPTIONS = [
  { id: '1024x1024', label: '1:1', title: '正方形', size: '1024×1024' },
  { id: '768x1024', label: '3:4', title: '竖屏', size: '768×1024' },
  { id: '1024x768', label: '4:3', title: '横屏', size: '1024×768' },
  { id: '1024x576', label: '16:9', title: '宽屏', size: '1024×576' },
  { id: '576x1024', label: '9:16', title: '竖屏视频', size: '576×1024' },
] as const;

// Agnes 画质选项
export const AGNES_QUALITIES = [
  { id: 'standard', label: '标准', description: '较快生成' },
  { id: 'hd', label: '高清', description: '更多细节' },
] as const;

// Agnes 默认参数
export const AGNES_DEFAULT_PARAMS = {
  model: 'agnes' as ImageModel,
  style: 'photographic',
  size: '1024x1024',
  quality: 'standard' as 'standard' | 'hd',
  n: 1,
} as const;

// 模型选择器选项
export const IMAGE_MODELS = [
  { id: 'kolors' as ImageModel, label: 'Kolors', description: 'Kolors 模型' },
  { id: 'agnes' as ImageModel, label: 'Agnes Flash', description: 'Agnes Image 2.1 Flash' },
] as const;
```

确保插入位置在文件顶部（在现有 `ASPECT_RATIO_TO_SIZE` 之前，紧跟注释块之后）。

- [ ] **Step 2: 验证类型编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/constants/image-generation.ts
git commit -m "feat(image-generation): 新增 Agnes Image 模型类型和常量定义

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 2: 新增 Agnes API 客户端

**Files:**

- Create: `apps/web/src/lib/api/agnes.ts`

封装 Agnes API 的调用逻辑。Agnes 直接调用外部 API（通过 BFF），不使用 SiliconFlow 代理。

- [ ] **Step 1: 创建 API 客户端文件**

```typescript
/**
 * Agnes Image 2.1 Flash API Client
 * 通过 BFF 代理调用 Agnes AI 服务
 */

import { authFetch } from './client';

export interface AgnesGenerateParams {
  prompt: string;
  negativePrompt?: string;
  size: string;
  n?: number;
  seed?: number;
  style?: string;
  quality?: 'standard' | 'hd';
}

export interface AgnesGenerateResponse {
  created: number;
  data: Array<{
    url: string;
    revised_prompt?: string;
  }>;
}

/**
 * 通过 BFF 代理调用 Agnes Image API 生成图片
 */
export async function generateAgnesImage(
  params: AgnesGenerateParams
): Promise<AgnesGenerateResponse> {
  const response = await authFetch('/api/image/agnes', {
    method: 'POST',
    body: JSON.stringify({
      prompt: params.prompt,
      negative_prompt: params.negativePrompt || undefined,
      size: params.size,
      n: params.n || 1,
      seed: params.seed,
      style: params.style || undefined,
      quality: params.quality || 'standard',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Agnes API error: ${response.statusText}`);
  }

  return response.json();
}
```

- [ ] **Step 2: 验证类型编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/api/agnes.ts
git commit -m "feat(api): 新增 Agnes Image API 客户端

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 3: 新增 Agnes BFF 代理路由

**Files:**

- Create: `apps/web/src/app/api/image/agnes/route.ts`

复用现有 Kolors 路由的 token 扣费 + 使用量记录逻辑，差异仅在后端 API 调用。

- [ ] **Step 1: 创建 BFF 路由**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { prisma, deductTokens, refundTokens } from '@repo/db';

const AGNES_API_KEY = process.env.AGNES_API_KEY;
const AGNES_API_URL = 'https://api.agnesai.com/v1/images/generations';

export async function POST(request: NextRequest) {
  let deducted = false;
  let userId: string | null = null;

  try {
    if (!AGNES_API_KEY) {
      return NextResponse.json(
        { error: 'AGNES_API_KEY is not configured' },
        { status: 500 }
      );
    }

    userId = await getOptionalUserId(request);
    const body = await request.json();

    // 已认证的非 admin 用户预扣 1 token
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, tokens: true },
      });
      if (user && user.role !== 'admin') {
        if (user.tokens <= 0) {
          return NextResponse.json(
            { error: 'Token 额度不足，请联系管理员充值' },
            { status: 429 }
          );
        }
        await deductTokens(userId, 1);
        deducted = true;
      }
    }

    console.log('→ Generating image with Agnes...');
    console.log('  Prompt length:', body.prompt?.length || 0);
    console.log('  Size:', body.size);
    console.log('  N:', body.n);
    console.log('  Style:', body.style);
    console.log('  Quality:', body.quality);

    const response = await fetch(AGNES_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AGNES_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'agnes-image-2.1-flash',
        prompt: body.prompt,
        negative_prompt: body.negative_prompt,
        size: body.size,
        n: body.n,
        seed: body.seed,
        style: body.style,
        quality: body.quality,
      }),
    });

    console.log('← Agnes API Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('← Agnes API Error:', errorText);
      if (userId && deducted) {
        deducted = false;
        await refundTokens(userId, 1);
      }
      return NextResponse.json(
        { error: `Agnes API error: ${errorText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('← Agnes generation successful, images:', data.data?.length || 0);

    // 转换为统一格式（与 Kolors 返回格式兼容）
    const result = {
      images: (data.data || []).map((item: { url: string }) => ({
        url: item.url,
      })),
    };

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'image',
        action: 'image-generate',
        provider: 'agnes',
        model: 'agnes-image-2.1-flash',
        endpoint: '/api/image/agnes',
        usage: normalizeUsage(data.usage),
        metadata: {
          promptLength: typeof body.prompt === 'string' ? body.prompt.length : 0,
          imageSize: body.size,
          batchSize: body.n,
          imageCount: Array.isArray(data.data) ? data.data.length : 0,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (userId && deducted) {
      deducted = false;
      await refundTokens(userId, 1);
    }
    console.error('Agnes image generation error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: 验证 API 路由编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/image/agnes/route.ts
git commit -m "feat(api): 新增 Agnes Image BFF 代理路由

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 4: StyleSelector 支持 model prop

**Files:**

- Modify: `apps/web/src/components/image/style-selector.tsx`

组件接收 `model` prop，根据模型渲染不同风格列表。

- [ ] **Step 1: 修改 StyleSelector 组件**

在文件顶部新增导入：

```typescript
import { AGNES_STYLES, ImageModel } from '@/lib/constants/image-generation';
```

修改接口和组件实现，用 `export` 替换原导出的接口和函数：

```typescript
export interface StyleSelectorProps {
  selected: string;
  onStyleChange: (style: string) => void;
  model?: ImageModel;
}

export function StyleSelector({ selected, onStyleChange, model = 'kolors' }: StyleSelectorProps) {
  // 根据模型决定使用哪个风格列表
  const styleList = model === 'agnes'
    ? AGNES_STYLES.map((s) => ({
        id: s.id,
        name: s.name,
        icon: s.id === 'photographic' ? <Camera className="w-5 h-5" /> :
              s.id === 'anime' ? <Sparkles className="w-5 h-5" /> :
              <Zap className="w-5 h-5" />,
        color: s.id === 'photographic' ? 'text-emerald-500' :
               s.id === 'anime' ? 'text-pink-500' :
               'text-purple-500',
        gradient: 'from-slate-50/50 to-slate-100/50 dark:from-slate-900/10 dark:to-slate-900/30',
        activeGradient: 'from-slate-100 to-slate-200 dark:from-slate-900/40 dark:to-slate-800/60',
        borderColor: 'border-slate-200 dark:border-slate-800',
        shadowColor: 'shadow-slate-500/10',
      }))
    : styles; // 原有的 Kolors 6 种风格（保持不变）

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          风格预设
        </h3>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {styleList.map((style) => (
          <button
            key={style.id}
            onClick={() => onStyleChange(style.id)}
            className={cn(
              'relative p-2.5 rounded-xl transition-all duration-300 cursor-pointer group flex flex-col items-center gap-2',
              'border backdrop-blur-sm bg-gradient-to-br',
              selected === style.id
                ? `${style.activeGradient} ${style.borderColor} shadow-lg ${style.shadowColor} scale-[1.02] ring-1 ring-inset ring-white/20`
                : `${style.gradient} border-transparent hover:border-slate-200 dark:hover:border-slate-700 hover:shadow-md hover:-translate-y-0.5`
            )}
          >
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 shadow-sm',
                'bg-white dark:bg-slate-800',
                selected === style.id
                  ? 'scale-110 shadow-md ring-2 ring-white/50'
                  : 'group-hover:scale-110'
              )}
            >
              <div className={cn('transition-colors duration-300', style.color)}>{style.icon}</div>
            </div>

            <span
              className={cn(
                'text-[10px] font-bold transition-colors',
                selected === style.id
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {style.name}
            </span>

            {selected === style.id && (
              <div
                className={cn(
                  'absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full shadow-sm animate-pulse',
                  style.color.replace('text-', 'bg-')
                )}
              />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

注意：文件顶部的 `styles` 数组（Kolors 的 6 种风格）**保持不变**，不要删除。

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/image/style-selector.tsx
git commit -m "feat(style-selector): 支持 model prop 按模型显示不同风格列表

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 5: SettingsPanel 支持 model prop 条件渲染

**Files:**

- Modify: `apps/web/src/components/image/settings-panel.tsx`

新增 `model` prop。当 model='agnes' 时，隐藏 Steps 和 CFG 滑块，显示 Quality 选择器。

- [ ] **Step 1: 修改 SettingsPanel**

在文件顶部新增导入：

```typescript
import { ASPECT_RATIOS, PARAM_CONSTRAINTS, AGNES_SIZE_OPTIONS, AGNES_QUALITIES, ImageModel } from '@/lib/constants/image-generation';
```

修改 Props 接口，新增 model 和 Agnes 专属参数：

```typescript
export interface SettingsPanelProps {
  model?: ImageModel;
  ratio: string;
  steps: number;
  cfg: number;
  seed: string;
  batchSize: number;
  quality?: string;
  onRatioChange: (ratio: string) => void;
  onStepsChange: (steps: number) => void;
  onCfgChange: (cfg: number) => void;
  onSeedChange: (seed: string) => void;
  onBatchSizeChange: (size: number) => void;
  onQualityChange?: (quality: string) => void;
}
```

修改组件函数签名和实现，在原有的宽高比选择区域后，条件渲染 Steps/CFG 或 Quality：

```typescript
export function SettingsPanel({
  model = 'kolors',
  ratio,
  steps,
  cfg,
  seed,
  batchSize,
  quality = 'standard',
  onRatioChange,
  onStepsChange,
  onCfgChange,
  onSeedChange,
  onBatchSizeChange,
  onQualityChange,
}: SettingsPanelProps) {
  // 根据模型选择尺寸列表
  const ratioOptions = model === 'agnes' ? AGNES_SIZE_OPTIONS : ASPECT_RATIOS;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-5 h-5 text-indigo-500" />
        <h3 className="font-bold text-slate-800 dark:text-white">参数配置</h3>
      </div>

      {/* 尺寸选择 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">画面比例</span>
          <span className="text-slate-900 dark:text-white font-mono text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            {ratioOptions.find((r) => r.id === ratio)?.label || ratio}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ratioOptions.slice(0, 4).map((item) => (
            <div key={item.id} className="relative group">
              <Button
                onClick={() => onRatioChange(item.id)}
                variant={ratio === item.id ? 'default' : 'outline'}
                className={cn(
                  'w-full h-auto py-2 flex flex-col items-center gap-1 transition-all duration-300 cursor-pointer overflow-hidden relative',
                  ratio === item.id
                    ? 'bg-blue-500 text-white shadow-md border-blue-500'
                    : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white hover:border-blue-300 dark:hover:border-slate-500 backdrop-blur-sm'
                )}
              >
                <span className="text-[10px] font-bold">{item.label}</span>
              </Button>
            </div>
          ))}
        </div>
        {/* 溢出项：如果超过 4 个尺寸选项，第二行显示 */}
        {ratioOptions.length > 4 && (
          <div className="grid grid-cols-4 gap-2">
            {ratioOptions.slice(4).map((item) => (
              <div key={item.id} className="relative group">
                <Button
                  onClick={() => onRatioChange(item.id)}
                  variant={ratio === item.id ? 'default' : 'outline'}
                  className={cn(
                    'w-full h-auto py-2 flex flex-col items-center gap-1 transition-all duration-300 cursor-pointer',
                    ratio === item.id
                      ? 'bg-blue-500 text-white shadow-md border-blue-500'
                      : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white hover:border-blue-300 dark:hover:border-slate-500 backdrop-blur-sm'
                  )}
                >
                  <span className="text-[10px] font-bold">{item.label}</span>
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 仅 Kolors: Steps 和 CFG */}
      {model === 'kolors' && (
        <>
          {/* 图片质量 Steps */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">生成质量 (Steps)</span>
              <span className="text-blue-600 dark:text-blue-400 font-mono font-bold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-[10px]">
                {steps}
              </span>
            </div>
            <div className="px-1">
              <Slider
                value={[steps]}
                max={PARAM_CONSTRAINTS.steps.max}
                min={PARAM_CONSTRAINTS.steps.min}
                step={PARAM_CONSTRAINTS.steps.step}
                onValueChange={(vals) => onStepsChange(vals[0])}
                className="py-2"
              />
            </div>
          </div>

          {/* Guidance Scale (CFG) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">引导强度 (CFG)</span>
              <span className="text-purple-600 dark:text-purple-400 font-mono font-bold bg-purple-50 dark:bg-purple-900/30 px-2 py-0.5 rounded text-[10px]">
                {cfg}
              </span>
            </div>
            <div className="px-1">
              <Slider
                value={[cfg]}
                max={PARAM_CONSTRAINTS.guidanceScale.max}
                min={PARAM_CONSTRAINTS.guidanceScale.min}
                step={PARAM_CONSTRAINTS.guidanceScale.step}
                onValueChange={(vals) => onCfgChange(vals[0])}
                className="py-2"
              />
            </div>
          </div>
        </>
      )}

      {/* 仅 Agnes: Quality 选择 */}
      {model === 'agnes' && (
        <div className="space-y-3">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">画质</span>
          <div className="grid grid-cols-2 gap-2">
            {AGNES_QUALITIES.map((q) => (
              <Button
                key={q.id}
                onClick={() => onQualityChange?.(q.id)}
                variant={quality === q.id ? 'default' : 'outline'}
                className={cn(
                  'h-9 text-xs font-bold rounded-xl transition-all',
                  quality === q.id
                    ? 'bg-indigo-500 text-white shadow-md border-indigo-500'
                    : 'bg-white/50 dark:bg-slate-800/50 hover:bg-white hover:border-indigo-300'
                )}
              >
                {q.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* 批量生成（共用） */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">生成数量</span>
        </div>
        <div className="grid grid-cols-4 gap-2 bg-slate-100/50 dark:bg-slate-900/50 p-1 rounded-xl backdrop-blur-sm border border-slate-200/50 dark:border-slate-700/50">
          {[1, 2, 3, 4].map((size) => (
            <Button
              key={size}
              onClick={() => onBatchSizeChange(size)}
              variant={batchSize === size ? 'default' : 'ghost'}
              className={cn(
                'text-xs h-7 font-bold transition-all duration-300 rounded-lg',
                batchSize === size
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5 dark:ring-white/5'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800/50'
              )}
            >
              {size}
            </Button>
          ))}
        </div>
      </div>

      {/* 种子输入（共用） */}
      <div className="space-y-3">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium flex items-center justify-between">
          <span>随机种子 (Seed)</span>
        </label>
        <div className="relative group">
          <Input
            type="text"
            value={seed}
            onChange={(e) => onSeedChange(e.target.value)}
            placeholder="留空为随机"
            className="w-full h-9 pl-3 pr-8 py-2 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-slate-200 dark:border-slate-700 text-xs font-mono focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500 transition-all"
          />
          <button
            onClick={() => onSeedChange(String(Math.floor(Math.random() * 1000000000)))}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer bg-transparent hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md"
            title="生成随机种子"
          >
            <Dice5 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/image/settings-panel.tsx
git commit -m "feat(settings-panel): 支持 model prop 条件渲染 Kolors/Agnes 参数

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 6: 新增模型切换器组件

**Files:**

- Create: `apps/web/src/components/image/model-switcher.tsx`

- [ ] **Step 1: 创建 ModelSwitcher 组件**

```typescript
'use client';

import { cn } from '@/lib/utils';
import { IMAGE_MODELS, ImageModel } from '@/lib/constants/image-generation';
import { Sparkles, Zap } from 'lucide-react';

export interface ModelSwitcherProps {
  model: ImageModel;
  onModelChange: (model: ImageModel) => void;
}

const modelIcons: Record<ImageModel, React.ReactNode> = {
  kolors: <Sparkles className="w-3.5 h-3.5" />,
  agnes: <Zap className="w-3.5 h-3.5" />,
};

export function ModelSwitcher({ model, onModelChange }: ModelSwitcherProps) {
  return (
    <div className="flex items-center rounded-xl bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm p-0.5 border border-slate-200/50 dark:border-slate-700/50">
      {IMAGE_MODELS.map((m) => (
        <button
          key={m.id}
          onClick={() => onModelChange(m.id)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-bold transition-all duration-300',
            model === m.id
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          {modelIcons[m.id]}
          {m.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -30
```

Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/image/model-switcher.tsx
git commit -m "feat(model-switcher): 新增图像模型切换器组件

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 7: 图片生成页面集成模型切换

**Files:**

- Modify: `apps/web/src/app/image/page.tsx`

这是核心集成步骤，将 model state、ModelSwitcher、条件参数渲染、API 调用分支全部串联起来。

- [ ] **Step 1: 修改 page.tsx 导入**

在文件顶部的导入区，新增以下导入（保留所有现有导入）：

```typescript
import { ModelSwitcher } from '@/components/image/model-switcher';
import { generateAgnesImage } from '@/lib/api/agnes';
import {
  DEFAULT_PARAMS,
  ASPECT_RATIO_TO_SIZE,
  STYLE_PROMPTS,
  PROMPT_TEMPLATES,
  AGNES_DEFAULT_PARAMS,
  ImageModel,
} from '@/lib/constants/image-generation';
```

新增 `quality` 状态和相关处理逻辑。

- [ ] **Step 2: 新增 model 和 quality state**

在现有 state 声明之后（约第 51 行 `batchSize` 之后），新增：

```typescript
// 模型选择
const [model, setModel] = useState<ImageModel>('kolors');
// Agnes 专属参数
const [quality, setQuality] = useState<string>(AGNES_DEFAULT_PARAMS.quality);
```

- [ ] **Step 3: 修改 handleGenerate 支持 Agnes 分支**

将现有的 `handleGenerate` useCallback 替换为支持双模型的版本。修改回调函数体中的生成逻辑部分（约第 63-140 行）：

```typescript
const handleGenerate = useCallback(async () => {
  setIsGenerating(true);
  setProgress(0);
  setError(null);
  setCurrentStep('准备生成...');

  try {
    if (model === 'kolors') {
      // Kolors 生成逻辑（现有逻辑保持不变）
      const styleConfig = STYLE_PROMPTS[style as keyof typeof STYLE_PROMPTS];
      const enhancedPrompt = styleConfig
        ? `${styleConfig.prefix}${prompt}${styleConfig.suffix}`
        : prompt;

      setCurrentStep('正在扩散生成...');
      setProgress(10);

      const response = await generateKolorsImage({
        prompt: enhancedPrompt,
        negativePrompt: negativePrompt || styleConfig?.negativePrompt,
        imageSize: ASPECT_RATIO_TO_SIZE[ratio],
        steps,
        guidanceScale: cfg,
        batchSize,
        seed: seed ? parseInt(seed) : undefined,
        style,
      });

      setProgress(80);
      setCurrentStep('下载图片...');

      const images = await Promise.all(
        response.images.map(async (img) => {
          const blob = await downloadImage(img.url);
          return {
            previewUrl: URL.createObjectURL(blob),
            historyUrl: await blobToDataUrl(blob),
          };
        })
      );
      const imageUrls = images.map((item) => item.previewUrl);

      setProgress(100);
      setCurrentStep('完成！');
      setGeneratedImages(imageUrls);
      setActiveImageIndex(0);

      if (images.length > 0) {
        const historyItem = {
          id: `image-${Date.now()}`,
          ...createImageHistoryItem(prompt, images[0].historyUrl, 'Kolors', {
            negativePrompt,
            style,
            aspectRatio: ratio,
            parameters: { steps, cfg, seed: seed || 'random', batchSize },
          }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addHistoryItem(historyItem);
      }
    } else {
      // Agnes 生成逻辑
      setCurrentStep('正在生成...');
      setProgress(10);

      const response = await generateAgnesImage({
        prompt,
        negativePrompt: negativePrompt || undefined,
        size: ratio, // Agnes 直接用 size 字符串
        n: batchSize,
        seed: seed ? parseInt(seed) : undefined,
        style: style || undefined,
        quality: quality as 'standard' | 'hd',
      });

      setProgress(80);
      setCurrentStep('下载图片...');

      const images = await Promise.all(
        response.images.map(async (img) => {
          const blob = await downloadImage(img.url);
          return {
            previewUrl: URL.createObjectURL(blob),
            historyUrl: await blobToDataUrl(blob),
          };
        })
      );
      const imageUrls = images.map((item) => item.previewUrl);

      setProgress(100);
      setCurrentStep('完成！');
      setGeneratedImages(imageUrls);
      setActiveImageIndex(0);

      if (images.length > 0) {
        const historyItem = {
          id: `image-${Date.now()}`,
          ...createImageHistoryItem(prompt, images[0].historyUrl, 'Agnes Image 2.1 Flash', {
            negativePrompt,
            style,
            aspectRatio: ratio,
            parameters: { quality, seed: seed || 'random', batchSize },
          }),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addHistoryItem(historyItem);
      }
    }

    // 稍后重置生成状态
    setTimeout(() => {
      setIsGenerating(false);
      setProgress(0);
      setCurrentStep('');
    }, 1000);
  } catch (err) {
    console.error('Generation error:', err);
    setError(err instanceof Error ? err.message : '生成失败，请重试');
    setIsGenerating(false);
    setProgress(0);
    setCurrentStep('');
  }
}, [prompt, negativePrompt, style, ratio, steps, cfg, seed, batchSize, model, quality, addHistoryItem]);
```

- [ ] **Step 4: 修改 handleQuickStart 和模型切换时的参数重置**

在 quickStarts 定义后，新增模型切换时的参数重置逻辑：

```typescript
// 模型切换时重置相关参数
const handleModelChange = useCallback((newModel: ImageModel) => {
  setModel(newModel);
  if (newModel === 'agnes') {
    setStyle(AGNES_DEFAULT_PARAMS.style);
    setRatio(AGNES_DEFAULT_PARAMS.size);
    setQuality(AGNES_DEFAULT_PARAMS.quality);
  } else {
    setStyle(DEFAULT_PARAMS.style);
    setRatio(DEFAULT_PARAMS.aspectRatio);
    setSteps(DEFAULT_PARAMS.steps);
    setCfg(DEFAULT_PARAMS.guidanceScale);
  }
  setBatchSize(DEFAULT_PARAMS.batchSize);
  setSeed('');
}, []);
```

- [ ] **Step 5: 修改 renderParameterPanel 函数**

在 `renderParameterPanel` 函数中，给 StyleSelector 和 SettingsPanel 传入 `model` prop：

找到 `<StyleSelector selected={style} onStyleChange={setStyle} />` 改为：

```tsx
<StyleSelector selected={style} onStyleChange={setStyle} model={model} />
```

找到 `<SettingsPanel ...>` 改为传入 model 和 Agnes 参数：

```tsx
<SettingsPanel
  model={model}
  ratio={ratio}
  steps={steps}
  cfg={cfg}
  seed={seed}
  batchSize={batchSize}
  quality={quality}
  onRatioChange={setRatio}
  onStepsChange={setSteps}
  onCfgChange={setCfg}
  onSeedChange={setSeed}
  onBatchSizeChange={setBatchSize}
  onQualityChange={setQuality}
/>
```

- [ ] **Step 6: 在 header 中插入 ModelSwitcher**

找到 header 区域（约第 266 行），在 Badge 旁边插入模型切换器：

```tsx
<header className="...">
  <div>
    <h1 className="...">
      Ai 创作工坊
      <Badge ...>
        READY
      </Badge>
    </h1>
  </div>
  <div className="flex items-center gap-3">
    {/* 模型切换器 */}
    <ModelSwitcher model={model} onModelChange={handleModelChange} />
    {/* 移动端参数设置按钮 */}
    <Button
      type="button"
      variant="outline"
      aria-label="打开参数面板"
      onClick={() => setShowMobileSettings(true)}
      className="lg:hidden ..."
    >
      <Pencil className="w-4 h-4 mr-2" />
      参数设置
    </Button>
  </div>
</header>
```

- [ ] **Step 7: 验证编译**

```bash
cd apps/web && npx tsc --noEmit --pretty 2>&1 | head -50
```

Expected: 无新增错误。

- [ ] **Step 8: 验证页面能正常渲染（开发环境）**

```bash
pnpm dev:web
```

Expected: 页面能正常加载，Kolors 模型默认选中，所有功能正常。切换到 Agnes Flash 后，风格列表变为 3 种，Steps/CFG 滑块消失，Quality 选择器出现。

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/image/page.tsx
git commit -m "feat(image-page): 集成 Agnes Image 2.1 Flash 模型切换

- 新增 model state 和模型切换器
- handleGenerate 支持 Kolors/Agnes 双分支
- 参数面板按模型动态显示/隐藏
- 模型切换时自动重置默认参数

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>"
```

---

### Task 8: 环境变量配置

**Files:**

- Modify: `apps/web/.env.local`

提醒用户添加 Agnes API Key。

- [ ] **Step 1: 在 .env.local 中添加注解**

用户手动在 `apps/web/.env.local` 末尾添加：

```bash
# Agnes Image API
AGNES_API_KEY=sk-U1RlABPN0FLzkwkTAhBTkICpMt1dydHnB2F0MOcAEz5E8wDr
```

注意：这是用户配置步骤，不自动修改 `.env.local`（避免覆盖敏感配置）。

---

## 验证清单

实施完成后，按以下步骤验证：

1. **Kolors 功能不受影响**: 默认打开页面 → Kolors 选中 → 输入 prompt → 生成 → 结果正常
2. **模型切换**: 点击 "Agnes Flash" → 风格列表变为 3 种 → Steps/CFG 滑块消失 → Quality 选择器出现
3. **Agnes 生成**: 输入 prompt → 选择风格 → 选择画质 → 点击生成 → 结果正常
4. **历史记录**: 生成后历史记录中显示正确的模型名（"Agnes Image 2.1 Flash"）
5. **移动端**: 窄屏下模型切换器与"参数设置"按钮共存
6. **错误处理**: Agnes API Key 未配置时显示友好错误提示
7. **类型检查**: `pnpm typecheck` 通过
