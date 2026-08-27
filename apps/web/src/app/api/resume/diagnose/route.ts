import { DiagnoseRequestSchema } from '@/schemas/resume-editor.schema';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';
import { getResumeAiTimeoutMs } from '@/lib/resume/ai-timeout';
import { QuotaSession } from '@/lib/billing/quota-session';

/**
 * POST /api/resume/diagnose
 * 简历诊断与评分 API
 * 使用 Doubao-Seed-2.0-Pro (火山方舟 ARK) 进行智能诊断
 */

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    let session: QuotaSession | null = null;

    try {
      const body = await req.json();

      const validationResult = DiagnoseRequestSchema.safeParse(body);

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
        resume,
        jobDescription,
        privacy = { allowContactFields: false },
      } = validationResult.data;

      const arkApiKey = process.env.ARK_API_KEY;
      const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
      const arkModel = process.env.ARK_MODEL || 'doubao-seed-evolving';

      if (!arkApiKey) {
        return await fallbackDiagnose(resume);
      }

      const systemPrompt = buildSystemPrompt();
      const userPrompt = buildUserPrompt(resume, jobDescription, privacy);
      const requestId = getBillingRequestId(req, body as Record<string, unknown>);

      session = await QuotaSession.reserve(
        {
          userId: user.id,
          requestId,
          feature: 'resume',
          provider: 'doubao',
          model: arkModel,
          messages: [{ content: systemPrompt }, { content: userPrompt }],
          maxOutputTokens: 1200,
          metadata: { hasJobDescription: Boolean(jobDescription?.trim()) },
        },
        user.role
      );

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
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            await session.release({ reason: '简历诊断上游限流' });
            return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
              status: 429,
              headers: { 'Content-Type': 'application/json' },
            });
          }

          // 其他 HTTP 错误：回退到规则引擎
          await session.release({ reason: '简历诊断上游失败' });
          return await fallbackDiagnose(resume);
        }

        result = await response.json();
      } catch (fetchError) {
        clearTimeout(timeoutId);

        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          // 超时：回退到规则引擎
          await session.release({ reason: '简历诊断超时' });
          return await fallbackDiagnose(resume);
        }

        throw fetchError; // 其他错误由外层 catch 处理
      }

      const diagnosisResult = extractDiagnosisResult(result);

      await session.settle(
        {
          action: 'resume-diagnose',
          endpoint: '/api/resume/diagnose',
          rawUsage: result.usage ?? result.response?.usage,
          fallbackTokens: session.inputUnits,
          metadata: { hasJobDescription: Boolean(jobDescription?.trim()) },
        },
        {
          feature: 'resume',
          provider: 'doubao',
          model: arkModel,
          requestId,
        }
      );

      return new Response(
        JSON.stringify({ ...diagnosisResult, fallback: false }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error) {
      if (session) {
        await session.release({ reason: error instanceof Error ? error.message : '简历诊断请求失败' });
      }

      if (error instanceof BillingError) return billingErrorResponse(error);

      if (error instanceof AuthError) {
        if (error.code === 'FORBIDDEN') {
          return new Response(JSON.stringify({ error: error.message }), { status: 403 });
        }
        return new Response(JSON.stringify({ error: error.message }), { status: 401 });
      }

      console.error('[resume/diagnose] 错误:', error);
      return new Response(
        JSON.stringify({ error: '服务器内部错误', details: error instanceof Error ? error.message : '未知错误' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  });
}

// ---- 以下辅助函数保持不变 ----

function buildSystemPrompt(): string {
  return `你是一位专业的中文简历诊断顾问。

你的任务是分析简历并输出固定的 JSON 结构，包含评分和优化建议。

评分维度（总分100）：
1. completeness（完整度）：30% - 评估必填字段、工作经历、教育背景、专业技能的完整性
2. impact（量化成果）：30% - 评估是否包含具体数据、指标、成果
3. keywordMatch（关键词匹配）：20% - 评估专业术语、技能关键词的覆盖度
4. readability（可读性）：20% - 评估排版、语言表达、逻辑结构

建议生成规则：
1. 如果 personalInfo.summary 为空或过短（<20字），建议补充专业技能
2. 关注工作经历的量化成果、项目经历的完整性
3. 检查个人信息的联系方式是否完整

输出要求：
1. 必须输出有效的 JSON 格式，不包含任何其他文本
2. 建议最多 5 条，按优先级排序（high > medium > low）
3. 每条建议必须包含 targetPath 字段，指向具体的数据路径
4. 不得输出或回显用户的敏感信息（电话、邮箱等）

输出JSON结构：
- score: 数字类型，总分
- dimensions: 对象，包含四个维度的分数
- suggestions: 数组，包含优化建议，每个建议包含id、priority、title、description、targetPath字段`;
}

function buildUserPrompt(
  resume: any,
  jobDescription?: string,
  privacy?: { allowContactFields?: boolean }
): string {
  const sanitizedResume = sanitizeResume(resume, privacy);
  let prompt = `请诊断以下简历并输出 JSON 格式的评分和建议：\n\n${JSON.stringify(sanitizedResume, null, 2)}`;
  if (jobDescription && jobDescription.trim().length > 0) {
    prompt += `\n\n目标岗位描述：\n${jobDescription}`;
  }
  return prompt;
}

function sanitizeResume(resume: any, privacy?: { allowContactFields?: boolean }): any {
  const sanitized = { ...resume };
  if (!privacy?.allowContactFields && sanitized.personalInfo) {
    const { email, phone, ...rest } = sanitized.personalInfo;
    sanitized.personalInfo = rest;
  }
  return sanitized;
}

function extractDiagnosisResult(result: any): any {
  let jsonText = '';

  if (Array.isArray(result.output)) {
    for (const outputItem of result.output) {
      if (outputItem.type === 'reasoning') continue;

      if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
        for (const contentItem of outputItem.content) {
          if (contentItem.type === 'output_text' && contentItem.text) {
            jsonText = contentItem.text.trim();
            break;
          }
          if (contentItem.type === 'text' && contentItem.text) {
            jsonText = contentItem.text.trim();
            break;
          }
        }
        if (jsonText) break;
      }

      if (outputItem.text) {
        jsonText = outputItem.text.trim();
        break;
      }
    }
  } else if (result.output?.text) {
    jsonText = result.output.text.trim();
  } else {
    throw new Error('无法解析 ARK 响应');
  }

  if (!jsonText) throw new Error('响应内容为空');

  const jsonMatch =
    jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || jsonText.match(/(\{[\s\S]*\})/);
  if (jsonMatch) jsonText = jsonMatch[1];

  const parsed = JSON.parse(jsonText);

  if (typeof parsed.score !== 'number' || !parsed.dimensions || !Array.isArray(parsed.suggestions)) {
    throw new Error('响应格式不完整');
  }

  if (parsed.suggestions.length > 5) parsed.suggestions = parsed.suggestions.slice(0, 5);
  parsed.suggestions = parsed.suggestions.map((s: any, index: number) => ({
    id: s.id || `s${index + 1}`,
    priority: s.priority || 'medium',
    title: s.title || '优化建议',
    description: s.description || '',
    targetPath: s.targetPath || '',
  }));

  return parsed;
}

async function fallbackDiagnose(resume: any): Promise<Response> {
  const [dimensions, suggestions] = await Promise.all([
    Promise.resolve(calculateDimensions(resume)),
    Promise.resolve(generateRuleBasedSuggestions(resume)),
  ]);
  const score = calculateRuleBasedScore(resume);

  return new Response(
    JSON.stringify({ score, dimensions, suggestions: suggestions.slice(0, 5), fallback: true }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function calculateRuleBasedScore(resume: any): number {
  const dimensions = calculateDimensions(resume);
  return Math.min(100, Math.max(0, Math.round(
    dimensions.completeness * 0.3 +
    dimensions.impact * 0.3 +
    dimensions.keywordMatch * 0.2 +
    dimensions.readability * 0.2
  )));
}

function calculateDimensions(resume: any) {
  const personalInfo = resume.personalInfo || {};
  const workExperiences = resume.workExperiences || [];
  const educations = resume.educations || [];

  let completeness = 0;
  if (personalInfo.name) completeness += 20;
  if (personalInfo.title) completeness += 15;
  if (personalInfo.summary) completeness += 25;
  if (workExperiences.length > 0) completeness += 25;
  if (educations.length > 0) completeness += 15;

  let impact = 0;
  const hasQuantifiedResults = workExperiences.some((exp: any) =>
    /\d+%|\d+[万千百十]|\d+[个项次]/.test(exp.description || '')
  );
  if (hasQuantifiedResults) impact += 60;
  const avgDescLength = workExperiences.length > 0
    ? workExperiences.reduce((sum: number, exp: any) => sum + (exp.description?.length || 0), 0) / workExperiences.length
    : 0;
  if (avgDescLength > 100) impact += 20;
  if (avgDescLength > 200) impact += 20;

  let keywordMatch = 50;
  const allText = JSON.stringify(resume).toLowerCase();
  const commonKeywords = ['负责', '开发', '设计', '优化', '实现', '管理', '团队', '项目'];
  keywordMatch += commonKeywords.filter((kw) => allText.includes(kw)).length * 5;

  let readability = 60;
  if (workExperiences.length > 0 && workExperiences.length <= 5) readability += 20;
  if (personalInfo.summary && personalInfo.summary.length > 20 && personalInfo.summary.length < 1000) readability += 20;

  return {
    completeness: Math.min(100, completeness),
    impact: Math.min(100, impact),
    keywordMatch: Math.min(100, keywordMatch),
    readability: Math.min(100, readability),
  };
}

function generateRuleBasedSuggestions(resume: any): any[] {
  const suggestions: any[] = [];
  const personalInfo = resume.personalInfo || {};
  const workExperiences = resume.workExperiences || [];
  const educations = resume.educations || [];

  if (!personalInfo.summary || personalInfo.summary.length < 20) {
    suggestions.push({
      id: 's1', priority: 'high', title: '补充专业技能',
      description: '添加您的核心技能，如编程语言、框架、工具等，帮助招聘方快速了解您的能力',
      targetPath: 'personalInfo.summary',
    });
  }

  if (!personalInfo.email && !personalInfo.phone) {
    suggestions.push({
      id: 's0', priority: 'high', title: '补充个人联系方式',
      description: '添加邮箱或电话，方便招聘方与您联系',
      targetPath: 'personalInfo.email',
    });
  }

  const hasQuantifiedResults = workExperiences.some((exp: any) =>
    /\d+%|\d+[万千百十]|\d+[个项次]/.test(exp.description || '')
  );
  if (workExperiences.length > 0 && !hasQuantifiedResults) {
    suggestions.push({
      id: 's2', priority: 'high', title: '补充量化成果',
      description: '在工作经历中增加具体的数据指标，如提升百分比、用户数量等',
      targetPath: 'workExperiences[0].description',
    });
  }

  if (educations.length === 0) {
    suggestions.push({
      id: 's4', priority: 'medium', title: '补充教育背景',
      description: '添加教育经历，包括学校、专业和学历',
      targetPath: 'educations',
    });
  }

  if (workExperiences.length > 0) {
    const shortDescriptions = workExperiences.filter((exp: any) => (exp.description || '').length < 50);
    if (shortDescriptions.length > 0) {
      suggestions.push({
        id: 's5', priority: 'medium', title: '丰富工作描述',
        description: '部分工作经历描述过于简短，建议补充具体职责和成果',
        targetPath: 'workExperiences[0].description',
      });
    }
  }

  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
  return suggestions;
}
