import { test, expect, type Page } from '@playwright/test';
import { SAMPLE_CHART_BY_PRECISION } from '../src/lib/astrology/sample-chart';

/**
 * 星座寰宇主链路 E2E（工单 13 建；T5 工单同步：mock 退役后主链路口径全面真实化）。
 *
 * 覆盖：测算（三档时间精度各一）→ 流式解读 → 问答（敏感拦截 + 3 问上限）→ 分享 → 重算 → 历史。
 *
 * 打桩口径（T5，不得打真实 LLM）：用 Playwright 网络拦截替换两处上行调用——
 * 1. 报告流 POST /api/destiny/astrology/report：chart-facts 帧用**真实引擎冻结档案**
 *    （src/lib/astrology/sample-chart.ts 按时间精度给出；它与真实计算域逐字段一致由
 *    sample-chart.test.ts 守住），四个解读分区用确定性中文桩数据；另有一例只给真值 + 降级事件。
 * 2. 问答流 POST /api/destiny/astrology/copilot：普通问题返回确定性桩回答；**敏感问题放行到真实服务端**
 *    ——服务端在调用模型之前就按规则拦截（不打真实模型、不计费），敏感拦截规则因此也进了 e2e 验收。
 *
 * 表单选择器与组件 aria-label 一一对应（astrology-form-step1/2）；仪式转场耗时较长，
 * 结果页断言统一放宽超时，并通过「跳过动画」直达结果（真值就位后才可跳过）。
 *
 * 分享步骤排在「重算 / 历史」之前：分享入口依赖本次流式解读的主轴金句，从历史恢复的旧结果
 * 解读层回到未发起态（不假装在途），那时没有可分享的一句话——顺序与产品口径一致。
 */

/** 桩文案：只用于链路与可见状态断言，真实措辞由模型产出（不打真实 API） */
const HEADLINE_TEXT = '在秩序与自由之间，你正在学会把感受说清楚。';
const QA_ANSWER_TEXT = '你在关系里最需要的是被认真回应。\n可以练习：先说感受，再谈事情。';
const QA_BLOCKED_PROMPT = /不能据此作出医疗、财务或法律判断/;

type Precision = 'accurate' | 'approximate' | 'unknown';
type Facts = typeof SAMPLE_CHART_BY_PRECISION.accurate;

function encodeFrames(events: Array<Record<string, unknown>>): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');
}

/** 相位引用键：与 lib/astrology/interpretation.ts 的 aspectRefKey 同口径（两端星体按字母序） */
function aspectRefKeyOf(aspect: { source: string; target: string; type: string }): string {
  const [first, second] = [aspect.source, aspect.target].sort();
  return `aspect:${first}:${aspect.type}:${second}`;
}

function shanghaiMonthDay(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(new Date(ms));
  const month = Number(parts.find((part) => part.type === 'month')?.value ?? 1);
  const day = Number(parts.find((part) => part.type === 'day')?.value ?? 1);
  return `${month} 月 ${day} 日`;
}

/** 本周区间文案：与服务端 formatWeekRange 同口径（UTC 自然周 → 上海时区展示） */
function currentWeekRange(now = new Date()): string {
  const weekday = now.getUTCDay() === 0 ? 7 : now.getUTCDay();
  const mondayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - weekday + 1);
  return `${shanghaiMonthDay(mondayMs)} – ${shanghaiMonthDay(mondayMs + 6 * 24 * 3600 * 1000)}`;
}

/** 大三要素桩：与真实降级口径一致——无宫位档上升为 null，月亮跨座隐藏时为 null */
function bigThreeFixture(facts: Facts) {
  const signOf = (body: string) => facts.planets.find((planet) => planet.body === body)?.sign ?? null;
  const reading = (plain: string) => ({ plain, action: '练习：本周先做一件小而确定的事。' });
  const withHouses = facts.dataCompleteness === 'with-houses';
  return {
    sun: signOf('sun') ? reading('你的核心气质偏向先照顾气氛，再照顾自己。') : null,
    moon: signOf('moon') ? reading('情绪来得快也去得快，你需要被立刻回应。') : null,
    ascendant:
      withHouses && facts.angles.ascendant.sign
        ? reading('你给人的第一印象是温和、好亲近。')
        : null,
  };
}

