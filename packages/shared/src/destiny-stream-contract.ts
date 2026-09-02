// ============================================
// Destiny 报告流式 SSE 事件契约 — 前后端唯一权威定义
// --------------------------------------------
// 适用链路（BFF → 前端 SSE）：
//   - /api/destiny/report（八字流式报告）
//   - /api/destiny/ziwei-report（紫微流式报告）
//
// 事件类型（每条流共 4 类，联合类型即完整枚举）：
//   - status         阶段状态（queued/charting/analyzing/finalizing；可重复）
//   - section-final  分区定稿（可重复；每个 sectionKey 至多一次，payload 类型随 key 收窄）
//   - complete       最终报告（终止事件；流中最后一个数据事件）
//   - error          错误（终止事件；出现后流关闭）
//
// 线协议：单帧单事件，`data: <JSON>\n\n`（与 chat-stream-contract 同一线协议）。
// 对齐 chat-stream-contract.ts 的契约思路：编码（后端）与解码（前端）共用同一类型，
// 杜绝双端字符串漂移。
// ============================================

import type { DestinyReport } from './destiny-report';
import type {
  BaziSectionKey,
  BaziSectionPayloadMap,
  ZiweiSectionKey,
  ZiweiSectionPayloadMap,
} from './destiny-report-stream-maps';

/** 流阶段状态 */
export type DestinyStreamStatus = 'queued' | 'charting' | 'analyzing' | 'finalizing';

/** 八字流事件 — status / section-final / complete / error 四类 */
export type BaziStreamEvent =
  | { type: 'status'; status: DestinyStreamStatus }
  | {
      [K in BaziSectionKey]: {
        type: 'section-final';
        sectionKey: K;
        payload: BaziSectionPayloadMap[K];
      };
    }[BaziSectionKey]
  | { type: 'complete'; report: DestinyReport }
  | { type: 'error'; error: string };

/** 紫微流事件 — status / section-final / complete / error 四类 */
export type ZiweiStreamEvent =
  | { type: 'status'; status: DestinyStreamStatus }
  | {
      [K in ZiweiSectionKey]: {
        type: 'section-final';
        sectionKey: K;
        payload: ZiweiSectionPayloadMap[K];
      };
    }[ZiweiSectionKey]
  | { type: 'complete'; report: DestinyReport }
  | { type: 'error'; error: string };

/** 八字流 section-final 事件（payload 类型随 sectionKey 收窄的工具类型） */
export type BaziSectionFinalEvent = Extract<
  BaziStreamEvent,
  { type: 'section-final' }
>;

/** 紫微流 section-final 事件类型收窄工具类型 */
export type ZiweiSectionFinalEvent = Extract<
  ZiweiStreamEvent,
  { type: 'section-final' }
>;

/**
 * 编码一条 destiny 流事件为 SSE 帧字符串（`data: <JSON>\n\n`）。
 * 类型化签名：只能传 BaziStreamEvent/ZiweiStreamEvent，未在契约内的事件编译期拒绝，
 * 与 lib/utils/sse.ts 的 encodeChatSseEvent 同一标准，消除 destiny 与 chat 双标。
 */
export function encodeDestinyStreamEvent(
  event: BaziStreamEvent | ZiweiStreamEvent
): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
