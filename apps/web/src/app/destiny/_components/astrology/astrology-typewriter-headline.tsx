'use client';

/**
 * astrology-typewriter-headline.tsx —— 结果页主轴逐字浮现（自持状态，把高频重渲染关在组件内）
 *
 * 为什么自持状态：逐字推进是 34ms/字的定时器，若把「已浮现字数」放在结果页父组件，
 * 每加一个字都会重渲染整棵结果页树（护照头、依据 chips、三要素卡、星盘轮、生活模块
 * 全部在同一次提交里）；把文案与时钟下沉到本组件后，高频重渲染只影响 <h2> 子树，
 * 父组件仅在落定那一刻通过 onDone 收到一次通知。
 *
 * 无障碍契约（不得回退）：视觉标题 aria-hidden——逐字中间态对读屏是噪音；
 * 读屏由 role="status" aria-live="polite" 的 sr-only 活体区承担，中间态不透传，
 * 落定后一次性朗读完整主轴。prefers-reduced-motion：跳过逐字，立即完整呈现并落定。
 *
 * 视觉契约（像素级不变）：第一个逗号前的观察句用琥珀金点亮、行动句保持高对比白/墨，
 * 未落定时末尾闪烁 ✦——类名与拆分逻辑与迁移前完全一致。
 */

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/** 逐字节奏（毫秒/字）：与迁移前一致，不改变阅读节奏 */
const TYPE_INTERVAL_MS = 34;

export function TypewriterHeadline({
  text,
  onDone,
}: {
  /** 完整主轴文案（真值即时可得，逐字只承担呈现节奏） */
  text: string;
  /** 落定回调：逐字完成时触发一次（文案变化重新打字后，下一次落定仍会触发） */
  onDone?: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  /** 已浮现字数：只驱动本子树，不冒泡到父组件 */
  const [typedCount, setTypedCount] = useState(0);
  /** 落定只回调一次（中途的重复渲染不再触发父组件更新） */
  const doneRef = useRef(false);

  useEffect(() => {
    // 减少动态 / 空文案：直接完整呈现，不做逐字
    if (!text || reduceMotion) {
      setTypedCount(text.length);
      return;
    }
    setTypedCount(0);
    const timer = window.setInterval(() => {
      setTypedCount((n) => {
        if (n >= text.length) {
          window.clearInterval(timer);
          return n;
        }
        return n + 1;
      });
    }, TYPE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [text, reduceMotion]);

  const done = text.length > 0 && typedCount >= text.length;

  useEffect(() => {
    if (!done) {
      doneRef.current = false;
      return;
    }
    if (doneRef.current) return;
    doneRef.current = true;
    onDone?.();
  }, [done, onDone]);

  // 视觉锚点：第一个逗号前的观察句用琥珀金渐变点亮，行动句保持高对比白/墨
  const splitIdx = text.indexOf('，');
  const headLen = splitIdx > 0 ? splitIdx : 0;
  const typed = text.slice(0, typedCount);
  const headPart = headLen > 0 ? typed.slice(0, headLen) : '';
  const restPart = headLen > 0 ? typed.slice(headLen) : typed;

  return (
    <>
      {/* 读屏状态宣布：逐字浮现的中间态不透给读屏（逐字朗读是噪音），
          落定后由活体区一次性朗读完整主轴；视觉标题因此 aria-hidden */}
      <p className="sr-only" role="status" aria-live="polite">
        {done ? text : ''}
      </p>
      <h2
        aria-hidden="true"
        className="font-heading text-[clamp(40px,4vw,56px)] font-bold leading-[1.18] tracking-tight text-slate-900 dark:text-white"
      >
        {headPart && (
          <span className="text-[#B47818] drop-shadow-[0_1px_1px_rgba(255,255,255,0.8)] dark:text-[#F3D17A] dark:drop-shadow-[0_2px_12px_rgba(243,209,122,0.25)]">
            {headPart}
          </span>
        )}
        {restPart}
        {!done && (
          <motion.span
            aria-hidden
            className="ml-1 inline-block text-indigo-400 dark:text-indigo-300"
            animate={reduceMotion ? {} : { opacity: [1, 0.15, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          >
            ✦
          </motion.span>
        )}
      </h2>
    </>
  );
}
