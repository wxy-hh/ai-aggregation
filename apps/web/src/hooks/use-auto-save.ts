/**
 * 自动保存 Hook
 *
 * 功能:
 * - 监听数据变化并自动触发保存
 * - 2 秒防抖逻辑
 * - 仅在数据实际变化时触发保存
 * - 管理保存状态（保存中/已保存/保存失败）
 * - 保存失败时自动重试
 *
 * 对应需求: 11.1, 11.3, 11.4, 11.8
 */

import { useEffect, useRef, useCallback } from 'react';
import { useResumeEditorStore } from '@/stores/resume-editor-store';
import type { ResumeDocument } from '@/types/resume-editor';

/**
 * 自动保存配置
 */
export interface AutoSaveConfig {
  /** 防抖延迟时间（毫秒），默认 2000ms */
  debounceMs?: number;
  /** 最大重试次数，默认 3 次 */
  maxRetries?: number;
  /** 重试延迟时间（毫秒），默认 1000ms */
  retryDelayMs?: number;
}

/**
 * 自动保存 Hook
 */
export function useAutoSave(config: AutoSaveConfig = {}) {
  const { debounceMs = 2000, maxRetries = 3, retryDelayMs = 1000 } = config;

  const doc = useResumeEditorStore((state) => state.doc);
  const setSaveStatus = useResumeEditorStore((state) => state.setSaveStatus);
  const setLastSavedAt = useResumeEditorStore((state) => state.setLastSavedAt);

  // 保存上一次的文档快照，用于检测变化
  const previousDocRef = useRef<string | null>(null);
  // 防抖定时器
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 重试计数器
  const retryCountRef = useRef(0);

  /**
   * 执行保存操作
   */
  const performSave = useCallback(
    async (docToSave: ResumeDocument) => {
      try {
        console.log('[AutoSave] 开始保存，状态: saving');
        setSaveStatus('saving');

        // 模拟保存到 localStorage（实际项目中可能是 API 调用）
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 保存成功
        localStorage.setItem(
          'resume-editor:v1',
          JSON.stringify({
            state: {
              doc: docToSave,
              lastSavedAt: new Date().toISOString(),
            },
            version: 0,
          })
        );

        console.log('[AutoSave] 保存成功，状态: saved');
        setSaveStatus('saved');
        setLastSavedAt(new Date().toISOString());
        retryCountRef.current = 0; // 重置重试计数

        // 5 秒后将状态重置为 idle（延长显示时间以便观察）
        setTimeout(() => {
          console.log('[AutoSave] 状态重置为 idle');
          setSaveStatus('idle');
        }, 5000);
      } catch (error) {
        console.error('[AutoSave] 保存失败:', error);

        // 如果还有重试次数，则自动重试
        if (retryCountRef.current < maxRetries) {
          retryCountRef.current += 1;
          console.log(
            `[AutoSave] 保存失败，${retryDelayMs}ms 后进行第 ${retryCountRef.current} 次重试...`
          );

          setTimeout(() => {
            performSave(docToSave);
          }, retryDelayMs);
        } else {
          // 重试次数用尽，显示错误状态
          console.log('[AutoSave] 重试次数用尽，状态: error');
          setSaveStatus('error');
          retryCountRef.current = 0; // 重置重试计数
        }
      }
    },
    [setSaveStatus, setLastSavedAt, maxRetries, retryDelayMs]
  );

  /**
   * 手动触发保存（用于用户主动保存）
   */
  const triggerSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSave(doc);
  }, [doc, performSave]);

  /**
   * 监听文档变化并触发自动保存
   */
  useEffect(() => {
    const currentDocSnapshot = JSON.stringify(doc);

    // 首次加载时，保存快照但不触发保存
    if (previousDocRef.current === null) {
      console.log('[AutoSave] 首次加载，保存文档快照');
      previousDocRef.current = currentDocSnapshot;
      return;
    }

    // 检查数据是否真的发生了变化
    if (currentDocSnapshot === previousDocRef.current) {
      console.log('[AutoSave] 数据未变化，跳过保存');
      return; // 数据未变化，不触发保存
    }

    console.log('[AutoSave] 检测到数据变化，启动防抖定时器');
    // 更新快照
    previousDocRef.current = currentDocSnapshot;

    // 清除之前的防抖定时器
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // 设置新的防抖定时器
    debounceTimerRef.current = setTimeout(() => {
      console.log('[AutoSave] 防抖时间到，触发保存');
      performSave(doc);
    }, debounceMs);

    // 清理函数
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [doc, debounceMs, performSave]);

  return {
    /** 手动触发保存 */
    triggerSave,
  };
}
