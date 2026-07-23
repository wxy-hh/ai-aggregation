/**
 * Image Generation Constants
 * Mappings and configurations for Kolors and Agnes image generation
 */

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
  quality: 'standard' as (typeof AGNES_QUALITIES)[number]['id'],
  n: 1,
} as const;

// 模型选择器选项
export const IMAGE_MODELS = [
  { id: 'kolors' as ImageModel, label: 'Kolors', description: 'Kolors 模型' },
  { id: 'agnes' as ImageModel, label: 'Agnes Flash', description: 'Agnes Image 2.1 Flash' },
] as const;

// Aspect ratio to actual size mapping
export const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024', // Square
  '3:4': '768x1024', // Portrait
  '4:3': '1024x768', // Landscape (traditional)
  '16:9': '1024x576', // Widescreen
  '3:2': '1024x683', // Photography standard
} as const;

// Style to prompt enhancement mapping
export const STYLE_PROMPTS: Record<
  string,
  { prefix: string; suffix: string; negativePrompt?: string }
> = {
  '3d-render': {
    prefix: '3D rendered, ',
    suffix: ', octane render, high quality 3D, volumetric lighting, detailed textures',
    negativePrompt: 'flat, 2D, low poly, pixelated',
  },
  realistic: {
    prefix: 'photorealistic, ',
    suffix:
      ', 8k resolution, ultra detailed, professional photography, sharp focus, natural lighting',
    negativePrompt: 'cartoon, anime, painting, illustration, artificial',
  },
  anime: {
    prefix: 'anime style, ',
    suffix: ', manga illustration, vibrant colors, cel shaded, detailed linework, expressive',
    negativePrompt: 'realistic, photographic, 3D render',
  },
  landscape: {
    prefix: 'landscape photography, ',
    suffix: ', natural scenery, wide angle, beautiful vista, atmospheric, scenic',
    negativePrompt: 'portrait, close-up, indoor, urban',
  },
  cyberpunk: {
    prefix: 'cyberpunk style, ',
    suffix:
      ', neon lights, futuristic city, high tech, low life, vibrant colors, cinematic lighting, volumetric fog',
    negativePrompt: 'daytime, natural, rustic, historical',
  },
  'oil-painting': {
    prefix: 'oil painting style, ',
    suffix:
      ', textured brushstrokes, classical art, impasto, masterpiece, vivid colors, artistic',
    negativePrompt: 'photo, realistic, 3D, digital art, smooth',
  },
} as const;

// Aspect ratio options for UI
export const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1', title: '正方形', size: '1024×1024', icon: 'square' },
  { id: '3:4', label: '3:4', title: '竖屏', size: '768×1024', icon: 'portrait' },
  { id: '16:9', label: '16:9', title: '横屏', size: '1024×576', icon: 'landscape' },
] as const;

// Generation quality presets
export const QUALITY_PRESETS = {
  draft: { steps: 20, label: '草稿', description: '快速预览' },
  standard: { steps: 30, label: '标准', description: '平衡质量' },
  high: { steps: 40, label: '高质量', description: '精细细节' },
  ultra: { steps: 50, label: '超高', description: '最佳效果' },
} as const;

// Default generation parameters
export const DEFAULT_PARAMS = {
  steps: 30,
  guidanceScale: 7.5,
  batchSize: 1,
  aspectRatio: '16:9',
  style: '3d-render',
} as const;

// Parameter constraints
export const PARAM_CONSTRAINTS = {
  steps: { min: 20, max: 50, step: 1 },
  guidanceScale: { min: 1, max: 20, step: 0.5 },
  batchSize: { min: 1, max: 4, step: 1 },
} as const;

// Common negative prompts
export const COMMON_NEGATIVE_PROMPTS = [
  'blurry, low quality, distorted, deformed',
  'ugly, bad anatomy, bad proportions',
  'watermark, signature, text, logo',
  'oversaturated, overexposed, underexposed',
  'duplicate, cropped, out of frame',
] as const;

/** 预览区最大宽度（px） */
const PREVIEW_MAX_WIDTH = 640;
/** 预览区最大高度（px），竖屏比例会优先受此约束 */
const PREVIEW_MAX_HEIGHT = 560;

/** 将比例 ID（1:1 或 1024x1024）转为 CSS aspect-ratio 值 */
export function resolveAspectRatioCss(ratioId: string): string {
  // 从已有映射推导（'1:1' → '1024x1024' → '1024 / 1024'）
  const pixelSize = ASPECT_RATIO_TO_SIZE[ratioId];
  if (pixelSize) {
    return pixelSize.replace('x', ' / ');
  }
  // 直接传入像素格式（'1024x1024' → '1024 / 1024'）
  const css = ratioId.replace('x', ' / ');
  return css !== ratioId ? css : '16 / 9';
}

function parseAspectRatioNumeric(cssRatio: string): number {
  const [w, h] = cssRatio.split('/').map((s) => Number.parseFloat(s.trim()));
  if (!w || !h) return 16 / 9;
  return w / h;
}

/** 获取比例的人类可读标签（1:1、16:9 等） */
export function getRatioLabel(ratioId: string): string {
  const agnes = AGNES_SIZE_OPTIONS.find((r) => r.id === ratioId);
  if (agnes) return agnes.label;
  const kolors = ASPECT_RATIOS.find((r) => r.id === ratioId);
  return kolors?.label ?? ratioId;
}

/**
 * 预览框样式：在固定边界内按宽高比自适应
 * 横屏受 maxWidth 约束，竖屏受 maxHeight 约束，避免无脑等比放大缩小
 */
export function getImagePreviewBoxStyle(ratioId: string): {
  width: string;
  maxWidth: string;
  aspectRatio: string;
} {
  const aspectRatio = resolveAspectRatioCss(ratioId);
  const numericRatio = parseAspectRatioNumeric(aspectRatio);

  let width = PREVIEW_MAX_WIDTH;
  const height = width / numericRatio;

  if (height > PREVIEW_MAX_HEIGHT) {
    width = PREVIEW_MAX_HEIGHT * numericRatio;
  }

  return {
    width: '100%',
    maxWidth: `${Math.round(width)}px`,
    aspectRatio,
  };
}

// Prompt templates for inspiration
export const PROMPT_TEMPLATES = [
  '一只在霓虹灯雨夜中行走的赛博格猫咪，毛发呈现金属光泽，背景是高耸的摩天大楼',
  '未来主义城市景观，飞行汽车穿梭其间，全息广告牌闪烁，日落时分',
  '神秘的森林深处，发光的蘑菇和萤火虫，月光透过树叶洒下',
  '宇宙空间站内部，宇航员漂浮在失重环境中，地球在窗外',
  '蒸汽朋克风格的机械龙，齿轮和蒸汽管道，维多利亚时代背景',
] as const;