/** 生活模块桩：真实报告里由模型产出，这里按同一形状给确定性文案（引用只落在可展示的星体上） */
function moduleFixtures(facts: Facts) {
  const signRef = (body: string) =>
    facts.planets.find((planet) => planet.body === body)?.sign ? `planet:${body}:sign` : null;
  const refs = (...bodies: string[]) =>
    bodies.map(signRef).filter((ref): ref is string => ref !== null);
  return [
    {
      id: 'who',
      title: '我是谁',
      summary: '核心气质偏向先照顾气氛，再照顾自己。',
      tags: ['太阳', '月亮'],
      action: '练习先说一句「我的想法是」。',
      factReferences: refs('sun', 'moon'),
    },
    {
      id: 'love',
      title: '关系如何运作',
      summary: '在关系里，你的情绪需要被稳定回应。',
      tags: ['月亮', '金星'],
      action: '先说感受，再谈事情。',
      factReferences: refs('moon', 'venus'),
    },
    {
      id: 'career',
      title: '事业如何发挥',
      summary: '推进工作时细致而务实，先把节奏稳住。',
      tags: ['水星'],
      action: '把大事拆成今天能完成的一步。',
      factReferences: refs('mercury'),
    },
    {
      id: 'strengths',
      title: '我的优势与盲点',
      summary: '天赋来自自然同频的相位，值得主动调用。',
      tags: ['金星'],
      action: '记录一个毫不费力的瞬间。',
      factReferences: refs('venus'),
    },
    {
      id: 'week',
      title: '本周宇宙提示',
      summary: '机会、留意与行动都只基于盘面已确认的事实。',
      tags: ['本周', '行运'],
      action: '睡前写下三件今天做得不错的小事。',
      factReferences: [] as string[],
    },
  ];
}

/** 本周行运桩：关键相位取该盘真实稳定相位的前两条（三段式文案为确定性桩） */
function transitsFixture(facts: Facts) {
  const stable = facts.aspects.filter((aspect) => aspect.stability === 'stable').slice(0, 2);
  return {
    weekRange: currentWeekRange(),
    transitNote: '行运太阳正与本命金星成合相（偏差约 1.2°）',
    opportunity: '本周相位温和，适合主动创造一次小的新鲜体验。',
    caution: '本周没有明显的拉扯相位，留意别因为太顺而透支休息。',
    action: '本周可以尝试：睡前写下三件今天做得不错的小事。',
    transitReferences: [] as string[],
    keyAspects: stable.map((aspect) => ({
      refKey: aspectRefKeyOf(aspect),
      energy: '两股能量在这里互相照见。',
      life: '相关场景里，它们总是一同出现。',
      practice: '练习：这周刻意多用一次，观察它的手感。',
    })),
  };
}

/** 报告流桩（不打真实 LLM）：degrade 时只下发真值 + 解读降级事件 */
async function stubReportStream(page: Page, options: { degrade?: boolean } = {}): Promise<void> {
  await page.route('**/api/destiny/astrology/report', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { timePrecision?: Precision };
    const precision: Precision = body.timePrecision ?? 'accurate';
    // 与真实路由同口径：calculatedAt 是「本次计算时刻」。除了忠实于生产语义，
    // 它还是服务端每报告提问计数的报告标识之一（同一份真值共享计数），
    // 固定值会让跨轮 e2e 累积计数、把放行到真实服务端的敏感问题问成 429。
    const facts = { ...SAMPLE_CHART_BY_PRECISION[precision], calculatedAt: new Date().toISOString() };
    const events: Array<Record<string, unknown>> = [{ type: 'chart-facts', facts }];
    if (options.degrade) {
      events.push({ type: 'interpretation-unavailable', reason: 'model' }, { type: 'complete' });
    } else {
      events.push(
        { type: 'headline', headline: { text: HEADLINE_TEXT, factReferences: ['planet:sun:sign'] } },
        { type: 'bigThree', bigThree: bigThreeFixture(facts) },
        { type: 'modules', modules: moduleFixtures(facts) },
        { type: 'transits', transits: transitsFixture(facts) },
        { type: 'complete' }
      );
    }
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: encodeFrames(events),
    });
  });
}

/** 问答流桩：敏感问题放行到真实服务端（服务端前置拦截，不打模型），其余返回确定性桩回答 */
async function stubQaStream(page: Page): Promise<void> {
  await page.route('**/api/destiny/astrology/copilot', async (route) => {
    const body = (route.request().postDataJSON() ?? {}) as { question?: string };
    const question = body.question ?? '';
    // 与 _lib/astrology-qa-safety.ts 同源的敏感口径（医疗类最小集合）：命中即交给真实服务端
    if (/病|癌|手术|医|药|抑郁|焦虑|治疗|诊断/.test(question)) {
      await route.continue();
      return;
    }
    const answer = {
      kind: 'answer',
      text: QA_ANSWER_TEXT,
      citations: [{ label: '关系如何运作', moduleId: 'love' }],
    };
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body: encodeFrames([
        { type: 'text-delta', text: '你在关系里最需要的是被认真回应。' },
        { type: 'text-delta', text: '\n可以练习：先说感受，再谈事情。' },
        { type: 'answer', answer },
      ]),
    });
  });
}

