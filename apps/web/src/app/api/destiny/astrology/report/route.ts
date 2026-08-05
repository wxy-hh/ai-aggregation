/**
 * 星座寰宇 · 本命星盘报告 API（真值先行 + SSE 流式解读）。
 *
 * 协议顺序：chart-facts → headline → bigThree → modules → transits → complete。
 * 确定性真值（chart-facts）由 @repo/astrology 计算，不经过 AI；AI 只解释给定真值。
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  resolveModelConfig,
  streamModel,
  ModelConfigError,
  type ModelConfig,
} from '@repo/shared';
import {
  allPlanetsLongitude,
  isRetrograde,
  computeHouses,
  houseOfLongitude,
  computeAspects,
  evaluateStability,
  localCivilToJulianDay,
  createShanghaiLocalTime,
  ENGINE_VERSION,
  ORB_TABLE_VERSION,
  PLANET_BODIES,
  type PlanetBody as EnginePlanetBody,
} from '@repo/astrology';
import type {
  ChartFacts,
  PlanetPlacement,
  HouseFact,
  AspectFact,
  BigThree,
  ZodiacSignId,
  AstrologyReport,
  ModuleReading,
  TransitGuidance,
} from '@/app/destiny/_components/astrology/astrology-types';
import {
  filterValidReport,
  type FactReference,
} from '../_lib/astrology-truth-guard';
import { withAuth } from '@/lib/api/with-auth';
import { releaseAiQuota, reserveChatQuota, settleAiQuota } from '@/lib/billing/quota-service';
import { createTokenMeasurement, estimateOutputTokens } from '@/lib/billing/usage-measurement';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';

export const runtime = 'nodejs';
export const maxDuration = 300;

const REPORT_TIMEOUT_MS = 120000;
const MAX_OUTPUT_TOKENS = 8000;

// ─── 请求校验 ───

const RequestSchema = z
  .object({
    name: z.string().trim().max(24, '昵称过长').optional().default(''),
    solarDate: z.object({
      year: z.number().int().min(1900).max(2100),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
    }),
    birthTime: z
      .object({ hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59) })
      .nullable(),
    timePrecision: z.enum(['minute', 'approximate', 'unknown']),
    approximateRange: z
      .object({ localStart: z.string(), localEnd: z.string() })
      .nullable(),
    location: z.object({
      name: z.string().trim().min(1, '出生城市不能为空'),
      lat: z.number().nullable(),
      lon: z.number().nullable(),
    }),
    timezoneConfirmed: z.boolean().default(false),
    focusTheme: z
      .enum(['self', 'career', 'love', 'wealth', 'health', 'study', 'relationship', 'spirit'])
      .default('self'),
    provider: z.enum(['doubao', 'deepseek']).default('doubao'),
  })
  .superRefine((data, ctx) => {
    // 未来日期校验
    const birth = new Date(Date.UTC(data.solarDate.year, data.solarDate.month - 1, data.solarDate.day));
    if (birth.getTime() > Date.now()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['solarDate'], message: '出生日期不能是未来日期' });
    }
    // 城市必须精确（经纬度非空）
    if (data.location.lat == null || data.location.lon == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['location'], message: '请从候选列表中选择精确的出生城市' });
    }
    // minute 必须有 birthTime；approximate 必须有 approximateRange
    if (data.timePrecision === 'minute' && !data.birthTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['birthTime'], message: '准确到分钟时需要填写出生时间' });
    }
    if (data.timePrecision === 'approximate' && !data.approximateRange) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['approximateRange'], message: '大约时段时需要选择时间区间' });
    }
  });

type AstrologyRequest = z.infer<typeof RequestSchema>;

// ─── SSE 事件类型 ───

type StreamEvent =
  | { type: 'chart-facts'; chartFacts: ChartFacts }
  | { type: 'headline'; headline: string }
  | { type: 'bigThree'; bigThree: BigThree }
  | { type: 'modules'; modules: ModuleReading[] }
  | { type: 'transits'; transits: TransitGuidance[] }
  | { type: 'complete'; report: AstrologyReport }
  | { type: 'error'; error: string };

// ─── 星座标签 ───

const SIGN_LABEL: Record<string, string> = {
  aries: '白羊座', taurus: '金牛座', gemini: '双子座', cancer: '巨蟹座',
  leo: '狮子座', virgo: '处女座', libra: '天秤座', scorpio: '天蝎座',
  sagittarius: '射手座', capricorn: '摩羯座', aquarius: '水瓶座', pisces: '双鱼座',
};

const PLANET_LABEL: Record<string, string> = {
  sun: '太阳', moon: '月亮', mercury: '水星', venus: '金星', mars: '火星',
  jupiter: '木星', saturn: '土星', uranus: '天王星', neptune: '海王星', pluto: '冥王星',
};

const HOUSE_LABEL = ['', '命宫', '财帛', '兄弟', '田宅', '子女', '奴仆', '夫妻', '疾厄', '迁移', '官禄', '福德', '玄秘'];

function parseHm(hm: string): { hour: number; minute: number } {
  const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
  return { hour: Number.isFinite(h) ? h : 0, minute: Number.isFinite(m) ? m : 0 };
}

// ─── 真值计算（确定性，不含 AI） ───

/** 黄经 → 星座。 */
function longitudeToSign(longitude: number): ZodiacSignId {
  const idx = Math.floor(longitude / 30) % 12;
  return ['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'][idx] as ZodiacSignId;
}

