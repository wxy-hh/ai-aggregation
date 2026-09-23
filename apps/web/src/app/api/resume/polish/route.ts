import { PolishRequestSchema } from '@/schemas/resume-editor.schema';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { getResumeAiTimeoutMs } from '@/lib/resume/ai-timeout';
import { withQuotaUnary } from '@/lib/billing/with-quota-unary';

class ResumePolishError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = 'ResumePolishError';
  }
}

/**
 * POST /api/resume/polish
 * 简历文本润色 API
 * 使用 Doubao-Seed-2.0-Pro (火山方舟 ARK) 进行智能优化
 */

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();

      const validationResult = PolishRequestSchema.safeParse(body);

      if (!validationResult.success) {
        const errors = validationResult.error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));

        return new Response(
          JSON.stringify({ error: '请求参数校验失败', details: errors }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const {
        target,
        text,
        context,
        style = 'professional',
        language = 'zh-CN',
      } = validationResult.data;

      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
      const arkModel = process.env.ARK_MODEL || 'doubao-seed-evolving';

      if (!arkApiKey) {
        return new Response(JSON.stringify({ error: 'AI 服务配置错误' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const systemPrompt = buildSystemPrompt(style, language);
      const userPrompt = buildUserPrompt(text, context, target);
      const requestId = getBillingRequestId(req, body as Record<string, unknown>);

      const resultData = await withQuotaUnary({
        reserve: {
          userId: user.id,
          requestId,
          feature: 'resume',
          provider: 'doubao',
          model: arkModel,
          messages: [{ content: systemPrompt }, { content: userPrompt }],
          maxOutputTokens: 800,
          metadata: { target, textLength: text.length, style, language },
        },
        userRole: user.role,
        finalize: {
          requestId,
          action: 'resume-polish',
          endpoint: '/api/resume/polish',
          userId: user.id,
          feature: 'resume',
          provider: 'doubao',
          model: arkModel,
          metadata: { target, textLength: text.length, style, language },
        },
        run: async (session) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), getResumeAiTimeoutMs());

          let result: any;
          try {
            const response = await fetch(`${arkBaseUrl}/responses`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${arkApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model: arkModel,
                input: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt },
                ],
                max_output_tokens: session.outputLimit,
                temperature: 0.7,
                top_p: 0.9,
                reasoning: { effort: 'minimal' },
              }),
              signal: controller.signal,
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error('[resume/polish] ARK API 错误:', response.status, errorText);

              if (response.status === 429) {
                throw new ResumePolishError('请求过于频繁，请稍后再试', 429);
              }

              throw new ResumePolishError('AI 服务暂时不可用', 500);
            }

            result = await response.json();
          } finally {
            clearTimeout(timeoutId);
          }

          const optimizedText = extractOptimizedText(result);
          const highlights = extractHighlights(optimizedText, text);

          return {
            value: { optimizedText, highlights },
            usage: result.usage ?? result.response?.usage,
            outputText: optimizedText,
          };
        },
      });

      return new Response(JSON.stringify(resultData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error instanceof ResumePolishError) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: error.statusCode,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (error instanceof BillingError) return billingErrorResponse(error);

      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return new Response(JSON.stringify({ error: error.message }), { status: 403 });
        }
        return new Response(JSON.stringify({ error: error.message }), { status: 401 });
      }

      if (error instanceof Error && error.name === 'AbortError') {
        return new Response(JSON.stringify({ error: '请求超时，请重试' }), { status: 408 });
      }

      console.error('[resume/polish] 错误:', error);
      return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
    }
  });
}

// ---- 以下辅助函数保持不变 ----

