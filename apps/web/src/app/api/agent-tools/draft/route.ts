/**
 * 自然语言生成 Webhook 工具草稿 API（ADR-0015 / P1 工单 03）
 *
 * 接口契约：
 * - POST /api/agent-tools/draft
 *   入参：{ prompt: string }
 *   出参：{ draft: AgentToolDraft }
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { validateWebhookUrl } from '@/lib/webhook/validation';
import { CALL_NAME_REGEX } from '@/schemas/agent-tool-constants';
import { createProvider } from '@repo/providers';
import { generateText } from 'ai';

export interface AgentToolDraft {
  name: string;
  callName: string;
  description: string;
  method: 'GET' | 'POST';
  url: string;
  params: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean';
    required: boolean;
    description: string;
  }>;
  headersGuide?: string;
  securityWarning?: string;
}

const SYSTEM_PROMPT = `
你是一个专业的 API 工具设计专家。用户会提供一段关于工具功能的自然语言描述，请将其转化为符合 OpenAPI/Webhook 规范的标准结构化工具草稿 JSON。

必须严格返回纯 JSON，不包含 Markdown 标记（不要包裹 \`\`\`json 标记）：
{
  "name": "简明中文工具名称（如：查询手机号码归属地）",
  "callName": "合法的英文标识符，以小写字母开头，只含小写字母、数字和下划线，长度3-25字符（如：query_phone_location）",
  "description": "详细说明工具用途与适用场景，以便大模型决策时调用（中文，50-200字）",
  "method": "POST或GET",
  "url": "合法的公开 HTTPS 接口地址，若用户未指定，请给出标准的示例占位 URL（如：https://api.example.com/phone/query）",
  "params": [
    {
      "name": "参数英文名（字母下划线）",
      "type": "string" | "number" | "boolean",
      "required": true,
      "description": "参数中文含义"
    }
  ],
  "headersGuide": "建议的鉴权配置指导，例如：需要在请求头中填入目标平台的 API_KEY"
}
`.trim();

/** 基于规则的离线兜底提取器（当 LLM 不可用时确保服务稳定降级） */
function fallbackRuleExtractor(prompt: string): Partial<AgentToolDraft> {
  const isWeather = /天气|气温|气候/.test(prompt);
  const isExpress = /快递|物流|单号/.test(prompt);
  const isPhone = /手机|归属地|电话|运营商/.test(prompt);

  if (isWeather) {
    return {
      name: '天气查询工具',
      callName: 'query_weather',
      description: '输入城市名称查询实时天气温度与天气状况',
      method: 'POST',
      url: 'https://api.example.com/weather',
      params: [
        { name: 'city', type: 'string', required: true, description: '城市中文名或拼音' },
      ],
      headersGuide: '请填入开放天气平台的 API 密钥',
    };
  }

  if (isExpress) {
    return {
      name: '快递物流查询',
      callName: 'track_express',
      description: '输入快递单号查询当前最新物流跟踪轨迹',
      method: 'POST',
      url: 'https://api.example.com/express/track',
      params: [
        { name: 'tracking_number', type: 'string', required: true, description: '快递单号' },
      ],
      headersGuide: '请在请求头填入物流查询服务的鉴权 Token',
    };
  }

  if (isPhone) {
    return {
      name: '手机归属地查询',
      callName: 'query_phone',
      description: '输入 11 位手机号码查询所属省份城市及运营商归属',
      method: 'GET',
      url: 'https://api.example.com/phone/lookup',
      params: [
        { name: 'phone', type: 'string', required: true, description: '11位手机号码' },
      ],
      headersGuide: '公开查询接口，或在此填入服务平台 Secret',
    };
  }

  return {
    name: prompt.slice(0, 15) || '自定义查询工具',
    callName: 'custom_query',
    description: `根据用户描述创建的自动化接口：${prompt.slice(0, 80)}`,
    method: 'POST',
    url: 'https://api.example.com/api',
    params: [
      { name: 'keyword', type: 'string', required: true, description: '查询关键字' },
    ],
    headersGuide: '请核对并配置目标 API 的请求头鉴权凭据',
  };
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    let body: { prompt?: string };
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      return ApiError.badRequest('请输入工具功能描述');
    }
    if (prompt.length > 500) {
      return ApiError.badRequest('工具功能描述不能超过 500 个字符');
    }

    let parsedDraft: Partial<AgentToolDraft> | null = null;

    // 尝试调用 LLM 生成结构化草稿
    try {
      const aiProvider = createProvider('doubao');
      const model = aiProvider('doubao-seed-evolving');
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        prompt: `请将以下用户需求转化为结构化工具配置 JSON：\n${prompt}`,
        temperature: 0.1,
      });

      // 剔除可能包含的 markdown 标签
      const cleaned = result.text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      parsedDraft = JSON.parse(cleaned);
    } catch (llmErr) {
      console.warn('[agent-tools-draft] 模型结构化生成降级为规则推断:', llmErr);
      parsedDraft = fallbackRuleExtractor(prompt);
    }

    if (!parsedDraft) {
      parsedDraft = fallbackRuleExtractor(prompt);
    }

    // 字段标准化与安全收敛
    const name = (parsedDraft.name || '自定义工具').slice(0, 30);
    let callName = (parsedDraft.callName || 'custom_tool')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/^[^a-z]+/, '')
      .slice(0, 30);

    if (!CALL_NAME_REGEX.test(callName)) {
      callName = `tool_${Math.random().toString(36).substring(2, 8)}`;
    }

    // 冲突排查：若当前用户已有同名 callName，自增数字后缀自愈
    const existingTools = await prisma.userWebhookTool.findMany({
      where: { userId: user.id },
      select: { callName: true },
    });
    const existingNames = new Set(existingTools.map((t) => t.callName));
    if (existingNames.has(callName)) {
      let suffix = 2;
      while (existingNames.has(`${callName}_${suffix}`)) {
        suffix++;
      }
      callName = `${callName}_${suffix}`.slice(0, 31);
    }

    const description = (parsedDraft.description || `${name}描述`).slice(0, 500);
    const method = parsedDraft.method === 'GET' ? 'GET' : 'POST';

    // 安全守卫（Seam）：强制通过 validateWebhookUrl
    let url = parsedDraft.url || 'https://api.example.com/api';
    let securityWarning: string | undefined;
    const urlValidation = validateWebhookUrl(url);

    if (!urlValidation.ok) {
      // 存在内网 IP 或非 https：坚决置换为公开占位符并给出醒目警告
      url = 'https://api.example.com/api';
      securityWarning = '检测到不安全的私有地址，已置换为公开占位符，请填入合法的公网 HTTPS 接口';
    }

    // 参数列表规格收敛
    const rawParams = Array.isArray(parsedDraft.params) ? parsedDraft.params : [];
    const params = rawParams
      .slice(0, 10)
      .map((p) => {
        const paramName = (typeof p.name === 'string' ? p.name : 'param')
          .trim()
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .slice(0, 64);
        const type: 'string' | 'number' | 'boolean' =
          p.type === 'number' || p.type === 'boolean' ? p.type : 'string';
        const required = Boolean(p.required);
        const desc = typeof p.description === 'string' ? p.description.slice(0, 200) : '';
        return {
          name: paramName || 'query',
          type,
          required,
          description: desc,
        };
      });

    const finalDraft: AgentToolDraft = {
      name,
      callName,
      description,
      method,
      url,
      params,
      headersGuide: parsedDraft.headersGuide || '若该接口需要 Token 或 API Key，请在下方鉴权请求头中配置',
      ...(securityWarning ? { securityWarning } : {}),
    };

    return createSuccessResponse({ draft: finalDraft });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[agent-tools-draft] 生成失败:', error);
    return ApiError.internalError('生成工具草稿失败，请稍后重试');
  }
}