/** 由儒略日 + 经纬度计算完整行星/宫位/相位（供稳定性采样复用）。 */
function computeAt(jd: number, lat: number, lon: number, withHouses: boolean) {
  const longitudes = allPlanetsLongitude(jd);
  const housesResult = withHouses ? computeHouses(jd, lat, lon) : null;
  const planets = PLANET_BODIES.map((body) => {
    const longitude = longitudes[body as EnginePlanetBody];
    return {
      body: body as PlanetPlacement['body'],
      longitude,
      zodiacSign: longitudeToSign(longitude),
      isRetrograde: isRetrograde(body as EnginePlanetBody, jd),
      house: housesResult ? houseOfLongitude(longitude, housesResult.cusps) : 0,
      label: PLANET_LABEL[body] ?? body,
    };
  });
  const houses: HouseFact[] = housesResult
    ? housesResult.cusps.map((cusp, i) => ({
        number: i + 1,
        cuspLongitude: cusp,
        zodiacSign: longitudeToSign(cusp),
        label: HOUSE_LABEL[i + 1] ?? `第${i + 1}宫`,
      }))
    : [];
  const aspects: AspectFact[] = computeAspects(longitudes as Record<EnginePlanetBody, number>).map((a) => ({
    planetA: a.source as AspectFact['planetA'],
    planetB: a.target as AspectFact['planetB'],
    type: a.type,
    angle: a.angle,
    orb: a.orb,
    applying: true,
  }));
  return { planets, houses, aspects, ascendant: housesResult?.ascendant ?? null };
}

