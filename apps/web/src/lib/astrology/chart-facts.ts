/**
 * chart-facts.ts —— 星座寰宇 · 占星真值计算域接口（唯一新接缝）
 *
 * 依据设计文档 docs/designs/2026-07-26-constellation-universe-design.md §9.3「推荐数据模型」
 * 的八实体字段清单定义类型；本文件只承载类型与接口签名，不包含任何实现与 AI 生成内容。
 * 真实实现见 ./chart-engine.ts（服务端：circular-natal-horoscope-js 星历）；
 * 示例盘 / 预览盘使用 ./sample-chart.ts 的预冻结产物（该冻结档案由真实引擎产出，
 * 可复现性由 sample-chart.test.ts 守住）。
 *
 * 接缝分工（12 工单异步接缝改造；02 工单起提交链路走真实报告流）：
 * - 提交链路走服务端报告流 POST /api/destiny/astrology/report（协议见 ./report-events.ts，
 *   调用侧守则见 ./chart-request.ts）：chart-facts 帧即真值，真值在仪式窗内到达，转场等它就位；
 * - 示例盘 / 预览盘走同步 computeChartFacts（入口首页与表单预览需要即时盘面）。
 *
 * 计算口径固定（文档 §9.2）：
 * - 黄道体系：回归黄道（tropical）；观测视角：地心。
 * - 宫制：Placidus 为默认；任一宫头缺失、非有限值或十二宫顺序无法闭合时回退整宫制
 *   （Whole Sign）并在 factStability 标注；无宫位档 houseSystem 为 null。
 * - 相位只算合相/六合/刑相/拱相/对冲；容许度冻结为合相、对冲 8°、刑相、拱相 6°、
 *   六合 4°，由 orbTableVersion 标识（见 ORB_TABLE）。
 * - 稳定性规则：大约时段保存原始半开区间 [localStart, localEnd)，对所有面向用户的事实
 *   执行全区间稳定性校验；不稳定的度数、月亮、相位、角点、宫位一律为 null（不生成伪单值），
 *   不取区间中点或 12:00 等任意时刻补算。时间未知以当地民用日 [00:00, 次日 00:00) 计，
 *   不计算上升、天顶、宫位，仅展示整日内稳定的星座与主要相位。
 * - 行运：以请求时刻所在自然周（周一 00:00 UTC 起）为窗口按日采样，产出 TransitFact[]。
 */

/** 时间精度三档：准确到分钟 / 大约时段 / 完全未知（文档 §6.3，只有三档，无第四档） */
export type TimePrecision = 'accurate' | 'approximate' | 'unknown';

/** 宫位制：Placidus 为文档默认，Whole Sign（整宫制）为规定的高纬回退制 */
export type HouseSystem = 'whole-sign' | 'placidus';

/** 盘面范围：含宫位 / 不含宫位（文档 §8.4 宇宙护照标签） */
export type DataCompleteness = 'with-houses' | 'without-houses';

/** 十星体 */
export type PlanetBody =
  | 'sun'
  | 'moon'
  | 'mercury'
  | 'venus'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune'
  | 'pluto';

/** 黄道十二星座（代码标识，展示层负责转中文） */
export type ZodiacSign =
  | 'aries'
  | 'taurus'
  | 'gemini'
  | 'cancer'
  | 'leo'
  | 'virgo'
  | 'libra'
  | 'scorpio'
  | 'sagittarius'
  | 'capricorn'
  | 'aquarius'
  | 'pisces';

/** 主要相位：0° 合相 / 60° 六合 / 90° 刑相 / 120° 拱相 / 180° 对冲（文档 §9.2） */
export type AspectType = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';

/**
 * 事实稳定性：
 * - stable   星座、度数（宫位）在区间内全部稳定，可展示完整单值
 * - signOnly 星座稳定、但度数（或宫位）不稳定，只可展示星座
 * - unstable 星座本身不稳定或该事实不可得，一律隐藏（字段为 null）
 */
export type PlacementStability = 'stable' | 'signOnly' | 'unstable';

/** 隐藏原因：约时区间内不稳定 / 出生时间未知（文档 §6.2、§9.2 降级规则） */
export type HideReason = 'unstable-in-range' | 'time-unknown';

/** 相位容许度表（文档 §9.2 冻结口径）；由 orbTableVersion 标识，AI 不得自行判断 */
export const ORB_TABLE: Record<AspectType, number> = {
  conjunction: 8,
  opposition: 8,
  square: 6,
  trine: 6,
  sextile: 4,
};

/** 容许度表版本标识（文档 §9.2：由 orbTableVersion 标识） */
export const ORB_TABLE_VERSION = '2026-07-26-v1';

