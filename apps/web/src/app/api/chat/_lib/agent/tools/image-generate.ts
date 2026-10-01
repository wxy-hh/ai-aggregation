/**
 * image_generate 工具（spec §6.1）
 *
 * 复用平台既有 Agnes 文生图能力：服务端直调上游，不走自己的 HTTP 接口、不重复计费
 * （计费已在 agent 请求的 chat-agent 一口价内）。
 *
 * 与 spec 的一处偏差（有意）：**不开放 style 参数**。原因是上游文生图队列不接收
 * style 字段（现有 /api/image/agnes 亦未透传，见该路由注释），风格交由模型在 prompt
 * 中自然表达，比枚举更灵活也更准。尺寸仍沿用现有枚举。
 */

import { z } from 'zod';
import { AGNES_DEFAULT_PARAMS, AGNES_SIZE_OPTIONS } from '@/lib/constants/image-generation';
import { AgnesUpstreamError, requestAgnesImage } from '@/lib/services/agnes-image';
import { AGENT_IMAGE_TOOL_TIMEOUT_MS } from '../agent-config';
import { detectChatSensitiveTopic } from '../../chat-safety';
import { ToolError, type AgentToolSpec, type ToolExecutionResult } from './registry';

/** 从常量派生尺寸枚举（保持与图像生成页同一份真源） */
const SIZE_IDS = AGNES_SIZE_OPTIONS.map((option) => option.id) as [string, ...string[]];

export function createImageGenerateTool(): AgentToolSpec {
  return {
    name: 'image_generate',
    description:
      '根据文字描述生成一张图片，生成结果会直接展示给用户。当用户要求画图、生成图像、创作插画或需要视觉内容时使用。',
    parameters: z.object({
      prompt: z
        .string()
        .min(1)
        .describe('图片的详细描述，建议包含主体、场景、风格、光线与氛围等要素'),
      size: z
        .enum(SIZE_IDS)
        .optional()
        .describe('图片尺寸，默认 1024x1024（正方形）；可选竖屏 768x1024、横屏 1024x768、宽屏 1024x576'),
    }),
    // 出图耗时量级远高于其它工具（上游实测 10.7–13.9s），单独声明预算
    timeoutMs: AGENT_IMAGE_TOOL_TIMEOUT_MS,
    async execute(args, ctx): Promise<ToolExecutionResult> {
      const { prompt, size } = args as { prompt: string; size?: string };

      // 生成前合规检查：命中即拒绝生成（避免产出违规图像）
      const topic = detectChatSensitiveTopic(prompt);
      if (topic) {
        throw new ToolError('这个描述不符合内容安全规范，我无法生成这张图片');
      }

      let generated: { url: string };
      try {
        generated = await requestAgnesImage(
          {
            prompt,
            size: size || AGNES_DEFAULT_PARAMS.size,
          },
          ctx.signal
        );
      } catch (error) {
        // 注意：这里**不做**取消判定。交给本工具的 signal 是派生信号
        // （用户中断或 policy 超时都会 abort 它），工具自行用 `ctx.signal.aborted`
        // 判断会把「超时」误报成「已取消」。取消/超时的区分统一由 tool-policy 给出。
        if (error instanceof AgnesUpstreamError) {
          if (error.status === 429 || error.status === 503) {
            throw new ToolError('图片生成服务暂时繁忙，请稍后重试');
          }
          throw new ToolError(
            `图片生成失败${error.status ? `（上游 ${error.status}）` : ''}，请稍后重试`
          );
        }
        throw error;
      }

      return {
        ok: true,
        contentForModel: `图片已生成并展示给用户（图片地址：${generated.url}）。请用一两句自然语言说明这张图的内容，不要重复输出图片地址或 Markdown 图片语法。`,
        summaryForDisplay: `已生成图片：${prompt.slice(0, 40)}${prompt.length > 40 ? '…' : ''}`,
        attachment: { kind: 'image', url: generated.url },
      };
    },
  };
}