/** 走完两步表单并提交（默认示例盘口径：上海） */
async function submitChartForm(
  page: Page,
  options: {
    name?: string;
    precision: '准确到分钟' | '大约时段' | '完全未知';
    date: [number, number, number];
    time?: [string, string];
    slot?: string;
  }
): Promise<void> {
  await page.goto('/destiny?tab=astrology');

  // 入口首页 → 表单（会话内已有工作区状态时可能直接落在表单/结果页）
  const yearSelect = page.locator('select[aria-label="出生年份"]');
  if (!(await yearSelect.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '开始绘制我的星盘' }).first().click();
  }
  await expect(yearSelect).toBeVisible({ timeout: 20_000 });

  if (options.name) await page.fill('input[placeholder="例如：小宇"]', options.name);
  const [year, month, day] = options.date;
  await yearSelect.selectOption(String(year));
  await page.locator('select[aria-label="出生月份"]').selectOption(String(month));
  await page.locator('select[aria-label="出生日"]').selectOption(String(day));
  await page.getByRole('button', { name: '继续', exact: true }).click();

  // 第二步：时间精度 + （按档位）时刻 / 时段 + 出生城市
  const precisionGroup = page.locator('[aria-label="出生时间精度"]');
  await expect(precisionGroup).toBeVisible({ timeout: 10_000 });
  await precisionGroup.getByRole('radio', { name: options.precision }).click();
  if (options.time) {
    await page.locator('select[aria-label="出生小时"]').selectOption(options.time[0]);
    await page.locator('select[aria-label="出生分钟"]').selectOption(options.time[1]);
  }
  if (options.slot) {
    await page.locator('[aria-label="大约时段"]').getByRole('radio', { name: options.slot }).click();
  }
  await page.fill('input[placeholder="搜索城市中文名，如：北京/郑州"]', '上海');
  await page.getByRole('option', { name: /^上海/ }).first().click();

  await page.getByRole('button', { name: '绘制我的星盘', exact: true }).click();
}

/** 仪式 → 结果页：真值就位后「跳过动画」可直达，否则按钮置灰 */
async function skipRitualToResult(page: Page, ownerName: string): Promise<void> {
  const skip = page.getByRole('button', { name: '跳过动画' });
  await expect(skip).toBeEnabled({ timeout: 40_000 });
  await skip.click();
  await expect(page.getByText(`${ownerName}的宇宙护照`)).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('#astrology-wheel-section')).toBeAttached();
}

/**
 * 展开移动端洞察轨折叠卡（sm 起内容常显、折叠按钮 sm:hidden，桌面端没有这个按钮，直接跳过）。
 * 折叠卡展开后标题会变成「收起」，同名按钮随即消失，无法再按名字复验——展开结果统一由调用方
 * 的下一步断言确认（生成分享卡 / 修改资料重新演算 / 问答输入框各自可见）。
 */
async function expandRailCard(page: Page, name: RegExp): Promise<void> {
  const toggle = page.getByRole('button', { name }).first();
  if (!(await toggle.isVisible().catch(() => false))) return;
  if ((await toggle.getAttribute('aria-expanded')) !== 'false') return;
  await toggle.click();
}

/** 关闭移动端问答抽屉（桌面为内联面板，无需关闭）：抽屉关闭钮与面板内收起钮位置重叠，统一用 Esc */
async function closeQaDrawer(page: Page): Promise<void> {
  const drawer = page.getByRole('dialog');
  if ((await drawer.count()) === 0) return;
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
}

/** 打开星语问答并提问（桌面内联面板 / 移动端底部抽屉共用同一输入框） */
async function askQuestion(page: Page, question: string): Promise<void> {
  const input = page.getByLabel('星语问答输入框');
  if (!(await input.isVisible().catch(() => false))) {
    await expandRailCard(page, /^星语问答/);
    await page.getByRole('button', { name: /开始提问|继续提问/ }).first().click();
  }
  await input.fill(question);
  await input.press('Enter');
}

