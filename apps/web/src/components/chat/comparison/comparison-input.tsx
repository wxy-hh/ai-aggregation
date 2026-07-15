'use client';

/**
 * 比较输入区 — 固定在主工作区底部
 *
 * 已选模型 Chip（当前聚焦高亮）+ 添加模型 + 文本输入 + 主按钮「同时发送」+ 成本提示。
 * 首轮调 sendComparison，已有轮次调 continueComparison。发送按钮 ≥44×44。
 */

import { memo, useEffect, useRef, useState } from 'react';
import { Send, Loader2, X, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { ModelSelector } from './model-selector';
import { toModelKey } from '@/types/comparison';
import { CHAT_MODEL_CATALOG, MIN_COMPARE_MODELS } from '@/lib/constants/chat-models';
import {
  useComparisonStore,
  useSelectedModels,
  useComparisonTurns,
} from '@/stores/comparison-store';
import { useConversationsStore } from '@/stores/conversations-store';
import { ReferenceBar } from '@/components/relay/reference-bar';
import { ReferenceSourcePreview } from '@/components/relay/reference-source-preview';
import { useRelayReceive } from '@/components/relay/use-relay-receive';
import { RELAY_COPY } from '@/lib/relay/copy';

const TEXTAREA_MAX_HEIGHT = 140;

export const ComparisonInput = memo(function ComparisonInput() {
  const selectedModels = useSelectedModels();
  const turns = useComparisonTurns();
  const input = useComparisonStore((s) => s.input);
  const setInput = useComparisonStore((s) => s.setInput);
  const sendComparison = useComparisonStore((s) => s.sendComparison);
  const continueComparison = useComparisonStore((s) => s.continueComparison);
  const toggleModel = useComparisonStore((s) => s.toggleModel);
  const loadComparison = useComparisonStore((s) => s.loadComparison);

  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 跨模态接力：对比模式共享输入区接收（引用只在底部共享输入区，不复制到每个回答面板）
  // 落点语义（M-3/D4）：对比模式下接力落点为「当前对比会话」——草稿预填到共享输入区；
  // 单聊模式落点由 chat/page.tsx 保证为单聊会话（若停在比较会话则新建单聊）。
  const relay = useRelayReceive('chat');
  const [relayPreviewOpen, setRelayPreviewOpen] = useState(false);
  const relayBundleText = relay.bundle?.items[0]?.snapshotText ?? '';

  // H6 落点固定：接力到达时若 activeComparisonId 为 null 但存在对比会话，恢复最近一个为落点，
  // 避免发送时新建空对比会话而割裂已有上下文（M-3/D4：对比模式落点为「当前对比会话」）
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (useComparisonStore.getState().activeComparisonId) return;
    const latestCompare = useConversationsStore
      .getState()
      .conversations.find((c) => c.mode === 'compare');
    if (latestCompare) loadComparison(latestCompare.id);

  }, [relay.initialized, relay.bundle?.id]);

  // 到达且有文本快照且当前输入为空时直接预填，不自动发送
  useEffect(() => {
    if (!relay.initialized || !relay.bundle) return;
    if (relayBundleText && !input.trim()) {
      setInput(relayBundleText);
      relay.setDraft(relayBundleText);
    }

  }, [relay.initialized, relay.bundle?.id]);

  const hasTurns = turns.length > 0;
  const isStreaming = turns.some((t) => Object.values(t.runs).some((r) => r.status === 'streaming'));
  const canSend = input.trim().length > 0 && selectedModels.length >= MIN_COMPARE_MODELS && !isStreaming;

  // 当前轮焦点（用于 chip 高亮）
  const lastTurn = turns[turns.length - 1];
  const focusKeys = lastTurn
    ? new Set([lastTurn.focusSlots.left, lastTurn.focusSlots.right])
    : new Set<string>();

  const handleSend = async () => {
    if (!canSend) return;
    // 接力两阶段（REQ-016）：发送前只读派生元数据（不清引用），发送成功才 commit 清引用与草稿；
    // 失败/跳过时引用与草稿原样保留，允许原地重试
    const derivation = relay.prepareExecution();
    const result = hasTurns
      ? await continueComparison(input, derivation)
      : await sendComparison(input, derivation);
    if (result === 'sent') {
      relay.commitExecution();
    }
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  };

  return (
    <div className="mx-auto w-full max-w-4xl">
      {/* 已选模型 Chip 行 */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
        {selectedModels.map((m) => {
          const key = toModelKey(m.provider, m.model);
          const focused = focusKeys.has(key);
          return (
            <span
              key={key}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                focused
                  ? 'border-blue-400/60 bg-blue-50/70 text-blue-700 dark:border-blue-500/40 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'border-white/60 bg-white/50 text-slate-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300'
              )}
            >
              {focused && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              {m.label}
              <button
                type="button"
                onClick={() => {
                  const item = CHAT_MODEL_CATALOG.find(
                    (c) => toModelKey(c.provider, c.model) === key
                  );
                  if (item) toggleModel(item);
                }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-slate-200/70 dark:hover:bg-slate-700/70"
                aria-label={`移除 ${m.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <ModelSelector variant="add" />
      </div>

      {/* 接力引用条：对比模式下位于模型选择区与共享输入区之间（REQ-007） */}
      {relay.replaceCandidate ? (
        <div className="mb-2 px-1">
          <ReferenceBar
            bundle={relay.replaceCandidate.incoming}
            isReplaceCandidate
            onConfirmReplace={relay.confirmReplace}
            onCancelReplace={relay.cancelReplace}
            onRemove={relay.remove}
          />
        </div>
      ) : relay.bundle ? (
        <div className="mb-2 px-1">
          <ReferenceBar
            bundle={relay.bundle}
            onRemove={relay.remove}
            onViewSource={() => setRelayPreviewOpen(true)}
            showFill={Boolean(relayBundleText) && input.trim() !== relayBundleText}
            onFill={() => {
              setInput(relayBundleText);
              relay.setDraft(relayBundleText);
            }}
          />
        </div>
      ) : relay.isInvalid ? (
        <p className="mb-2 px-1 text-xs text-amber-600 dark:text-amber-400">
          {RELAY_COPY.referenceBar.invalid}
        </p>
      ) : null}

      {/* 输入坞（与 ChatInput 同系 G-2 玻璃） */}
      <div
        className={cn(
          'flex items-end gap-1 rounded-2xl p-1.5',
          'border border-white/60 bg-white/60 shadow-sm backdrop-blur-xl',
          'transition-all duration-200',
          'hover:border-slate-300/80 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-slate-700/80',
          'focus-within:border-blue-500/50 focus-within:bg-white/70 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.12),0_4px_12px_-2px_rgba(59,130,246,0.15)]',
          'dark:focus-within:border-blue-500/40 dark:focus-within:bg-slate-950/75'
        )}
      >
        <Textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          placeholder={hasTurns ? '继续追问，各模型将基于各自上下文作答…' : '输入问题，同时发送给所选模型…'}
          title="Enter 发送，Shift + Enter 换行"
          className="max-h-[140px] min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100"
        />

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="同时发送"
          className={cn(
            'mb-0.5 mr-0.5 flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white transition duration-200',
            'border border-blue-400/20 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500',
            'shadow-[0_4px_12px_-2px_rgba(59,130,246,0.35)] hover:brightness-105 active:scale-[0.98]',
            'disabled:cursor-not-allowed disabled:border-slate-200 disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none',
            'dark:disabled:border-slate-700 dark:disabled:from-slate-700 dark:disabled:via-slate-700 dark:disabled:to-slate-700'
          )}
        >
          {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">同时发送</span>
        </button>
      </div>

      {/* 成本/辅助提示 */}
      <p className="mt-1.5 flex items-center justify-center gap-1.5 px-1 text-center text-[10px] leading-tight text-slate-400/80 dark:text-slate-500/80">
        <Layers className="h-3 w-3" />
        {selectedModels.length} 个模型并发，当前聚焦比较 2 个
        {selectedModels.length < MIN_COMPARE_MODELS && (
          <span className="text-amber-500">（至少选 {MIN_COMPARE_MODELS} 个）</span>
        )}
      </p>

      {/* 接力来源只读预览 */}
      <ReferenceSourcePreview
        open={relayPreviewOpen}
        onOpenChange={setRelayPreviewOpen}
        item={relay.bundle?.items[0] ?? null}
      />
    </div>
  );
});