function buildSystemPrompt(style: string, language: string): string {
  return `你是简历优化助手。根据用户的简短描述，扩展并丰富内容，补充合理的细节。

重要：直接输出优化后的文本，不要输出思考过程、不要解释、不要分析。

输出格式要求：
- 必须使用列表格式（1. 2. 3.）呈现内容
- 每个要点独立成行，条理清晰
- 每条内容要凝练简洁，一句话说清一个技能点
- 可以根据内容拆分或合并条目，不必与原文条数一致
- 如果原文内容较少，可以适当扩展为多条；如果原文冗长，可以精简合并

优化策略:
1. 凝练表达：每条控制在 20-40 字，突出核心能力
2. 拆分技能：将复杂技能拆分为多个独立要点
3. 补充细节：添加具体的技术栈、工具、场景
4. 量化成果：补充合理的数据（如项目数量、覆盖场景等）
5. 动词开头：使用"掌握"、"熟练运用"、"精通"等专业动词
6. 保持真实：不夸大，补充的内容要合理可信
7. ${style === 'professional' ? '专业正式' : '简洁清晰'}风格

示例 1（拆分扩展）：
输入：熟悉 Vue.js 与 React.js 两大前端框架
输出：
1. 熟练掌握 Vue.js 框架，精通 Vue Router、Pinia/Vuex 状态管理
2. 熟练掌握 React.js 及 Hooks 开发模式
3. 熟悉 React Router、Redux Toolkit 等生态工具
4. 结合 Ant Design、Material UI 完成企业级项目开发
5. 参与过大型数据可视化平台与后台管理系统开发

示例 2（精简合并）：
输入：会用 vue，做过一些项目，用过 vue-router 和 vuex，还用过 element-ui 组件库，做过后台管理系统
输出：
1. 掌握 Vue.js 全家桶（Vue Router、Vuex）
2. 熟悉 Element UI 组件库，完成过后台管理系统开发
3. 可独立完成中小型前端项目

示例 3（技能拆分）：
输入：做过后端开发，用过 Node.js 和数据库
输出：
1. 具备 Node.js 后端开发经验
2. 熟悉 Express/Koa 框架，完成过 RESTful API 设计
3. 掌握 MySQL/MongoDB 数据库设计与优化
4. 了解后端业务逻辑开发与接口联调`;
}

function buildUserPrompt(
  text: string,
  context?: { position?: string; industry?: string; company?: string },
  target?: string
): string {
  let prompt = `请扩展并优化以下简历内容，补充合理的细节和具体技术栈，直接输出结果：\n\n${text}`;
  if (context) {
    const parts: string[] = [];
    if (context.position) parts.push(context.position);
    if (context.industry) parts.push(context.industry);
    if (context.company) parts.push(context.company);
    if (parts.length > 0) prompt += `\n\n参考背景：${parts.join('，')}`;
  }
  return prompt;
}

function extractOptimizedText(result: any): string {
  if (Array.isArray(result.output)) {
    for (const item of result.output) {
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'text' && c.text) return c.text.trim();
          if (c.text) return c.text.trim();
        }
        if (item.text) return item.text.trim();
      }
    }
    for (const item of result.output) {
      if (item.type === 'reasoning' || item.type === 'summary' || item.role === 'system') continue;
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c.type === 'text' && c.text) return c.text.trim();
          if (c.text) return c.text.trim();
        }
      }
      if (item.text) return item.text.trim();
    }
  }
  if (result.output && typeof result.output === 'object' && !Array.isArray(result.output)) {
    if (result.output.text) return result.output.text.trim();
  }
  if (typeof result === 'string') return result.trim();
  if (result.status === 'incomplete') {
    return '[响应未完成] 模型输出被截断，请尝试缩短输入文本或稍后重试';
  }
  return '[解析失败] 无法从响应中提取文本内容';
}

function extractHighlights(optimizedText: string, originalText: string): string[] {
  const highlights: string[] = [];
  const hasNumbers = /\d+%|\d+[万千百十]|\d+[个项次]/.test(optimizedText);
  const originalHasNumbers = /\d+%|\d+[万千百十]|\d+[个项次]/.test(originalText);
  if (hasNumbers && !originalHasNumbers) highlights.push('补充量化成果');

  const actionVerbs = ['主导', '推动', '优化', '设计', '实现', '提升', '降低', '负责', '完成'];
  const hasActionVerb = actionVerbs.some((v) => optimizedText.startsWith(v));
  const originalHasActionVerb = actionVerbs.some((v) => originalText.startsWith(v));
  if (hasActionVerb && !originalHasActionVerb) highlights.push('强化动作表达');

  if (optimizedText.length > originalText.length * 1.2) highlights.push('补充细节描述');

  const businessKeywords = ['业务', '用户', '效率', '成本', '收入', '体验', '质量'];
  const hasBusinessKeyword = businessKeywords.some((kw) => optimizedText.includes(kw));
  const originalHasBusinessKeyword = businessKeywords.some((kw) => originalText.includes(kw));
  if (hasBusinessKeyword && !originalHasBusinessKeyword) highlights.push('强化业务价值表达');

  return highlights.length > 0 ? highlights : ['优化表达方式'];
}
