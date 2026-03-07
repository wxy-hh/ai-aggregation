import { DiagnoseRequestSchema } from '@/schemas/resume-editor.schema';
import { ZodError } from 'zod';

/**
 * POST /api/resume/diagnose
 * 简历诊断与评分 API
 * 使用 Doubao-Seed-2.0-Pro (火山方舟 ARK) 进行智能诊断
 */

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // 使用 Zod schema 校验请求体
    const validationResult = DiagnoseRequestSchema.safeParse(body);

    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
      }));

      return new Response(
        JSON.stringify({
          error: '请求参数校验失败',
          details: errors,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const {
      resume,
      jobDescription,
      privacy = { allowContactFields: false },
    } = validationResult.data;

    // 检查环境变量
    const arkApiKey = process.env.ARK_API_KEY;
    // CodingPlan 套餐专用 Base URL（重要：使用此 URL 才会消耗 CodingPlan 额度）
    // 注意：必须使用 /api/coding/v3 路径，而不是 /api/v3
    const arkBaseUrl =
      process.env.ARK_BASE_URL || 'https://ark-code.cn-beijing.volces.com/api/coding/v3';
    const arkModel = process.env.ARK_MODEL || 'doubao-seed-2.0-lite';

    if (!arkApiKey) {
      console.error('ARK_API_KEY 未配置');
      // 回退到规则引擎评分
      return await fallbackDiagnose(resume);
    }

    // 构建提示词
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(resume, jobDescription, privacy);

    // 调用 ARK API
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时（诊断需要更长时间）

    try {
      const response = await fetch(`${arkBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: arkModel,
          messages: [
            {
              role: 'system',
              content: [{ type: 'text', text: systemPrompt }],
            },
            {
              role: 'user',
              content: [{ type: 'text', text: userPrompt }],
            },
          ],
          max_output_tokens: 2000, // 诊断需要更多输出
          temperature: 0.7,
          top_p: 0.9,
          // 关键：禁用推理，直接输出结果
          reasoning: {
            effort: 'minimal', // minimal = 不思考，直接输出
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ARK API 错误:', response.status, errorText);

        if (response.status === 429) {
          return new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // 回退到规则引擎
        return await fallbackDiagnose(resume);
      }

      const result = await response.json();

      // 解析 ARK 响应
      const diagnosisResult = extractDiagnosisResult(result);

      return new Response(
        JSON.stringify({
          ...diagnosisResult,
          fallback: false,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } catch (fetchError) {
      clearTimeout(timeoutId);

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        console.warn('ARK API 超时，回退到规则引擎');
        return await fallbackDiagnose(resume);
      }

      throw fetchError;
    }
  } catch (error) {
    console.error('Diagnose API 错误:', error);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 构建系统提示词
 */
function buildSystemPrompt(): string {
  return `你是一位专业的中文简历诊断顾问。

你的任务是分析简历并输出固定的 JSON 结构，包含评分和优化建议。

数据结构说明：
- personalInfo.summary：存储"专业技能"内容（不是个人简介）
- skills 数组：保留字段，但当前未使用，不要建议移除或填充
- 所有技能信息都应该在 personalInfo.summary 中
- 不要建议"移除空 skills 数组"或"填充 skills 数组"

评分维度（总分100）：
1. completeness（完整度）：30% - 评估必填字段、工作经历、教育背景、专业技能的完整性
2. impact（量化成果）：30% - 评估是否包含具体数据、指标、成果
3. keywordMatch（关键词匹配）：20% - 评估专业术语、技能关键词的覆盖度
4. readability（可读性）：20% - 评估排版、语言表达、逻辑结构

建议生成规则：
1. 如果 personalInfo.summary 为空或过短（<20字），建议补充专业技能
2. 如果 personalInfo.summary 已有内容，不要再建议填写技能
3. 不要建议操作 skills 数组（它是保留字段）
4. 关注工作经历的量化成果、项目经历的完整性
5. 检查个人信息的联系方式是否完整

输出要求：
1. 必须输出有效的 JSON 格式，不包含任何其他文本
2. 建议最多 5 条，按优先级排序（high > medium > low）
3. 每条建议必须包含 targetPath 字段，指向具体的数据路径
4. 不得输出或回显用户的敏感信息（电话、邮箱等）

输出格式示例：
{
  "score": 82,
  "dimensions": {
    "completeness": 80,
    "impact": 75,
    "keywordMatch": 85,
    "readability": 88
  },
  "suggestions": [
    {
      "id": "s1",
      "priority": "high",
      "title": "补充工作经历量化成果",
      "description": "在第一段工作经历中补充具体的数据指标，例如性能提升百分比、用户增长数量等",
      "targetPath": "workExperiences[0].description"
    }
  ]
}`;
}

/**
 * 构建用户提示词
 */
function buildUserPrompt(
  resume: any,
  jobDescription?: string,
  privacy?: { allowContactFields?: boolean }
): string {
  // 根据隐私设置过滤敏感字段
  const sanitizedResume = sanitizeResume(resume, privacy);

  let prompt = `请诊断以下简历并输出 JSON 格式的评分和建议：\n\n${JSON.stringify(sanitizedResume, null, 2)}`;

  if (jobDescription && jobDescription.trim().length > 0) {
    prompt += `\n\n目标岗位描述：\n${jobDescription}`;
  }

  return prompt;
}

/**
 * 过滤敏感信息
 */
function sanitizeResume(resume: any, privacy?: { allowContactFields?: boolean }): any {
  const sanitized = { ...resume };

  // 如果不允许发送联系方式，则移除敏感字段
  if (!privacy?.allowContactFields && sanitized.personalInfo) {
    const { email, phone, ...rest } = sanitized.personalInfo;
    sanitized.personalInfo = rest;
  }

  return sanitized;
}

/**
 * 从 ARK 响应中提取诊断结果
 * 支持 /chat/completions 和 /responses 两种端点格式
 */
function extractDiagnosisResult(result: any): any {
  let jsonText = '';

  console.log('🔍 开始解析诊断响应');
  console.log('📦 响应顶层键:', Object.keys(result));

  // 格式 1: choices[0].message.content (标准 OpenAI 格式，/chat/completions 端点)
  if (result.choices?.[0]?.message?.content) {
    jsonText = result.choices[0].message.content.trim();
    console.log('✅ 使用 choices[0].message.content 路径');
  }
  // 格式 2: output 是数组 (/responses 端点格式)
  else if (Array.isArray(result.output)) {
    console.log('✓ output 是数组，长度:', result.output.length);

    // 优先查找 type='message' 的元素
    for (let i = 0; i < result.output.length; i++) {
      const outputItem = result.output[i];
      console.log(`📦 output[${i}] 的 type:`, outputItem.type);

      // 跳过 reasoning 类型
      if (outputItem.type === 'reasoning') {
        console.log(`⏭️  跳过推理内容`);
        continue;
      }

      // 处理 message 类型
      if (outputItem.type === 'message' && Array.isArray(outputItem.content)) {
        for (const contentItem of outputItem.content) {
          if (contentItem.type === 'text' && contentItem.text) {
            jsonText = contentItem.text.trim();
            console.log('✅ 使用 output[message].content[text] 路径');
            break;
          }
        }
        if (jsonText) break;
      }

      // 兼容旧格式
      if (outputItem.text) {
        jsonText = outputItem.text.trim();
        console.log('✅ 使用 output[].text 路径');
        break;
      }
    }
  }
  // 格式 3: output.text (旧格式)
  else if (result.output?.text) {
    jsonText = result.output.text.trim();
    console.log('✅ 使用 output.text 路径');
  } else {
    console.warn('❌ 未知的 ARK 响应格式:', result);
    throw new Error('无法解析 ARK 响应');
  }

  if (!jsonText) {
    console.error('❌ 未能提取到文本内容');
    throw new Error('响应内容为空');
  }

  console.log('📝 提取的文本（前 200 字符）:', jsonText.substring(0, 200));

  // 尝试提取 JSON（可能包含在 markdown 代码块中）
  const jsonMatch =
    jsonText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || jsonText.match(/(\{[\s\S]*\})/);

  if (jsonMatch) {
    jsonText = jsonMatch[1];
  }

  try {
    const parsed = JSON.parse(jsonText);

    // 验证必需字段
    if (
      typeof parsed.score !== 'number' ||
      !parsed.dimensions ||
      !Array.isArray(parsed.suggestions)
    ) {
      throw new Error('响应格式不完整');
    }

    // 限制建议数量为 5 条
    if (parsed.suggestions.length > 5) {
      parsed.suggestions = parsed.suggestions.slice(0, 5);
    }

    // 为建议添加 ID（如果缺失）
    parsed.suggestions = parsed.suggestions.map((s: any, index: number) => ({
      id: s.id || `s${index + 1}`,
      priority: s.priority || 'medium',
      title: s.title || '优化建议',
      description: s.description || '',
      targetPath: s.targetPath || '',
    }));

    console.log('✅ 诊断结果解析成功，评分:', parsed.score);
    return parsed;
  } catch (parseError) {
    console.error('❌ JSON 解析失败:', parseError, '原始文本:', jsonText);
    throw new Error('AI 响应格式错误');
  }
}

/**
 * 规则引擎回退诊断
 * 优化：使用 Promise.all 并发执行独立的计算任务
 *
 * 虽然当前的计算函数是同步的，但使用 Promise.all 模式可以：
 * 1. 为未来的异步优化（如调用外部服务）做准备
 * 2. 展示并发思维模式，提高代码可维护性
 * 3. 在计算密集型场景下，可以轻松迁移到 Worker 线程
 */
async function fallbackDiagnose(resume: any): Promise<Response> {
  // 将同步计算包装为 Promise，实现并发执行模式
  // 这样在未来需要异步化时（如调用缓存服务、外部 API 等），无需重构代码结构
  const [dimensions, suggestions] = await Promise.all([
    Promise.resolve(calculateDimensions(resume)),
    Promise.resolve(generateRuleBasedSuggestions(resume)),
  ]);

  // score 依赖 dimensions，所以在并发完成后计算
  const score = calculateRuleBasedScore(resume);

  return new Response(
    JSON.stringify({
      score,
      dimensions,
      suggestions: suggestions.slice(0, 5), // 最多 5 条
      fallback: true,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * 基于规则的评分计算
 */
function calculateRuleBasedScore(resume: any): number {
  const dimensions = calculateDimensions(resume);

  // 加权计算总分
  const score = Math.round(
    dimensions.completeness * 0.3 +
      dimensions.impact * 0.3 +
      dimensions.keywordMatch * 0.2 +
      dimensions.readability * 0.2
  );

  return Math.min(100, Math.max(0, score));
}

/**
 * 计算各维度评分
 */
function calculateDimensions(resume: any): {
  completeness: number;
  impact: number;
  keywordMatch: number;
  readability: number;
} {
  const personalInfo = resume.personalInfo || {};
  const workExperiences = resume.workExperiences || [];
  const educations = resume.educations || [];
  const skills = resume.skills || [];

  // 完整度评分（30%）
  let completeness = 0;
  if (personalInfo.name) completeness += 20;
  if (personalInfo.title) completeness += 15;
  if (personalInfo.summary) completeness += 25; // 专业技能权重提升（原 15 + skills 的 10）
  if (workExperiences.length > 0) completeness += 25;
  if (educations.length > 0) completeness += 15;

  // 量化成果评分（30%）
  let impact = 0;
  const hasQuantifiedResults = workExperiences.some((exp: any) => {
    const desc = exp.description || '';
    return /\d+%|\d+[万千百十]|\d+[个项次]/.test(desc);
  });
  if (hasQuantifiedResults) impact += 60;

  const avgDescLength =
    workExperiences.length > 0
      ? workExperiences.reduce((sum: number, exp: any) => sum + (exp.description?.length || 0), 0) /
        workExperiences.length
      : 0;
  if (avgDescLength > 100) impact += 20;
  if (avgDescLength > 200) impact += 20;

  // 关键词匹配评分（20%）
  let keywordMatch = 50; // 基础分
  const allText = JSON.stringify(resume).toLowerCase();
  const commonKeywords = ['负责', '开发', '设计', '优化', '实现', '管理', '团队', '项目'];
  const matchedKeywords = commonKeywords.filter((kw) => allText.includes(kw));
  keywordMatch += matchedKeywords.length * 5;

  // 可读性评分（20%）
  let readability = 60; // 基础分
  if (workExperiences.length > 0 && workExperiences.length <= 5) readability += 20;
  if (
    personalInfo.summary &&
    personalInfo.summary.length > 20 &&
    personalInfo.summary.length < 1000
  ) {
    readability += 20;
  }

  return {
    completeness: Math.min(100, completeness),
    impact: Math.min(100, impact),
    keywordMatch: Math.min(100, keywordMatch),
    readability: Math.min(100, readability),
  };
}

/**
 * 生成基于规则的建议
 */
function generateRuleBasedSuggestions(resume: any): any[] {
  const suggestions: any[] = [];
  const personalInfo = resume.personalInfo || {};
  const workExperiences = resume.workExperiences || [];
  const educations = resume.educations || [];
  const skills = resume.skills || [];

  // 检查专业技能
  if (!personalInfo.summary || personalInfo.summary.length < 20) {
    suggestions.push({
      id: 's1',
      priority: 'high',
      title: '补充专业技能',
      description: '添加您的核心技能，如编程语言、框架、工具等，帮助招聘方快速了解您的能力',
      targetPath: 'personalInfo.summary',
    });
  }

  // 检查联系方式
  if (!personalInfo.email && !personalInfo.phone) {
    suggestions.push({
      id: 's0',
      priority: 'high',
      title: '补充个人联系方式',
      description: '添加邮箱或电话，方便招聘方与您联系',
      targetPath: 'personalInfo.email',
    });
  }

  // 检查工作经历量化成果
  const hasQuantifiedResults = workExperiences.some((exp: any) => {
    const desc = exp.description || '';
    return /\d+%|\d+[万千百十]|\d+[个项次]/.test(desc);
  });

  if (workExperiences.length > 0 && !hasQuantifiedResults) {
    suggestions.push({
      id: 's2',
      priority: 'high',
      title: '补充量化成果',
      description: '在工作经历中增加具体的数据指标，如提升百分比、用户数量等',
      targetPath: 'workExperiences[0].description',
    });
  }

  // 技能已通过 summary 字段处理，不再单独检查 skills 数组

  // 检查教育背景
  if (educations.length === 0) {
    suggestions.push({
      id: 's4',
      priority: 'medium',
      title: '补充教育背景',
      description: '添加教育经历，包括学校、专业和学历',
      targetPath: 'educations',
    });
  }

  // 检查工作经历描述长度
  if (workExperiences.length > 0) {
    const shortDescriptions = workExperiences.filter((exp: any) => {
      const desc = exp.description || '';
      return desc.length < 50;
    });

    if (shortDescriptions.length > 0) {
      suggestions.push({
        id: 's5',
        priority: 'medium',
        title: '丰富工作描述',
        description: '部分工作经历描述过于简短，建议补充具体职责和成果',
        targetPath: 'workExperiences[0].description',
      });
    }
  }

  // 按优先级排序
  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  suggestions.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);

  return suggestions;
}
