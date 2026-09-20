'use client';

/**
 * astrology-qa-capacity.ts —— 星语问答 · 可用额度折算的提问能力（剩余次数徽章口径）
 *
 * 能问几次只由账号可用额度决定（不设每报告次数上限）：
 * 可用额度（QuotaAccount.availableUnits）÷ 单次提问的额度预算（见 qa-events 的同名常量）。
 *
 * 额度取 /api/profile/usage 的 tokenRemaining（与个人中心「文本/语音额度」同一份数据）：
 * - 管理员返回 null / 未取到（未登录、网络失败）→ 返回 null，调用方显示「不限次数」，
 *   额度是不是够由服务端在提问时裁决（不足即 402 + 全局额度弹框，与其他模块同一条链路）。
 *
 * 已提问数变化（新提问入列、回答落地）即重新取额度：一次提问会真实消耗额度，旧数值不再作数。
 */

import { useEffect, useState } from 'react';
import { fetchProfileUsageSummary } from '@/lib/api/profile';
import { ASTROLOGY_QA_QUESTION_UNITS } from '@/lib/astrology/qa-events';
import { useAuthStore } from '@/stores/auth-store';

/**
 * @param asked 本报告已提问数（变化即重新取额度，保证徽章与余额同步）
 * @returns 可用额度还能支撑的提问次数；null = 不受额度限制 / 额度未知（调用方回落到每报告剩余）
 */
export function useAstrologyQaQuestionCapacity(asked: number): number | null {
  /** undefined = 额度在途；null = 不受额度限制或取不到；number = 可用额度（tokens） */
  const [availableUnits, setAvailableUnits] = useState<number | null | undefined>(undefined);
  /** 管理员不受额度限制：连额度查询都不必打（结果页每回答一次问一次，省一次重聚合） */
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');

  useEffect(() => {
    if (isAdmin) return;
    let alive = true;
    fetchProfileUsageSummary()
      .then((summary) => {
        if (!alive) return;
        setAvailableUnits(typeof summary.tokenRemaining === 'number' ? summary.tokenRemaining : null);
      })
      .catch(() => {
        if (alive) setAvailableUnits(null);
      });
    return () => {
      alive = false;
    };
  }, [asked, isAdmin]);

  if (isAdmin) return null;
  if (typeof availableUnits !== 'number') return null;
  return Math.max(0, Math.floor(availableUnits / ASTROLOGY_QA_QUESTION_UNITS));
}
