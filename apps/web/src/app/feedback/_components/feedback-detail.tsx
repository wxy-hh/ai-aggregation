'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { FeedbackItem } from '../page';
import { authHeaders } from '@/lib/api/client';
import { TYPE_CONFIG, STATUS_CONFIG, PRIORITY_CONFIG } from './feedback-constants';
import {
  X, MessageCircle, Send, Pin, Check, Loader2, Paperclip,
} from 'lucide-react';

interface FeedbackDetailProps {
  feedback: FeedbackItem;
  onClose: () => void;
  isAdmin: boolean;
  onRefresh: () => void;
  currentUserId?: string;
}

interface Reply {
  id: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
}

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
  createdAt: string;
}

export function FeedbackDetail({ feedback, onClose, isAdmin, onRefresh, currentUserId }: FeedbackDetailProps) {
  const [detail, setDetail] = useState<(FeedbackItem & { replies: Reply[]; attachments?: Attachment[] }) | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  useEffect(() => {
    fetchDetail();
  }, [feedback.id]);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`/api/feedback/${feedback.id}`, {
        headers: authHeaders(undefined, null),
      });
      const data = await res.json();
      if (data.success) {
        setDetail(data.data);
      }
    } catch (e) {
      // 静默处理
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    setSendingReply(true);
    try {
      const res = await fetch(`/api/feedback/${feedback.id}/reply`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyContent('');
        fetchDetail();
        onRefresh();
      }
    } catch (e) {
      // 静默处理
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/feedback/${feedback.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: newStatus, resolvedAt: newStatus === 'COMPLETED' ? new Date().toISOString() : null }),
      });
      const data = await res.json();
      if (data.success) {
        fetchDetail();
        onRefresh();
      }
    } catch (e) {
      // 静默处理
    } finally {
      setUpdatingStatus(false);
      setShowStatusMenu(false);
    }
  };

  const handleUpdatePriority = async (newPriority: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/feedback/${feedback.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ priority: newPriority }),
      });
      const data = await res.json();
      if (data.success) {
        fetchDetail();
        onRefresh();
      }
    } catch (e) {
      // 静默处理
    } finally {
      setUpdatingStatus(false);
      setShowPriorityMenu(false);
    }
  };

  const handleTogglePin = async () => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/feedback/${feedback.id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ isPinned: !display.isPinned }),
      });
      const data = await res.json();
      if (data.success) {
        fetchDetail();
        onRefresh();
      }
    } catch (e) {
      // 静默处理
    } finally {
      setUpdatingStatus(false);
    }
  };

  const display = detail || feedback;
  const tcfg = TYPE_CONFIG[display.type] || TYPE_CONFIG.OTHER;
  const scfg = STATUS_CONFIG[display.status] || STATUS_CONFIG.PENDING;
  const pcfg = PRIORITY_CONFIG[display.priority] || PRIORITY_CONFIG.MEDIUM;
  const TypeIcon = tcfg.icon;
  const attachments = (detail?.attachments || []) as Attachment[];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        'relative w-full sm:w-[600px] max-h-[92vh] sm:max-h-[88vh] overflow-y-auto hide-scrollbar',
        'bg-white dark:bg-[#1a1f3a]',
        'rounded-t-3xl sm:rounded-3xl',
        'border border-[#E8ECF5] dark:border-[#2d3454]',
        'shadow-[0_24px_48px_-12px_rgba(0,0,0,0.18)]',
        'pb-safe'
      )}>
        {/* 头部 */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-white dark:bg-[#1a1f3a] border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2">
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', tcfg.bg)}>
              <TypeIcon className={cn('w-4 h-4', tcfg.color)} />
            </div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 font-heading">反馈详情</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 标题与状态 */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{display.title}</h3>
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', scfg.bg)}>
                <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1', scfg.dot)} />
                {scfg.label}
              </span>
              <span className={cn('text-[10px] font-semibold', pcfg.color)}>{pcfg.label}优先级</span>
              {display.isPinned && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5 fill-current" />置顶
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4969E9] to-[#7B8FFF] flex items-center justify-center text-white text-[8px] font-bold">
                {(display.user.name || display.user.username).charAt(0).toUpperCase()}
              </div>
              <span className="font-medium text-slate-500 dark:text-slate-400">{display.user.name || display.user.username}</span>
              <span>·</span>
              <span>{new Date(display.createdAt).toLocaleDateString('zh-CN')}</span>
            </div>
          </div>

          {/* 内容 */}
          <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
            {display.content}
          </div>

          {/* 标签 */}
          {display.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {display.tags.map((tag) => (
                <span key={tag} className="text-[11px] px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* 附件展示 */}
          {attachments.length > 0 && (
            <div>
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-[#5D7CFA]" />
                附件截图 ({attachments.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {attachments.map((att) => (
                  <a
                    key={att.id}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 group cursor-pointer"
                  >
                    <img
                      src={att.fileUrl}
                      alt={att.fileName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* 管理员操作 */}
          {isAdmin && (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={handleTogglePin}
                disabled={updatingStatus}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium transition-all',
                  'min-h-[44px]',
                  display.isPinned
                    ? 'bg-gradient-to-r from-amber-500 to-orange-400 text-white shadow-md'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                )}
              >
                <Pin className={cn('w-3.5 h-3.5', display.isPinned && 'fill-current')} />
                {display.isPinned ? '已置顶' : '置顶'}
              </button>

              <div className="relative">
                <button
                  onClick={() => { setShowPriorityMenu(!showPriorityMenu); setShowStatusMenu(false); }}
                  disabled={updatingStatus}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium transition-all',
                    'min-h-[44px]',
                    'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  )}
                >
                  <span className={cn('w-2 h-2 rounded-full', pcfg.color.replace('text-', 'bg-'))} />
                  {pcfg.label}优先级
                </button>
                {showPriorityMenu && (
                  <div className={cn(
                    'absolute right-0 top-full mt-2 w-40 rounded-2xl overflow-hidden z-20',
                    'bg-white dark:bg-[#252b4a] shadow-xl border border-slate-100 dark:border-slate-700'
                  )}>
                    {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => handleUpdatePriority(key)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className={cn('w-2 h-2 rounded-full', cfg.color.replace('text-', 'bg-'))} />
                        {cfg.label}优先级
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => { setShowStatusMenu(!showStatusMenu); setShowPriorityMenu(false); }}
                  disabled={updatingStatus}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-medium transition-all',
                    'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-md',
                    'min-h-[44px]'
                  )}
                >
                  {updatingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  更新状态
                </button>
                {showStatusMenu && (
                  <div className={cn(
                    'absolute right-0 top-full mt-2 w-48 rounded-2xl overflow-hidden z-20',
                    'bg-white dark:bg-[#252b4a] shadow-xl border border-slate-100 dark:border-slate-700'
                  )}>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => handleUpdateStatus(key)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 分割线 */}
          <div className="border-t border-slate-100 dark:border-slate-700/50 pt-2" />

          {/* 回复列表 */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
              <MessageCircle className="w-4 h-4 text-[#5D7CFA]" />
              回复 ({detail?.replies?.length || display.replyCount})
            </h4>
            <div className="space-y-3">
              {detail?.replies?.filter((r) => !r.isInternal).map((reply) => (
                <div key={reply.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4969E9] to-[#7B8FFF] flex items-center justify-center text-white text-[8px] font-bold shrink-0 mt-0.5">
                    {(reply.user.name || reply.user.username).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{reply.user.name || reply.user.username}</span>
                      <span className="text-[10px] text-slate-400">{new Date(reply.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{reply.content}</p>
                  </div>
                </div>
              )) || (display.replyCount > 0 && (
                <div className="text-center py-4 text-sm text-slate-400">加载回复中...</div>
              ))}
              {(detail?.replies?.filter((r) => !r.isInternal).length || 0) === 0 && display.replyCount === 0 && (
                <div className="text-center py-4 text-sm text-slate-400">暂无回复，来发表第一条评论吧！</div>
              )}
            </div>
          </div>

          {/* 回复输入 */}
          {currentUserId && (
            <form onSubmit={handleReply} className="flex gap-2 pt-2">
              <input
                type="text"
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="写下你的回复..."
                className={cn(
                  'flex-1 px-4 py-2.5 rounded-2xl text-sm',
                  'bg-white dark:bg-[#252b4a] border border-[#E8ECF5] dark:border-[#2d3454]',
                  'text-slate-700 dark:text-slate-200 placeholder:text-slate-400',
                  'focus:outline-none focus:ring-2 focus:ring-[#7B8FFF]/30',
                  'min-h-[44px]'
                )}
              />
              <button
                type="submit"
                disabled={sendingReply || !replyContent.trim()}
                className={cn(
                  'px-4 py-2.5 rounded-2xl text-white transition-all',
                  'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF]',
                  'shadow-[0_4px_12px_rgba(93,124,250,0.24)]',
                  'hover:shadow-[0_6px_16px_rgba(93,124,250,0.32)]',
                  'active:scale-[0.97]',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                  'min-h-[44px] min-w-[44px] flex items-center justify-center'
                )}
              >
                {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
