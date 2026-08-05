/**
 * 星座寰宇 —— 占星模块领域类型
 *
 * 覆盖出生资料、两步表单、星盘真值（行星/宫位/相位）、报告解读与稳定性声明。
 */

// 时间精度：精确到分钟 /  approximate 区间 / 完全未知
export type TimePrecision = 'minute' | 'approximate' | 'unknown';

// 关注主题（单选）：用于聚焦解读方向
export type FocusTheme =
  | 'self'
  | 'career'
  | 'love'
  | 'wealth'
  | 'health'
  | 'study'
  | 'relationship'
  | 'spirit';

// 关注主题元信息
export type FocusThemeMeta = {
  key: FocusTheme;
  label: string;
  description: string;
};

// 阳历日期
export type SolarDate = {
  year: number;
  month: number;
  day: number;
};

// 出生时间（时:分）
export type BirthTime = {
  hour: number;
  minute: number;
};

// 出生城市（名称 + 经纬度）
export type BirthLocation = {
  name: string;
  lat: number | null;
  lon: number | null;
};

// 约时区间（当 timePrecision 为 approximate 时填写）
export type ApproximateTimeRange = {
  localStart: string; // ISO 本地时间字符串，如 "14:00"
  localEnd: string;
};

// 出生表单数据（第二步可复用第一步，减少重复输入）
export type BirthFormData = {
  /** 昵称/姓名 */
  name: string;
  /** 阳历出生日期 */
  solarDate: SolarDate;
  /** 出生时间（null 表示未知） */
  birthTime: BirthTime | null;
  /** 时间精度 */
  timePrecision: TimePrecision;
  /** 约时区间（仅 approximate 时有效） */
  approximateRange: ApproximateTimeRange | null;
  /** 出生城市 */
  location: BirthLocation;
  /** 用户是否已确认时区（夏令时/时区偏移提示） */
  timezoneConfirmed: boolean;
  /** 关注主题 */
  focusTheme: FocusTheme;
};

// 表单字段错误映射
export type AstrologyFieldErrors = Partial<Record<keyof BirthFormData, string>>;

// 错误类型
export type AstrologyErrorKind = 'validation' | 'model' | 'timeout' | 'unknown';

// 行星体标识（与 @repo/astrology 对齐的轻量别名）
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
  | 'pluto'
  | 'northNode'
  | 'southNode'
  | 'ascendant'
  | 'midheaven';

// 相位类型
export type AspectType = 'conjunction' | 'opposition' | 'square' | 'trine' | 'sextile';

// 黄道星座
export type ZodiacSignId =
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

// 行星落位（真值）
export type PlanetPlacement = {
  body: PlanetBody;
  /** 黄经，0-360 */
  longitude: number;
  /** 所在星座 */
  zodiacSign: ZodiacSignId;
  /** 逆行 */
  isRetrograde: boolean;
  /** 所在宫位（1-12，0 表示未知） */
  house: number;
  /** 显示用名称 */
  label: string;
};

// 宫位落位（真值）
export type HouseFact = {
  /** 宫位编号 1-12 */
  number: number;
  /** 宫头黄经 */
  cuspLongitude: number;
  /** 宫头星座 */
  zodiacSign: ZodiacSignId;
  /** 宫位含义标签 */
  label: string;
};

// 相位事实（真值）
export type AspectFact = {
  /** 行星 A */
  planetA: PlanetBody;
  /** 行星 B */
  planetB: PlanetBody;
  /** 相位类型 */
  type: AspectType;
  /** 实际分离角 */
  angle: number;
  /** 与理想角度偏差 */
  orb: number;
  /** 入相/出相（true 为入相） */
  applying: boolean;
};

// 日月升（三巨头）
export type BigThree = {
  sun: { sign: ZodiacSignId; label: string };
  moon: { sign: ZodiacSignId; label: string };
  ascendant: { sign: ZodiacSignId; label: string };
};

// 星盘真值集合
export type ChartFacts = {
  /** 计算版本，用于缓存键 */
  version: string;
  /** 计算时刻（UTC ISO） */
  calculatedAt: string;
  /** 出生地信息快照 */
  location: BirthLocation;
  /** 出生时间快照 */
  birthTimestamp: string;
  /** 三巨头 */
  bigThree: BigThree;
  /** 所有行星落位 */
  planets: PlanetPlacement[];
  /** 十二宫位 */
  houses: HouseFact[];
  /** 核心相位 */
  aspects: AspectFact[];
};

// 单项模块解读（事业/感情/财富等）
export type ModuleReading = {
  key: FocusTheme;
  title: string;
  summary: string;
  highlights: string[];
  caution?: string;
};

// 行运指引
export type TransitGuidance = {
  period: string;
  title: string;
  summary: string;
  opportunities: string[];
  challenges: string[];
};

// 占星报告
export type AstrologyReport = {
  /** 报告标题 */
  title: string;
  /** 核心基调 */
  coreTone: string;
  /** 总体摘要 */
  summary: string;
  /** 分主题解读 */
  readings: ModuleReading[];
  /** 行运指引 */
  transits: TransitGuidance[];
  /** 免责声明 */
  disclaimer: string;
};

// 稳定性信息（时间精度/地点对结果可信度的影响）
export type StabilityLevel = 'high' | 'medium' | 'low';

export type StabilityInfo = {
  /** 整体可信度 */
  confidence: StabilityLevel;
  /** 出生时间是否落在稳定区间内 */
  timeRangeStable: boolean;
  /** 宫位是否可能因时间偏移变化 */
  housesSensitive: boolean;
  /** 降级原因说明（如时间未知导致月亮星座不确定） */
  fallbackReason?: string;
  /** 建议用户补充的信息 */
  suggestions: string[];
};

// 工作区步骤
export type AstrologyWorkspaceStep = 'form' | 'result';

// 表单子步骤
export type AstrologyFormStep = 1 | 2;

// API 请求（与 API 路由约定）
export type AstrologyAnalyzeRequest = {
  name: string;
  solarDate: SolarDate;
  birthTime: BirthTime | null;
  timePrecision: TimePrecision;
  approximateRange: ApproximateTimeRange | null;
  location: BirthLocation;
  timezoneConfirmed: boolean;
  focusTheme: FocusTheme;
  /** 模型提供方：豆包 / DeepSeek（与八字、紫微、奇门一致） */
  provider: 'doubao' | 'deepseek';
};

// API 响应
export type AstrologyAnalyzeResponse = {
  success: boolean;
  chartFacts?: ChartFacts;
  report?: AstrologyReport;
  stabilityInfo?: StabilityInfo;
  error?: string;
};
