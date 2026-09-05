'use client';

/**
 * astrology-workspace.tsx —— 星座寰宇工作区
 *
 * 视图状态机（03 工单落地，后续工单逐格替换）：
 * - step=form 且 entryView=home：入口首页（价值主张 + 示例星盘 + 唯一主按钮）
 * - step=form 且 entryView=form：两步出生资料表单（04 工单：基本资料 → 时间校准台）
 * - step=form 且 entryView=loading：加载仪式（05 工单）
 * - step=result：结果页（06 首屏；07/08 深化；10 星语问答）
 *
 * 加载与结果由同一组件树承载（AstrologyRitualResult）：星盘轮以 layoutId
 * 在树内完成「绘制完成即升入报告」的共享元素转场，无卸载断片。
 *
 * 11 工单（统一历史）：
 * - 从全局历史页卡片进入时（URL 带 historyId），恢复该次结果并清理参数；
 * - 匿名会话的临时星盘记录，在检测到已登录时弹出明确确认，确认才迁移进统一历史。
 */

import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { History, Sparkles } from 'lucide-react';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { useHistoryStore } from '@/stores/history-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAstrologyTempRecordStore } from '@/stores/astrology-temp-record';
import { migrateTempRecordToHistory, restoreAstrologyFromHistory } from '@/lib/astrology/history';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { AstrologyEntryHome } from './astrology/astrology-entry-home';
import { AstrologyForm } from './astrology/astrology-form';
import { AstrologyRitualResult } from './astrology/astrology-ritual';
import { cn } from '@/lib/utils';

type AstrologyWorkspaceProps = {
  isActive: boolean;
};

export function AstrologyWorkspace({ isActive }: AstrologyWorkspaceProps) {
  const { step, entryView, setWorkspaceState } = useDestinyWorkspaceStore(
    useShallow((state) => ({
      step: state.astrology.step,
      entryView: state.astrology.entryView,
      setWorkspaceState: state.setWorkspaceState,
    }))
  );

  /* ---------- 11 工单：从历史记录恢复（与八字/奇门同一口径） ---------- */

  const isHistoryInitialized = useHistoryStore((state) => state.isInitialized);

  useEffect(() => {
    if (!isActive || !isHistoryInitialized) return;
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('historyId');
    if (!historyId) return;
    if (restoreAstrologyFromHistory(historyId)) {
      // 恢复完成后清理 URL 参数，避免刷新或切换模块时重复触发
      const url = new URL(window.location.href);
      url.searchParams.delete('historyId');
      window.history.replaceState({}, '', url.toString());
    }
  }, [isActive, isHistoryInitialized]);

  /* ---------- 11 工单：匿名临时记录的登录迁移确认 ---------- */

  const user = useAuthStore((state) => state.user);
  const tempRecord = useAstrologyTempRecordStore((state) => state.tempRecord);
  const clearTempRecord = useAstrologyTempRecordStore((state) => state.clearTempRecord);
  const [migrationOpen, setMigrationOpen] = useState(false);
  // 同一份临时记录只主动询问一次；用户关掉弹层不打断，会话结束记录自然消失
  const promptedRecordIdRef = useRef<string | null>(null);
  // 匿名接口显式返回 isAnonymous=true；真实用户该字段可能缺省（注册/登录响应不携带），按「非 true」判定
  const isLoggedIn = user !== null && user.isAnonymous !== true;

  useEffect(() => {
    if (!isActive || !isLoggedIn || !tempRecord) return;
    if (promptedRecordIdRef.current === tempRecord.id) return;
    promptedRecordIdRef.current = tempRecord.id;
    setMigrationOpen(true);
  }, [isActive, isLoggedIn, tempRecord]);

  /** 明确确认：迁移进统一历史（合并同逻辑记录的历代修订） */
  const confirmMigration = () => {
    migrateTempRecordToHistory();
    setMigrationOpen(false);
  };

  /** 明确拒绝：临时记录即弃（未确认的记录会话结束也会自然删除） */
  const declineMigration = () => {
    clearTempRecord();
    setMigrationOpen(false);
  };

  /* ---------- 视图分发 ---------- */

  return (
    <>
      {step === 'form' && entryView === 'home' ? (
        <AstrologyEntryHome
          onStart={() => setWorkspaceState('astrology', { entryView: 'form' })}
        />
      ) : step === 'form' && entryView === 'form' ? (
        // 04 工单：两步出生资料表单（基本资料 → 时间校准台）
        <AstrologyForm />
      ) : (
        // 加载仪式（entryView=loading）与结果页（step=result）同树承载，星盘共享元素转场
        <AstrologyRitualResult />
      )}

      {/* 登录迁移确认：底部抽屉形态（与模块内其他弹层一致），明确说明临时记录的归宿；
          挂在工作区根部，入口首页/表单/结果页任意视图下登录都能询问 */}
      <Dialog open={migrationOpen} onOpenChange={setMigrationOpen}>
        <DialogContent
          className={cn(
            'inset-x-0 bottom-0 top-auto w-full max-w-none translate-x-0 translate-y-0 sm:inset-x-6 sm:bottom-6 sm:rounded-[28px]',
            'rounded-t-[28px] border border-white/60 p-0 pb-[env(safe-area-inset-bottom)]',
            // 注意：/92 不在 Tailwind v3 默认透明度刻度（仅 5 的倍数），必须用方括号写法，否则暗色背景静默丢失
            'bg-white/90 backdrop-blur-2xl dark:border-white/10 dark:bg-[#0D1226]/[0.92]',
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
          )}
        >
          <div className="px-6 py-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300">
                <History className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <DialogTitle className="font-heading text-lg font-bold text-slate-900 dark:text-white">
                把这次星盘保存到历史记录？
              </DialogTitle>
            </div>
            <DialogDescription className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              你已登录账号。刚才的星盘结果目前只保留在当前会话里——保存后可在统一历史记录中随时重新查看；不保存的话，会话结束后将被删除。
            </DialogDescription>
            <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={declineMigration}
                className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-slate-400 dark:hover:text-slate-200"
              >
                不保存，会话结束后删除
              </button>
              <button
                type="button"
                onClick={confirmMigration}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#4969E9] via-[#5B6BF0] to-[#7C5CF6] px-6 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(73,105,233,0.55)] transition-transform duration-200 hover:scale-[1.02] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4969E9]/45"
              >
                <Sparkles className="h-4 w-4" strokeWidth={2} />
                保存到历史记录
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
