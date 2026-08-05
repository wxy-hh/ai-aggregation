/**
 * 星座寰宇 · 星语问答 API（报告内受限追问）。
 *
 * 每份报告每个会话最多 3 个用户问题（首问 + 2 次追问）；报告已知事实作为上下文。
 * 触及医疗/财务/法律等敏感话题时返回安全拦截而非结论性回答；
 * 回答必须引用盘面事实标签，不绝对化，不泄露 unstable/已隐藏事实。
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveModelConfig, streamModel, ModelConfigError } from '@repo/shared';
import type { ChartFacts } from '@/app/destiny/_components/astrology/astrology-types';
import { withAuth } from '@/lib/api/with-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** 每报告每会话最大问题数（首问 + 2 追问）。 */
const MAX_QA_QUESTIONS = 3;

/** 敏感话题关键词（医疗/财务/法律/孕育/死亡）。 */
const SENSITIVE_PATTERN =
  /(医|病|疾|手术|癌症|肿瘤|抑郁|自杀|死亡|死|怀孕|孕育|流产|股票|基金|投资|理财|借钱|贷款|债|赔偿|诉讼|官司|法律|离婚财产|遗嘱|中奖|彩票)/;

const SAFETY_REPLY =
  '这类问题不适合据此作出医疗、财务或法律判断；可以一起从压力、沟通与行动习惯的角度梳理。';

const QA_SYSTEM_PROMPT = `你是星座寰宇的星语问答师，围绕用户已确认的本命星盘事实回答。
规则：
1. 只依据给定的星盘真值回答，不重新计算、不杜撰星体/宫位/相位，不泄露被标记为不可用的事实。
2. 回答引用盘面模块名或事实标签（如「你的太阳落金牛座」），不使用「必然/注定/一定会」等绝对化措辞，改用「倾向/可能/适合留意/可以尝试」。
3. 不输出医疗、财务、法律、孕育、死亡等结论性判断。
4. 回答克制、具体、可行动，中文，不超过 120 字。`;

const RequestSchema = z.object({
  question: z.string().trim().min(1, '请输入问题').max(200, '问题过长'),
  /** 本会话该报告已提问数（首问为 0） */
  askedCount: z.number().int().min(0),
  /** 报告真值（作为上下文） */
  chartFacts: z.custom<ChartFacts>((v) => v != null && typeof v === 'object'),
  /** 时间精度（unknown 时不谈上升/宫位） */
  timePrecision: z.enum(['minute', 'approximate', 'unknown']),
  provider: z.enum(['doubao', 'deepseek']).default('doubao'),
});

const SIGN_LABEL: Record<string, string> = {
  aries: '白羊座', taurus: '金牛座', gemini: '双子座', cancer: '巨蟹座',
  leo: '狮子座', virgo: '处女座', libra: '天秤座', scorpio: '天蝎座',
  sagittarius: '射手座', capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座',
};
const PLANET_LABEL: Record<string, string> = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星',
};

function buildContext(chartFacts: ChartFacts, timePrecision: string): string {
  const lines: string[] = ['星盘真值（仅供引用）：'];
  for (const p of chartFacts.planets) {
    const housePart = timePrecision !== 'unknown' && p.house > 0 ? ` 第${p.house}宫` : '';
    lines.push(`- ${PLANET_LABEL[p.body] ?? p.body}落${SIGN_LABEL[p.zodiacSign]}${p.isRetrograde ? '（逆行）' : ''}${housePart}`);
  }
  if (timePrecision === 'unknown') {
    lines.push('（当前为无宫位本命盘：不出现上升、天顶、宫位。）');
  }
  return lines.join('\n');
}

export async function POST(req: Request) {
  return withAuth(req, async () => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: parsed.error.errors[0]?.message ?? '请求参数错误' },
          { status: 400 }
        );
      }
      const { question, askedCount, chartFacts, timePrecision, provider } = parsed.data;

      // 上限拦截
      if (askedCount >= MAX_QA_QUESTIONS) {
        return NextResponse.json({
          success: true,
          limited: true,
          answer: '本次星语问答已完成，可重新打开报告后继续探索。',
        });
      }

      // 敏感话题拦截
      if (SENSITIVE_PATTERN.test(question)) {
        return NextResponse.json({ success: true, sensitive: true, answer: SAFETY_REPLY });
      }

      let config;
      try {
        config = resolveModelConfig(provider);
      } catch (error) {
        if (error instanceof ModelConfigError) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        throw error;
      }

      const context = buildContext(chartFacts, timePrecision);
      const messages = [
        { role: 'system' as const, content: QA_SYSTEM_PROMPT },
        { role: 'user' as const, content: `${context}\n\n用户问题：${question}` },
      ];

      let answer = '';
      const stream = streamModel({ config, messages, temperature: 0.4, maxTokens: 512, timeoutMs: 30000 });
      for await (const ev of stream) {
        if (ev.type === 'text-delta') answer += ev.text;
        else if (ev.type === 'error') throw new Error(ev.error);
      }

      return NextResponse.json({ success: true, answer: answer.trim() || SAFETY_REPLY });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '问答失败，请稍后重试' },
        { status: 500 }
      );
    }
  });
}