/**
 * 固定设备指纹（localStorage 缓存优先，指纹库不会被加载）：整套用例复用同一个匿名用户。
 * 匿名账号按 IP 限流（新建每小时 30 次，见 api/auth/anonymous），每次运行都刷一批新设备
 * 会在密集回归时触发 429，进而被 AuthGuard 引向 /login——固定设备可复现且不消耗该配额。
 */
const E2E_DEVICE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

test.describe('星座寰宇 · 主链路', () => {
  // 减少动态：入场动画立即落定，断言只等状态、不等动效（真实节奏的仪式窗不受影响）
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(
      ([key, id]) => window.localStorage.setItem(key, id),
      ['ai-device-id', E2E_DEVICE_ID] as const
    );
  });

  test('准确档：测算 → 流式解读 → 问答（敏感拦截 + 3 问上限）→ 分享 → 重算 → 历史', async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await stubReportStream(page);
    await stubQaStream(page);

    // ── 测算：真值先行 ──
    await submitChartForm(page, {
      name: '星野',
      precision: '准确到分钟',
      date: [1995, 10, 8],
      time: ['14', '30'],
    });
    await skipRitualToResult(page, '星野');

    // ── 流式解读：主轴 → 大三要素 → 五个生活模块 → 本周行运 ──
    // 主轴视觉标题：逐字浮现（h2 带 aria-hidden，读屏由同文案的 sr-only 活体区承担）
    await expect(page.locator('h2').filter({ hasText: HEADLINE_TEXT })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: '大三要素' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: '生活的五个切面' })).toBeVisible();
    await expect(page.getByText('我是谁', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('本周宇宙提示', { exact: true }).first()).toBeVisible();
    // 结果页不出现违禁口径（精度百分比）
    await expect(page.getByText(/精度\s*\d+%/)).toHaveCount(0);

    // ── 问答：普通问题（桩回答）→ 敏感话题（真实服务端前置拦截）→ 3 问上限 ──
    await askQuestion(page, '我在亲密关系里最需要被理解的是什么？');
    await expect(page.getByText(QA_ANSWER_TEXT.split('\n')[0])).toBeVisible({ timeout: 20_000 });
    await askQuestion(page, '我该不该去看病？');
    await expect(page.getByText(QA_BLOCKED_PROMPT)).toBeVisible({ timeout: 20_000 });
    await askQuestion(page, '我的优势是什么？');
    await expect(page.getByText('已完成 3 问').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('本次星语问答已完成，可重新打开报告后继续探索。')).toBeVisible();
    // 上限后输入区被提示替换：不再有输入框可发起第 4 问
    await expect(page.getByLabel('星语问答输入框')).toHaveCount(0);
    await closeQaDrawer(page);

    // ── 分享：脱敏海报（默认含昵称与大三要素，切换匿名后昵称消失） ──
    await expandRailCard(page, /^分享星语海报/);
    const generate = page.getByRole('button', { name: '生成分享卡' });
    await expect(generate).toBeVisible({ timeout: 20_000 });
    await generate.click();
    const card = page.locator('[data-testid="astrology-share-card"]');
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.getByText('星野', { exact: false })).toBeVisible();
    await expect(card.getByText('水瓶座')).toBeVisible();
    await page.getByRole('radio', { name: '匿名' }).click();
    await expect(card.getByText('星盘主人')).toBeVisible();
    await expect(card.getByText('星野', { exact: true })).toHaveCount(0);
    // 脱敏：海报不含出生日期与城市
    await expect(card.getByText('1995')).toHaveCount(0);
    await expect(card.getByText('上海')).toHaveCount(0);
    // 关闭海报弹层：模态弹层会给背景内容加 aria-hidden，不关闭会挡住后续一切交互
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);

    // ── 重算：回表单且资料保留（落在第二步：精度/时刻/城市原样），重新提交再回结果页 ──
    await expandRailCard(page, /^星盘校准状态/);
    const recalculate = page.getByRole('button', { name: '修改资料重新演算' });
    await expect(recalculate).toBeVisible({ timeout: 20_000 });
    await recalculate.click();
    await expect(page.locator('input[placeholder="搜索城市中文名，如：北京/郑州"]')).toHaveValue(
      '上海',
      { timeout: 20_000 }
    );
    await expect(
      page.locator('[aria-label="出生时间精度"]').getByRole('radio', { name: '准确到分钟' })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('select[aria-label="出生小时"]')).toHaveValue('14');
    await expect(page.locator('select[aria-label="出生分钟"]')).toHaveValue('30');
    await page.getByRole('button', { name: '绘制我的星盘', exact: true }).click();
    await skipRitualToResult(page, '星野');

    // ── 历史：重新进入入口，低敏最近记录可继续查看（匿名会话为临时记录，登录后迁移统一历史） ──
    await page.goto('/destiny?tab=astrology');
    const resume = page.getByRole('button', { name: '继续查看' });
    await expect(resume).toBeVisible({ timeout: 30_000 });
    // 最近记录卡是低敏摘要：只有称谓与记录标题，不含出生日期 / 城市 / 精确时刻
    const recentCard = page.getByRole('button', { name: '继续查看' }).locator('..');
    await expect(recentCard.getByText('星野的本命星盘')).toBeVisible();
    await expect(recentCard.getByText(/1995|上海|14:30/)).toHaveCount(0);
    await resume.click();
    await expect(page.getByText('星野的宇宙护照')).toBeVisible({ timeout: 20_000 });
    // 恢复旧结果的解读层回到未发起态：如实给「解读暂不可用」而非假装在途
    await expect(page.getByRole('heading', { name: '解读暂不可用' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#astrology-wheel-section')).toBeAttached();
  });

  test('大约时段：时段内不稳定 → 无宫位行星盘，上升/宫位文案不出现', async ({ page }) => {
    test.setTimeout(120_000);
    await stubReportStream(page);

    await submitChartForm(page, {
      name: '星野',
      precision: '大约时段',
      date: [1995, 10, 8],
      slot: '12:00–15:00',
    });
    await skipRitualToResult(page, '星野');

    // 约时降级（§6.2）：护照徽章如实标注「部分盘面范围不稳定」，盘面档位降为稳定行星盘
    // （同一枚徽章在护照头与深度区各渲染一次，取当前视口可见的那一处）
    await expect(
      page.getByText('约时 · 部分盘面范围不稳定').filter({ visible: true }).first()
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('稳定行星盘').filter({ visible: true }).first()).toBeVisible();
    // 核心要素区说明降级口径：区间内不稳定即按无宫位范围展示，不取中点、不补算
    await expect(
      page.getByText('所选时段内上升与宫位不稳定，已按无宫位范围展示——以下结论只基于区间内稳定的事实，不取中点、不补算。')
    ).toBeVisible();

    // 核心要素卡：上升不出现（太阳稳定，仍出一张卡）
    const coreSection = page.locator('section[aria-label="核心要素"]');
    await expect(coreSection).toBeVisible();
    await expect(coreSection.getByText('上升', { exact: true })).toHaveCount(0);
    await expect(coreSection.getByRole('heading', { name: '核心要素' })).toBeVisible();
  });

  test('完全未知：无宫位无四轴，月亮跨座隐藏，解读照常流式到达', async ({ page }) => {
    test.setTimeout(120_000);
    await stubReportStream(page);

    await submitChartForm(page, {
      name: '星野',
      precision: '完全未知',
      date: [1995, 10, 10],
    });
    await skipRitualToResult(page, '星野');

    await expect(page.getByText('时间未知 · 无宫位行星盘').first()).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('出生时间未知，上升与宫位已隐藏——以下结论只基于整日内稳定的事实，不猜测、不补算。')
    ).toBeVisible();

    // 上升与月亮都不出现（月亮当日跨座整颗隐藏）
    const coreSection = page.locator('section[aria-label="核心要素"]');
    await expect(coreSection.getByText('上升', { exact: true })).toHaveCount(0);
    await expect(coreSection.getByText('月亮', { exact: true })).toHaveCount(0);
    // 解读层照常到位：降级只限制事实范围，不限制文案产出
    await expect(page.locator('h2').filter({ hasText: HEADLINE_TEXT })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('heading', { name: '生活的五个切面' })).toBeVisible();
  });

  test('解读降级：星盘与护照照常，文案区给诚实失败卡与重试入口', async ({ page }) => {
    test.setTimeout(120_000);
    await stubReportStream(page, { degrade: true });

    await submitChartForm(page, {
      name: '星野',
      precision: '准确到分钟',
      date: [1995, 10, 8],
      time: ['14', '30'],
    });
    await skipRitualToResult(page, '星野');

    // 真值不受解读失败影响：护照、星盘轮照常可看
    await expect(page.locator('#astrology-wheel-section')).toBeAttached();
    await expect(page.getByRole('heading', { name: 'AI 解读没有完成' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('button', { name: '重试解读' })).toBeVisible();
    // 没有解读就没有模块与分享入口：不给空的假入口
    await expect(page.getByRole('heading', { name: '生活的五个切面' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '生成分享卡' })).toHaveCount(0);
  });
});