function computeChartFacts(input: AstrologyRequest): ChartFacts {
  const { solarDate, location, timePrecision } = input;
  const lat = location.lat as number;
  const lon = location.lon as number;

  // 代表时刻儒略日
  let jd: number;
  if (timePrecision === 'minute' && input.birthTime) {
    jd = localCivilToJulianDay(
      createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, input.birthTime.hour, input.birthTime.minute, 0, 'minute')
    );
  } else if (timePrecision === 'approximate' && input.approximateRange) {
    const { hour, minute } = parseHm(input.approximateRange.localStart);
    jd = localCivilToJulianDay(
      createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, hour, minute, 0, 'approximate')
    );
  } else {
    jd = localCivilToJulianDay(
      createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, 12, 0, 0, 'unknown')
    );
  }

  // ── 区间稳定性校验（诚实降级核心，REQ-004/AC-004）──
  // 仅当某字段在整个区间一致时才输出单值；不稳定即隐藏（置空），绝不取中点/12:00。
  let stablePlanetSigns: Record<string, boolean> = {};
  let stableHouses = timePrecision === 'minute';
  if (timePrecision !== 'minute') {
    let jdStart: number;
    let jdEnd: number;
    if (timePrecision === 'approximate' && input.approximateRange) {
      const s = parseHm(input.approximateRange.localStart);
      const e = parseHm(input.approximateRange.localEnd);
      jdStart = localCivilToJulianDay(createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, s.hour, s.minute, 0, 'approximate'));
      jdEnd = localCivilToJulianDay(createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, e.hour, e.minute, 0, 'approximate'));
    } else {
      // unknown：当地民用日 [00:00, 次日 00:00)
      jdStart = localCivilToJulianDay(createShanghaiLocalTime(solarDate.year, solarDate.month, solarDate.day, 0, 0, 0, 'unknown'));
      const next = new Date(Date.UTC(solarDate.year, solarDate.month - 1, solarDate.day + 1));
      jdEnd = localCivilToJulianDay(createShanghaiLocalTime(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, 0, 'unknown'));
    }

    const evaluator = (sampleJd: number) => {
      const snap = computeAt(sampleJd, lat, lon, timePrecision === 'approximate');
      const fields: Record<string, unknown> = {};
      for (const p of snap.planets) fields[`sign:${p.body}`] = p.zodiacSign;
      // 宫位闭合性（约时才评估宫位稳定）
      if (timePrecision === 'approximate') fields['housesOk'] = snap.houses.length > 0;
      return fields;
    };
    const fieldTypes: Record<string, 'discrete'> = {};
    PLANET_BODIES.forEach((b) => (fieldTypes[`sign:${b}`] = 'discrete'));
    if (timePrecision === 'approximate') fieldTypes['housesOk'] = 'discrete';

    const stability = evaluateStability(jdStart, jdEnd, evaluator, fieldTypes);
    for (const b of PLANET_BODIES) {
      stablePlanetSigns[b] = stability[`sign:${b}`]?.stable ?? false;
    }
    if (timePrecision === 'approximate') {
      stableHouses = stability['housesOk']?.stable === true && stability['housesOk']?.value === true;
    }
  } else {
    PLANET_BODIES.forEach((b) => (stablePlanetSigns[b] = true));
  }

  // 代表时刻的完整计算
  const includeHouses = timePrecision === 'minute' || (timePrecision === 'approximate' && stableHouses);
  const { planets: rawPlanets, houses, aspects, ascendant } = computeAt(jd, lat, lon, includeHouses);

  // 应用稳定性：不稳定的行星星座置空（隐藏）；宫位不稳定则不含宫位
  const planets: PlanetPlacement[] = rawPlanets.map((p) => {
    const stable = stablePlanetSigns[p.body] ?? true;
    if (!stable) {
      return { ...p, zodiacSign: p.zodiacSign, house: 0 };
    }
    return { ...p, house: includeHouses ? p.house : 0 };
  });
  const finalHouses = includeHouses ? houses : [];

  // 大三要素：太阳恒稳定；月亮/上升按稳定性决定是否展示
  const sunPlanet = rawPlanets.find((p) => p.body === 'sun')!;
  const moonPlanet = rawPlanets.find((p) => p.body === 'moon')!;
  const moonStable = stablePlanetSigns['moon'] ?? true;
  const ascSign: ZodiacSignId = includeHouses && ascendant != null ? longitudeToSign(ascendant) : sunPlanet.zodiacSign;
  const bigThree: BigThree = {
    sun: { sign: sunPlanet.zodiacSign, label: SIGN_LABEL[sunPlanet.zodiacSign] },
    moon: moonStable
      ? { sign: moonPlanet.zodiacSign, label: SIGN_LABEL[moonPlanet.zodiacSign] }
      : { sign: moonPlanet.zodiacSign, label: '当前资料无法确定' },
    ascendant: { sign: ascSign, label: SIGN_LABEL[ascSign] },
  };

  return {
    version: `${ENGINE_VERSION}+${ORB_TABLE_VERSION}`,
    calculatedAt: new Date().toISOString(),
    location,
    birthTimestamp: `${solarDate.year}-${String(solarDate.month).padStart(2, '0')}-${String(solarDate.day).padStart(2, '0')}`,
    bigThree,
    planets,
    houses: finalHouses,
    aspects,
  };
}

// ─── AI 解读（仅解释真值） ───

function buildInterpretationPrompt(chartFacts: ChartFacts, input: AstrologyRequest): string {
  const lines: string[] = [];
  lines.push(`昵称：${input.name || '匿名'}`);
  lines.push(`出生：${chartFacts.birthTimestamp} · ${chartFacts.location.name}`);
  lines.push(`时间精度：${input.timePrecision === 'minute' ? '准确到分钟' : input.timePrecision === 'approximate' ? '大约时段' : '完全未知'}`);
  lines.push('星盘真值（仅供你引用，不得修改）：');
  for (const p of chartFacts.planets) {
    lines.push(`- ${p.label}：${SIGN_LABEL[p.zodiacSign]} ${p.longitude.toFixed(1)}°${p.isRetrograde ? '（逆行）' : ''}${p.house ? ` 第${p.house}宫` : ''}`);
  }
  for (const a of chartFacts.aspects.slice(0, 8)) {
    lines.push(`- 相位：${PLANET_LABEL[a.planetA]} 与 ${PLANET_LABEL[a.planetB]} ${a.type}（orb ${a.orb.toFixed(1)}°）`);
  }
  return lines.join('\n');
}

