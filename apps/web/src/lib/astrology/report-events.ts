/**
 * report-events.ts —— 星座寰宇 · 报告流协议（BFF ↔ 前端，SSE `data: <json>` 帧）
 *
 * 生产端：apps/web/src/app/api/destiny/astrology/report/route.ts
 * 消费端：apps/web/src/lib/astrology/chart-request.ts（提交链路唯一异步接缝）
 *
 * 事件顺序（03 工单，LLM 接入后）：
 *   chart-facts → headline → bigThree → modules → transits → complete
 * 解读层降级（额度不足 / 模型配置缺失 / 解读失败或超时 / 分区校验不过）：
 *   chart-facts →（已到达的分区…）→ interpretation-unavailable(reason) → complete
 * 真值阶段失败（出生资料无法换算、计算异常）：error（此后不再有其它事件，流随即关闭）。
 *
 * 铁律：chart-facts 必须是流上第一帧——确定性真值先下线（计算近乎零成本）；
 * 「解读暂不可用」只降级解读层，绝不因此扣下星盘（额度不足同样只推降级事件）。
 * 解读失败不得用任何模板/mock 文案兜底：宁可给诚实的失败卡 + 重试。
 */

import type { AstrologyChartFacts } from './chart-facts';
import type {
  AstrologyBigThree,
  AstrologyHeadline,
  AstrologyTransitsSection,
  ModuleReading,
} from './interpretation';

/**
 * 解读暂不可用的原因：
 * - 'quota'     额度不足（星盘照常展示，前端给登录/额度引导并弹既有额度对话框）
 * - 'not-wired' 解读服务尚未接入（历史遗留档位：从历史恢复的旧结果沿用此档的中性文案）
 * - 'model'     解读未完成：模型配置缺失 / 上游超时或报错 / 分区校验不过 / 输出不完整
 *               （真值不受影响，前端给诚实失败卡 + 「重试解读」入口）
 */
export type AstrologyReportUnavailableReason = 'quota' | 'not-wired' | 'model';

/** 报告流事件全集（顺序见文件头；分区事件按 headline → bigThree → modules → transits 到达） */
export type AstrologyReportEvent =
  /** 不可变星盘事实层（本命盘 + 行运），永远是第一帧 */
  | { type: 'chart-facts'; facts: AstrologyChartFacts }
  /** 分区一：一句主轴（18–28 字，≥2 项真值依据） */
  | { type: 'headline'; headline: AstrologyHeadline }
  /** 分区二：大三要素（白话层 + 行为层；不可用项为 null） */
  | { type: 'bigThree'; bigThree: AstrologyBigThree }
  /** 分区三：五大生活模块（固定 id 与顺序，已按事实层白名单收敛依据） */
  | { type: 'modules'; modules: ModuleReading[] }
  /** 分区四：本周行运（行动三角 + 区间说明）与关键相位三段式 */
  | { type: 'transits'; transits: AstrologyTransitsSection }
  /** 解读层降级：解读不可用，附原因档（星盘不受影响） */
  | { type: 'interpretation-unavailable'; reason: AstrologyReportUnavailableReason }
  /** 本次报告流结束（解读已全部推送或已降级） */
  | { type: 'complete' }
  /** 服务端失败（真值未下发或无法继续），message 为可直接展示的中文说明 */
  | { type: 'error'; message: string };
