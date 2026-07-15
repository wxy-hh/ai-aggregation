/**
 * 跨模态单引用接力 — 目标能力注册表
 *
 * 设计 §10 内容与目标映射：
 * | 来源类型     | 对话     | 图像             | 语音   | 视频       | 命理         |
 * | 对话文本     | 上下文   | Prompt           | 不支持 | 视频描述   | 问题或背景   |
 * | 语音转写     | 上下文   | Prompt           | 不支持 | 视频描述   | 问题或背景   |
 * | 生成图片     | 图片附件 | 参考图或再次绘图 | 不支持 | 参考图     | 首版不支持   |
 * | 生成视频     | 视频附件 | 首版不支持       | 不支持 | 再次创作   | 首版不支持   |
 * | 命理报告段落 | 上下文   | Prompt           | 不支持 | 视频描述   | 命理追问     |
 *
 * 语音模块首版仅作为来源，不作为目标。本表只描述能力，不推荐/排序由 UI 层处理。
 */

import type { RelayContentType, RelayModule } from '@repo/shared';
import type { RelaySourceCapability, RelayTargetOption } from './types';

/** §10 映射表的机器可读形式 */
const SOURCE_CAPABILITY: RelaySourceCapability = {
  text: [
    { targetModule: 'chat', targetRole: 'context', field: 'chat_context', label: '在对话中继续' },
    { targetModule: 'image', targetRole: 'prompt', field: 'image_prompt', label: '作为图像 Prompt' },
    { targetModule: 'video', targetRole: 'prompt', field: 'video_description', label: '作为视频描述' },
    { targetModule: 'destiny', targetRole: 'question', field: 'destiny_pending', label: '请命理解读' },
  ],
  transcript: [
    { targetModule: 'chat', targetRole: 'context', field: 'chat_context', label: '在对话中继续' },
    { targetModule: 'image', targetRole: 'prompt', field: 'image_prompt', label: '作为图像 Prompt' },
    { targetModule: 'video', targetRole: 'prompt', field: 'video_description', label: '作为视频描述' },
    { targetModule: 'destiny', targetRole: 'question', field: 'destiny_pending', label: '请命理解读' },
  ],
  image: [
    { targetModule: 'chat', targetRole: 'context', field: 'chat_context', label: '在对话中分析' },
    { targetModule: 'image', targetRole: 'reference_image', field: 'image_reference', label: '作为参考图' },
    { targetModule: 'image', targetRole: 'prompt', field: 'image_prompt', label: '再次绘图' },
    { targetModule: 'video', targetRole: 'reference_image', field: 'video_reference_image', label: '作为视频参考图' },
  ],
  video: [
    { targetModule: 'chat', targetRole: 'context', field: 'chat_context', label: '在对话中分析' },
    { targetModule: 'video', targetRole: 'prompt', field: 'video_description', label: '再次创作' },
  ],
  destiny_report_section: [
    { targetModule: 'chat', targetRole: 'context', field: 'chat_context', label: '在对话中继续' },
    { targetModule: 'image', targetRole: 'prompt', field: 'image_prompt', label: '作为图像 Prompt' },
    { targetModule: 'video', targetRole: 'prompt', field: 'video_description', label: '作为视频描述' },
    { targetModule: 'destiny', targetRole: 'background', field: 'destiny_pending', label: '命理追问' },
  ],
};

/**
 * 取某来源类型可用的接力目标列表（按 §10 能力过滤）。
 * 纯函数，不调模型；不支持的目标不出现在结果中。
 *
 * @param sourceType 来源内容类型
 * @param excludeModule 可选：排除来源自身模块外的某目标（一般不排除，自接力如「再次绘图」是合法目标）
 */
export function getAvailableTargets(
  sourceType: RelayContentType,
  excludeModule?: RelayModule,
): RelayTargetOption[] {
  const caps = SOURCE_CAPABILITY[sourceType] ?? [];
  return caps
    .filter((c) => (excludeModule ? c.targetModule !== excludeModule : true))
    .map((c) => ({
      targetModule: c.targetModule,
      targetRole: c.targetRole,
      label: c.label,
      field: c.field,
    }));
}