/** 出生日期（阳历） */
export interface BirthDate {
  year: number;
  month: number;
  day: number;
}

/** 出生时刻（时/分）；完全未知时为 null */
export interface BirthTime {
  hour: number;
  minute: number;
}

/**
 * 约时原始半开区间 [localStart, localEnd)，必须原样保存（文档 §9.2）。
 * 字符串为带时区偏移的本地时刻 ISO 格式（如 1995-10-08T13:00:00+08:00）。
 */
export interface TimeRange {
  localStart: string;
  localEnd: string;
  timezone: string;
}

/** DST 重复时刻歧义选择：第一次出现 / 第二次出现；无歧义或未知时为 null */
export type LocalTimeDisambiguation = 'first' | 'second' | null;

/**
 * 实体一：出生档案（文档 §9.3）。只保存测算必需资料；名称可为空；
 * 约时保留原始区间与 DST 歧义选择，保证真值可复现。
 */
export interface AstroBirthProfile {
  name: string | null;
  birthDate: BirthDate;
  /** 完全未知时为 null；约时档不填单独时刻，以 timeRange 为准 */
  birthTime: BirthTime | null;
  /** 约时档必填（原样保存原始区间）；其余档为 null */
  timeRange: TimeRange | null;
  /** 三档时间精度 */
  timePrecision: TimePrecision;
  city: string;
  /** 纬度（度，北正）与经度（度，东正），来自地点服务精确匹配 */
  latitude: number;
  longitude: number;
  /** 出生城市对应 IANA 时区 */
  timezone: string;
  /** 本地时刻对应 UTC 偏移（分钟）；未知时间档为 null */
  utcOffsetMinutes: number | null;
  /** DST 重复时刻歧义选择 */
  localTimeDisambiguation: LocalTimeDisambiguation;
  /** 时区数据库版本（可复现换算） */
  tzdbVersion: string;
}

/**
 * 实体三：行星落点（文档 §9.3）。
 * 不稳定的 degree、house 或其他字段为 null，不生成伪单值。
 */
export interface PlanetPlacement {
  body: PlanetBody;
  /** 星座；null = 区间内星座不稳定或不可得（隐藏） */
  sign: ZodiacSign | null;
  /** 星座内度数（0-30）；null = 度数不稳定或不可得（约时仅整数度、未知档不展示度数） */
  degree: number | null;
  /** 宫位号（1-12）：Placidus 取宫位区间归属，整宫制取相对上升星座的位移；无宫位档为 null */
  house: number | null;
  /** 逆行状态；隐藏的星体为 null */
  retrograde: boolean | null;
  stability: PlacementStability;
}

/** 角点（上升 / 天顶）落点 */
export interface AngleFact {
  point: 'ascendant' | 'midheaven';
  /** 星座；隐藏时为 null */
  sign: ZodiacSign | null;
  /** 星座内度数（0-30）；隐藏时为 null */
  degree: number | null;
  /** 黄道绝对经度（0-360）；隐藏时为 null */
  longitude: number | null;
  stability: PlacementStability;
}

/** 宫位事实（十二宫逐一输出；宫头即该宫起点黄经） */
export interface HouseFact {
  number: number;
  /** 宫头星座；无宫位档整体不输出 */
  sign: ZodiacSign;
  /** 宫头星座内度数：Placidus 为真实宫头度数，整宫制固定为 0（宫头即星座起始） */
  cuspDegree: number;
  stability: PlacementStability;
}

/**
 * 实体四：相位事实（文档 §9.3）。
 * 供星盘轮、相位卡和 AI 引用；不稳定相位不进入可见解释（orb/strength 为 null）。
 */
export interface AspectFact {
  source: PlanetBody;
  target: PlanetBody;
  type: AspectType;
  /** 实际偏差角（度，相对精确成相角）；不稳定为 null */
  orb: number | null;
  /** 强度 0-1（1 = 精确成相，0 = 容许度边缘）；不稳定为 null */
  strength: number | null;
  stability: PlacementStability;
}

/**
 * 实体五：行运事实（文档 §9.3）。
 * 由计算域以「请求时刻所在自然周（周一 00:00 UTC 起）」为窗口按日采样产出：
 * startsAt / endsAt 为该行运相位落在容许度内的 UTC 时段（与窗口取交集）；
 * theme 为固定词汇表生成的短主题（非 AI 内容，解读层可改写文案但不得改变事实）。
 */
export interface TransitFact {
  startsAt: string;
  endsAt: string;
  transitingBody: PlanetBody;
  natalTarget: PlanetBody;
  aspect: AspectType;
  theme: string;
}

