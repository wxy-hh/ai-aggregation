/**
 * Image Generation Constants
 * Mappings and configurations for Kolors image generation
 */

// Aspect ratio to actual size mapping
export const ASPECT_RATIO_TO_SIZE: Record<string, string> = {
  '1:1': '1024x1024', // Square
  '3:4': '768x1024', // Portrait
  '4:3': '1024x768', // Landscape (traditional)
  '16:9': '1024x576', // Widescreen
  '9:16': '576x1024', // Mobile portrait
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
  { id: '9:16', label: '9:16', title: '竖屏视频', size: '576×1024', icon: 'mobile' },
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

// Prompt templates for inspiration
export const PROMPT_TEMPLATES = [
  '一只在霓虹灯雨夜中行走的赛博格猫咪，毛发呈现金属光泽，背景是高耸的摩天大楼',
  '未来主义城市景观，飞行汽车穿梭其间，全息广告牌闪烁，日落时分',
  '神秘的森林深处，发光的蘑菇和萤火虫，月光透过树叶洒下',
  '宇宙空间站内部，宇航员漂浮在失重环境中，地球在窗外',
  '蒸汽朋克风格的机械龙，齿轮和蒸汽管道，维多利亚时代背景',
] as const;
