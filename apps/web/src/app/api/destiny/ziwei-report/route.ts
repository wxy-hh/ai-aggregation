import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { DestinyReportRequest } from '@/app/destiny/_components/types';
import { extractArkOutputText, extractJsonBlock } from '../_lib/ark-response';
import { normalizeDestinyReport } from '../_lib/report-normalizer';

const RequestSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空'),
  gender: z.enum(['male', 'female']),
  birthDate: z.object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
  birthTime: z.object({
    hour: z.string().regex(/^\d{2}$/),
    minute: z.string().regex(/^\d{2}$/),
  }),
  location: z.object({
    name: z.string().trim().min(1, '出生地不能为空'),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
  }),
});

const ARK_MODEL = 'doubao-seed-2-0-lite-260215';
const REPORT_TIMEOUT_MS = 90000;
const PRIMARY_MAX_OUTPUT_TOKENS = 2800;
const RETRY_MAX_OUTPUT_TOKENS = 5000;

class UpstreamModelError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 502, details?: string) {
    super(message);
    this.name = 'UpstreamModelError';
    this.status = status;
    this.details = details;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: '请求参数错误',
          details: parsed.error.errors.map((item) => ({
            path: item.path.join('.'),
            message: item.message,
          })),
        },
        { status: 400 }
      );
    }

    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    if (!arkApiKey) {
      return NextResponse.json({ error: 'Missing ARK_API_KEY' }, { status: 500 });
    }

    const input: DestinyReportRequest = parsed.data;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    const currentYear = new Date().getFullYear();

    let response: Response;
    try {
      response = await fetch(`${arkBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ARK_MODEL,
          input: [
            {
              role: 'system',
              content: buildSystemPrompt(currentYear),
            },
            {
              role: 'user',
              content: buildUserPrompt(input),
            },
          ],
          temperature: 0.35,
          max_output_tokens: PRIMARY_MAX_OUTPUT_TOKENS,
          reasoning: { effort: 'low' },
          text: { format: { type: 'json_object' } },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          error: mapArkError(response.status),
          details: text.slice(0, 400),
        },
        { status: response.status }
      );
    }

    let payload = await response.json();
    if (isLengthIncomplete(payload)) {
      payload = await retryWithCompactPrompt({
        arkApiKey,
        arkBaseUrl,
        input,
        currentYear,
      });
      if (isLengthIncomplete(payload)) {
        return NextResponse.json(
          { error: '模型输出被截断（长度限制），请重试一次' },
          { status: 502 }
        );
      }
    }

    let text: string;
    try {
      text = extractArkOutputText(payload);
    } catch (error) {
      throw new UpstreamModelError(
        '模型返回格式不合法，请稍后重试',
        502,
        error instanceof Error ? error.message : undefined
      );
    }

    const modelJson = parseModelJson(text);
    const strictError = validateZiweiModelPayload(modelJson);
    if (strictError) {
      return NextResponse.json(
        { error: `紫微测算结果不完整：${strictError}，请重试` },
        { status: 502 }
      );
    }

    const report = normalizeDestinyReport(modelJson, input, currentYear);

    return NextResponse.json(
      {
        report,
        generatedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '测算超时，请稍后重试' }, { status: 504 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: '模型返回格式不合法', details: error.issues }, { status: 502 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: '模型返回内容不可解析，请稍后重试' }, { status: 502 });
    }

    if (error instanceof UpstreamModelError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '测算失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}

function mapArkError(status: number): string {
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型调用失败，请稍后重试';
}

function buildUserPrompt(input: DestinyReportRequest): string {
  const location =
    input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat}, ${input.location.lon}）`
      : input.location.name;

  return [
    '请基于以下用户信息生成紫微斗数排盘分析（中文）：',
    '重要：以下出生日期与出生时间均为农历（阴历）口径，不是公历（阳历）。',
    `姓名：${input.name}`,
    `性别：${input.gender === 'female' ? '女' : '男'}`,
    `出生日期：${input.birthDate.year}-${input.birthDate.month}-${input.birthDate.day}`,
    `出生时间：${input.birthTime.hour}:${input.birthTime.minute}`,
    `出生地：${location}`,
  ].join('\n');
}

function buildSystemPrompt(currentYear: number): string {
  return `
你是专业紫微斗数分析助手。必须严格输出 JSON 对象，禁止输出任何额外文字。
不要输出思考过程，不要解释，只返回最终 JSON。
用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行紫微斗数推演，不要按公历换算理解。

字段要求：
1. profile：name, genderLabel, birthText, lunarText, locationText
2. pillars：长度4，按年柱/月柱/日柱/时柱，包含 stem, branch, label, element, tooltip
3. elements：必须含 metal/wood/water/fire/earth 五项，value 为 0-100 数字
4. tenGods：返回 4 项，包含 key, label, value(0-100), tooltip
5. modules：包含 personality/career/love/wealth/health，每项有 title/summary/bullets(2-4条)
6. timeline：必须返回 3 项，年份依次是 ${currentYear}, ${currentYear + 1}, ${currentYear + 2}，每项含 title/summary/detail，
   detail 里有 opportunities/risks/actions 三个数组，每个数组 2-3 条
7. ziweiCenter：包含 chartTitle, mingZhu, shenZhu
8. ziweiPalaces：必须返回 12 项（父母宫/福德宫/田宅宫/官禄宫/命宫/兄弟宫/奴仆宫/夫妻宫/迁移宫/子女宫/财帛宫/疾厄宫），每项包含 key,label,branch,stars(1-3),dominant,summary,suggestions(2-4)
7. ziweiPalaces：长度12，按宫位输出对象数组；每项含 key,label,branch,stars(1-3个),summary,suggestions(2-4条)

输出风格：
- 聚焦紫微斗数语境，强调宫位、主星结构与流年建议
- 内容可执行，避免空泛措辞
- 语气稳健，不夸大确定性
- 使用中文简体
- 控制篇幅：summary 每项 50-90 字，bullet/action 每条 18 字以内
- 保持精炼，避免重复表达
  `.trim();
}

function buildCompactSystemPrompt(currentYear: number): string {
  return `
仅返回合法 JSON。不要输出其他文字。
用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行紫微斗数推演，不要按公历换算理解。
返回字段：
profile(name,genderLabel,birthText,lunarText,locationText)
pillars(4项: stem,branch,label,element,tooltip)
elements(5项: key=metal/wood/water/fire/earth, value=0-100)
tenGods(4项: key,label,value,tooltip)
modules(personality/career/love/wealth/health，每项 title/summary/bullets[2-3条])
timeline(3项，年份固定 ${currentYear}/${currentYear + 1}/${currentYear + 2}，每项 title/summary/detail，detail含 opportunities/risks/actions)
ziweiCenter(chartTitle,mingZhu,shenZhu)
ziweiPalaces(12项: key,label,branch,stars,dominant,summary,suggestions)
内容尽量简短，保持紫微斗数表述。
  `.trim();
}

function isLengthIncomplete(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const incomplete = data.incomplete_details;
  if (!incomplete || typeof incomplete !== 'object') return false;
  return (incomplete as Record<string, unknown>).reason === 'length';
}

async function retryWithCompactPrompt({
  arkApiKey,
  arkBaseUrl,
  input,
  currentYear,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: DestinyReportRequest;
  currentYear: number;
}) {
  const response = await fetch(`${arkBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${arkApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      input: [
        {
          role: 'system',
          content: buildCompactSystemPrompt(currentYear),
        },
        {
          role: 'user',
          content: buildUserPrompt(input),
        },
      ],
      temperature: 0.2,
      max_output_tokens: RETRY_MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamModelError(mapArkError(response.status), response.status, text.slice(0, 200));
  }

  return response.json();
}

function parseModelJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();

  try {
    return JSON.parse(source);
  } catch {
    const objectMatch = source.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const candidate = objectMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(candidate);
    }
    throw new SyntaxError('模型 JSON 解析失败');
  }
}

function validateZiweiModelPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return '返回体为空';
  const source = payload as Record<string, unknown>;

  if (!source.ziweiPalaces || !Array.isArray(source.ziweiPalaces) || source.ziweiPalaces.length < 12) {
    return '缺少 12 宫位数据';
  }

  const firstTimeline = Array.isArray(source.timeline) ? source.timeline[0] : null;
  const firstDetail = firstTimeline && typeof firstTimeline === 'object'
    ? (firstTimeline as Record<string, unknown>).detail
    : null;
  if (!firstDetail || typeof firstDetail !== 'object') {
    return '缺少流年 detail';
  }

  const detailObj = firstDetail as Record<string, unknown>;
  if (!Array.isArray(detailObj.opportunities) || !Array.isArray(detailObj.risks) || !Array.isArray(detailObj.actions)) {
    return '流年 detail 结构不完整';
  }

  const modules = source.modules;
  if (!modules || typeof modules !== 'object') {
    return '缺少 modules';
  }
  const moduleObj = modules as Record<string, unknown>;
  if (!moduleObj.love || !moduleObj.personality) {
    return '缺少六亲/总论模块';
  }

  return null;
}
