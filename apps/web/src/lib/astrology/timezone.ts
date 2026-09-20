/**
 * timezone.ts —— 星座寰宇 · 出生地本地时刻 ↔ UTC 换算（纯函数，客户端安全）
 *
 * 口径（设计文档 §9.2）：
 * - 出生当地时间 → UTC 的换算一律用城市自带 IANA 时区 + 运行时 tzdb（Node/browser 的 Intl），
 *   含历史夏令时；不使用星历库内部的坐标反查（tz-lookup 对新疆返回 Asia/Urumqi，
 *   而项目口径全国统一 Asia/Shanghai）。
 * - 本地时刻不存在（夏令时前拨跳变）时，表单层阻止提交；本模块为容错路径，按跳变前偏移解释，
 *   结果落在跳变后的第一个合法时刻之后。
 * - 本地时刻重复（夏令时回拨）时必须选择第一次或第二次出现：优先按档案里的 utcOffsetMinutes
 *   辨认，其次按 localTimeDisambiguation 选择，两者都缺失时取第一次出现（较早的 UTC 时刻）。
 */

/** 墙上时间（本地民用时刻），仅到分钟；出生资料的最小时间粒度即分钟 */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** 本地时刻解析结果（UTC 时刻 + 实际偏移 + 歧义标记） */
export interface ResolvedLocalTime {
  /** UTC 毫秒时间戳 */
  utcMs: number;
  /** 该本地时刻实际生效的 UTC 偏移（分钟，东正） */
  offsetMinutes: number;
  /** 夏令时回拨导致该本地时刻出现两次 */
  ambiguous: boolean;
  /** 夏令时前拨导致该本地时刻不存在（正常链路不会出现，表单已阻止） */
  nonexistent: boolean;
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

/** 某 IANA 时区在某一时刻的墙上时间（Intl 自带历史 tzdb，含历史夏令时） */
export function wallClockAt(timeZone: string, instant: Date): WallClock & { second: number } {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    // 个别运行时的 hour12:false 仍会返回 24 表示午夜
    hour: get('hour') % 24,
    month: get('month'),
    day: get('day'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** 某 IANA 时区在某一时刻的 UTC 偏移（分钟，东正） */
export function utcOffsetMinutesAt(timeZone: string, instant: Date): number {
  const wall = wallClockAt(timeZone, instant);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return Math.round((asUtc - (instant.getTime() - instant.getMilliseconds())) / 60000);
}

/** 本地墙上时间 → 该时刻的 UTC 毫秒（不处理歧义，仅用于探测候选偏移） */
function wallClockAsUtcMs(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
}

/**
 * 墙上时间 → UTC 时刻（含夏令时判定）。
 *
 * 做法：以墙上时间本身当作 UTC 探测前后各一天的偏移，得到全部候选偏移；
 * 逐个回代验证（偏移与时刻自洽者才成立）。0 个解 = 该本地时刻不存在；
 * 2 个解 = 该本地时刻重复出现；1 个解 = 唯一时刻。
 */
export function resolveLocalWallTime(
  wall: WallClock,
  timeZone: string,
  options?: { disambiguation?: 'first' | 'second' | null; preferredOffsetMinutes?: number | null }
): ResolvedLocalTime {
  const wallMs = wallClockAsUtcMs(wall);
  const candidateOffsets = new Set<number>([
    utcOffsetMinutesAt(timeZone, new Date(wallMs)),
    utcOffsetMinutesAt(timeZone, new Date(wallMs - 86400000)),
    utcOffsetMinutesAt(timeZone, new Date(wallMs + 86400000)),
  ]);

  const solutions = [...candidateOffsets]
    .map((offsetMinutes) => ({ offsetMinutes, utcMs: wallMs - offsetMinutes * 60000 }))
    .filter((s) => utcOffsetMinutesAt(timeZone, new Date(s.utcMs)) === s.offsetMinutes)
    .sort((a, b) => a.utcMs - b.utcMs);

  if (solutions.length === 0) {
    // 本地时刻不存在：按跳变前偏移解释（等价于顺延到跳变后的第一个合法时刻）
    const beforeMs = utcOffsetMinutesAt(timeZone, new Date(wallMs - 86400000)) * 60000;
    const utcMs = wallMs - beforeMs;
    return {
      utcMs,
      offsetMinutes: utcOffsetMinutesAt(timeZone, new Date(utcMs)),
      ambiguous: false,
      nonexistent: true,
    };
  }

  if (solutions.length === 1) {
    return { ...solutions[0], ambiguous: false, nonexistent: false };
  }

  // 重复时刻：优先按档案已记录的偏移辨认，其次按歧义选择，默认第一次出现
  const preferred = options?.preferredOffsetMinutes;
  const byPreferred = preferred !== null && preferred !== undefined
    ? solutions.find((s) => s.offsetMinutes === preferred)
    : undefined;
  const chosen =
    byPreferred ?? (options?.disambiguation === 'second' ? solutions[solutions.length - 1] : solutions[0]);
  return { ...chosen, ambiguous: true, nonexistent: false };
}

/**
 * 解析带偏移的本地时刻字符串（如 1995-10-08T13:00:00+08:00）。
 * 只取墙上时间分量；字符串自带的偏移仅作原样存档，换算时一律重新按 IANA 时区 + tzdb 求值。
 */
export function parseLocalWallClock(iso: string): WallClock {
  const match = /^(-?\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) {
    throw new Error(`本地时刻格式非法：${iso}`);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}