const SYSTEM_PROMPT = `你是星座寰宇的占星解读师。规则：
1. 只解释用户消息中给出的星盘真值，绝不重新计算、绝不杜撰星体/宫位/相位。
2. 每个解读模块含四段：结论、盘面依据、可能表现、行动建议。
3. 预测一律用「倾向/可能/适合留意/可以尝试」，禁用「必然/注定/一定会」。
4. 医疗、财务、法律、孕育、死亡等高风险话题不输出结论性判断，必要时建议寻求合格专业人士。
5. 时间未知（无宫位）时，只讨论可计算的行星星座与相位，不出现上升、天顶、宫位。
6. 输出 JSON：{ headline, modules: [{key,title,summary,highlights,caution}], transits: [{period,title,summary,opportunities,challenges}] }。`;

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    let reservation: { id: string } | null = null;
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: '请求参数错误', details: parsed.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })) },
          { status: 400 }
        );
      }
      const input = parsed.data;

      // 1) 确定性真值
      const chartFacts = computeChartFacts(input);

      let config: ModelConfig;
      try {
        config = resolveModelConfig(input.provider);
      } catch (error) {
        if (error instanceof ModelConfigError) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }
        throw error;
      }

      const messages = [
        { role: 'system' as const, content: SYSTEM_PROMPT },
        { role: 'user' as const, content: buildInterpretationPrompt(chartFacts, input) },
      ];

      const requestId = getBillingRequestId(req, body as Record<string, unknown>);
      let inputUnits = 0;
      let outputLimit = MAX_OUTPUT_TOKENS;
      if (user.role !== 'admin') {
        const quota = await reserveChatQuota({
          userId: user.id,
          requestId,
          feature: 'destiny',
          provider: config.provider,
          model: config.model,
          messages,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          metadata: { reportType: 'astrology' },
        });
        reservation = quota.reservation;
        inputUnits = quota.inputUnits;
        outputLimit = quota.outputLimit;
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: StreamEvent) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          };
          let textBuffer = '';
          try {
            // 先发真值
            send({ type: 'chart-facts', chartFacts });
            send({ type: 'bigThree', bigThree: chartFacts.bigThree });

            // AI 解读
            const modelStream = streamModel({
              config,
              messages,
              temperature: 0.3,
              maxTokens: outputLimit,
              timeoutMs: REPORT_TIMEOUT_MS,
            });
            for await (const ev of modelStream) {
              if (ev.type === 'text-delta') textBuffer += ev.text;
              else if (ev.type === 'error') throw new Error(ev.error);
            }

            // 解析 AI JSON
            let headline = '';
            let modules: ModuleReading[] = [];
            let transits: TransitGuidance[] = [];
            try {
              const jsonStart = textBuffer.indexOf('{');
              const jsonEnd = textBuffer.lastIndexOf('}');
              if (jsonStart >= 0 && jsonEnd > jsonStart) {
                const parsedJson = JSON.parse(textBuffer.slice(jsonStart, jsonEnd + 1));
                headline = typeof parsedJson.headline === 'string' ? parsedJson.headline : '';
                modules = Array.isArray(parsedJson.modules) ? parsedJson.modules : [];
                transits = Array.isArray(parsedJson.transits) ? parsedJson.transits : [];
              }
            } catch {
              // AI 输出非 JSON 时保留真值，解读留空
            }

            // 真值守卫：过滤引用非法/隐藏事实的解读段
            const guarded = filterValidReport(
              modules.map((m) => ({ ...m, factReferences: (m as { factReferences?: FactReference[] }).factReferences ?? [] })),
              chartFacts
            ).map(({ factReferences: _ignored, ...rest }) => rest as ModuleReading);

            if (headline) send({ type: 'headline', headline });
            if (guarded.length) send({ type: 'modules', modules: guarded });
            if (transits.length) send({ type: 'transits', transits });

            const report: AstrologyReport = {
              title: `星座寰宇 · ${input.name || '匿名'}的本命星盘`,
              coreTone: headline,
              summary: headline,
              readings: guarded,
              transits,
              disclaimer: '本命盘位置基于出生时空计算；内容用于自我探索与娱乐参考。',
            };
            send({ type: 'complete', report });

            if (reservation) {
              await settleAiQuota({
                reservationId: reservation.id,
                requestId,
                feature: 'destiny',
                provider: config.provider,
                model: config.model,
                action: 'destiny-report',
                measurement: createTokenMeasurement(inputUnits + estimateOutputTokens(textBuffer)),
              }).catch((e) => console.error('[astrology/report] 结算额度失败:', e));
            }
          } catch (error) {
            send({ type: 'error', error: error instanceof Error ? error.message : '解读整理失败，请稍后重试' });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      if (reservation) {
        await releaseAiQuota({ reservationId: reservation.id, reason: '星座报告请求失败', meterType: 'tokens' }).catch((e) =>
          console.error('[astrology/report] 释放额度失败:', e)
        );
      }
      if (error instanceof BillingError) return billingErrorResponse(error);
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : '测算失败，请稍后重试' },
        { status: 500 }
      );
    }
  });
}