/**
 * 实体六：AI 解读报告（文档 §9.3 解读层）。允许重新生成，但不得改变事实层；
 * 每段保留事实引用键（factReferences）。P0 由 AI 分区解读填充。
 */
export interface AstrologyReport {
  headline: string | null;
  /** 大三要素（时间未知或不稳定约时缺项为 null，不预留占位） */
  bigThree: {
    sun: string | null;
    moon: string | null;
    ascendant: string | null;
  };
  /** 五大生活模块：我是谁 / 关系如何运作 / 事业如何发挥 / 我的优势与盲点 / 本周宇宙提示 */
  modules: {
    id: string;
    title: string;
    summary: string;
    factReferences: string[];
  }[];
  /** 本周行动三角：机会 / 留意 / 行动（文档 §10.3） */
  actions: {
    opportunity: string;
    caution: string;
    action: string;
  } | null;
  transitGuidance: string | null;
  factReferences: string[];
}

/**
 * 实体七：统一历史逻辑记录（文档 §9.3）。
 * 已登录用户在真值完成时写入；出生日期/城市不变仅补全时间精度时更新同一记录并递增修订。
 */
export interface HistoryRecord {
  historyRecordId: string;
  ownerId: string | null;
  /** 计算中 / 就绪（含解读整理中）/ 失败 */
  status: 'calculating' | 'ready' | 'error';
  recalculatedAt: string | null;
  activeRevision: string;
}

/**
 * 实体八：问答与分享快照（文档 §9.3）。
 * 问答/分享必须绑定到对应真值修订；重算后旧修订只读保留，旧分享立即失效。
 */
export interface QuestionAnswer {
  historyRecordId: string;
  calculationRevision: string;
  content: string;
}

export interface ShareSnapshot {
  historyRecordId: string;
  calculationRevision: string;
  asset: string;
  shareToken: string;
}

/** 单项事实的可展示性与隐藏原因（文档 §9.3：factStability 记录每项可展示性与隐藏原因） */
export interface StabilityStatus {
  displayable: boolean;
  reason: HideReason | null;
  detail: string | null;
}

/** 事实层稳定性台账：逐项记录可展示性与隐藏原因；note 为固定政策文案（非 AI 生成） */
export interface FactStability {
  angles: StabilityStatus;
  houses: StabilityStatus;
  placements: Record<PlanetBody, StabilityStatus>;
  aspects: StabilityStatus;
  note: string | null;
}

/**
 * 实体二：本命盘不可变事实层（文档 §9.3）。
 * 本层字段全部来自确定性计算，不得含任何 AI 生成内容。
 */
export interface AstrologyChartFacts {
  /** 黄道体系：回归黄道 */
  zodiacSystem: 'tropical';
  /** 宫位制；无宫位档（降级）为 null */
  houseSystem: HouseSystem | null;
  /** 计算时刻（ISO） */
  calculatedAt: string;
  /** 占星计算引擎版本（冻结示例盘与真实计算域同源，由冻结脚本固化） */
  engineVersion: string;
  /** 相位容许度表版本（文档 §9.2，由 orbTableVersion 标识） */
  orbTableVersion: string;
  /** 真值修订号：出生日期/城市不变而补全或提高时间精度时递增（文档 §9.3） */
  calculationRevision: string;
  /** 十星体落点 */
  planets: PlanetPlacement[];
  angles: {
    ascendant: AngleFact;
    midheaven: AngleFact;
  };
  /** 十二宫；无宫位档为空数组（不留空占位） */
  houses: HouseFact[];
  aspects: AspectFact[];
  /**
   * 行运事实（文档 §9.3 实体五）：以计算时刻所在自然周为窗口；本命落点度数不稳定时
   * 不产出对应行运，未知时间档整体为空数组（文档 §11.1：行运不可用则隐藏本周行动三角）。
   * 冻结示例盘不含行运（示例仅展示本命盘），该字段为空数组。
   */
  transits: TransitFact[];
  factStability: FactStability;
  /** 盘面范围：含宫位 / 不含宫位 */
  dataCompleteness: DataCompleteness;
}

/**
 * 占星真值计算域同步接口（示例盘 / 预览盘专用）：
 * 输入出生档案，立即输出不可变星盘事实层。
 * 真实实现见 ./chart-engine.ts（仅服务端）；示例盘与前端预览使用 ./sample-chart.ts 的冻结产物。
 * 注意：提交链路不用本接口——提交走服务端报告流的 chart-facts 帧（./chart-request.ts）。
 */
export interface ComputeChartFacts {
  (profile: AstroBirthProfile): AstrologyChartFacts;
}