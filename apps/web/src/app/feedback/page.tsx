'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { AuthGuard } from '@/components/auth/auth-guard';
import { FeedbackList } from './_components/feedback-list';
import { FeedbackForm } from './_components/feedback-form';
import { FeedbackDetail } from './_components/feedback-detail';
import { TYPE_LABEL, STATUS_LABEL } from './_components/feedback-constants';
import { authFetch } from '@/lib/api/client';
import { MessageSquarePlus, Filter, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/auth-store';

type SortBy = 'newest' | 'oldest' | 'priority';
type FilterType = 'ALL' | 'BUG' | 'FEATURE' | 'UI' | 'PERFORMANCE' | 'OTHER';
type FilterStatus = 'ALL' | 'PENDING' | 'UNDER_REVIEW' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'DECLINED';

const LIMIT = 10;

export interface FeedbackItem {
  id: string;
  type: string;
  status: string;
  priority: string;
  title: string;
  content: string;
  isPinned: boolean;
  tags: string[];
  replyCount: number;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    username: string;
    name: string | null;
    avatar: string | null;
  };
}

export default function FeedbackPage() {
  const { user } = useAuthStore();
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [filterType, setFilterType] = useState<FilterType>('ALL');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);

  // 刷新列表（筛选/排序变化时重置）
  const fetchFeedbacks = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const params = new URLSearchParams();
      params.set('page', '1');
      params.set('limit', String(LIMIT));
      params.set('sortBy', sortBy);
      if (filterType !== 'ALL') params.set('type', filterType);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await authFetch(`/api/feedback?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setFeedbacks(data.data.items);
        setHasMore(data.data.page < data.data.totalPages);
      }
    } catch (e) {
      // 静默处理
    } finally {
      setLoading(false);
    }
  }, [sortBy, filterType, filterStatus, debouncedSearch]);

  // 加载更多（追加到现有列表）
  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const params = new URLSearchParams();
      params.set('page', String(nextPage));
      params.set('limit', String(LIMIT));
      params.set('sortBy', sortBy);
      if (filterType !== 'ALL') params.set('type', filterType);
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await authFetch(`/api/feedback?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setFeedbacks((prev) => [...prev, ...data.data.items]);
        setPage(nextPage);
        setHasMore(nextPage < data.data.totalPages);
      }
    } catch (e) {
      // 静默处理
    } finally {
      setLoadingMore(false);
    }
  }, [page, sortBy, filterType, filterStatus, debouncedSearch, loadingMore]);

  useEffect(() => {
    fetchFeedbacks();
  }, [fetchFeedbacks]);

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <AppLayout>
        <div className="min-h-screen w-full bg-[#F5F7FA] dark:bg-[#0A0E27] flex flex-col">
          {/* 顶部玻璃拟态标题栏 */}
          <div className="sticky top-0 z-30 bg-white/70 dark:bg-[#1a1f3a]/70 backdrop-blur-2xl border-b border-white/40 dark:border-white/10">
            <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 font-heading tracking-tight">
                    用户反馈
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    提交问题、建议，参与产品共建
                  </p>
                </div>
                <button
                  onClick={() => setShowForm(true)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-2xl font-medium text-sm',
                    'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white',
                    'shadow-[0_8px_20px_rgba(93,124,250,0.28)]',
                    'hover:shadow-[0_12px_28px_rgba(93,124,250,0.36)]',
                    'active:scale-[0.97] transition-all duration-200',
                    'min-h-[44px]'
                  )}
                >
                  <MessageSquarePlus className="w-4 h-4" />
                  <span className="hidden sm:inline">提交反馈</span>
                </button>
              </div>

              {/* 筛选与搜索栏 */}
              <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                      searchTimerRef.current = setTimeout(() => setDebouncedSearch(e.target.value), 300);
                    }}
                    placeholder="搜索反馈标题或内容..."
                    className={cn(
                      'w-full pl-10 pr-4 py-2.5 rounded-2xl text-sm',
                      'bg-white/80 dark:bg-[#252b4a]/80',
                      'border border-[#E8ECF5] dark:border-[#2d3454]',
                      'text-slate-700 dark:text-slate-200 placeholder:text-slate-400',
                      'focus:outline-none focus:ring-2 focus:ring-[#7B8FFF]/30',
                      'backdrop-blur-md transition-all'
                    )}
                  />
                  <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-medium',
                      'bg-white/80 dark:bg-[#252b4a]/80 backdrop-blur-md',
                      'border border-[#E8ECF5] dark:border-[#2d3454]',
                      'text-slate-600 dark:text-slate-300',
                      'hover:bg-white dark:hover:bg-[#2d3454] transition-all',
                      'min-h-[44px]'
                    )}
                  >
                    <Filter className="w-4 h-4" />
                    筛选
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showFilters && 'rotate-180')} />
                  </button>
                  {/* 自定义排序下拉 */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSortMenu(!showSortMenu)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-2.5 rounded-2xl text-sm font-medium',
                        'bg-white/80 dark:bg-[#252b4a]/80 backdrop-blur-md',
                        'border border-[#E8ECF5] dark:border-[#2d3454]',
                        'text-slate-600 dark:text-slate-300',
                        'hover:bg-white dark:hover:bg-[#2d3454] transition-all',
                        'min-h-[44px]'
                      )}
                    >
                      {sortBy === 'newest' ? '最新' : sortBy === 'oldest' ? '最早' : '优先级'}
                      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', showSortMenu && 'rotate-180')} />
                    </button>
                    {showSortMenu && (
                      <>
                        {/* 点击外部关闭 */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={(e) => { e.stopPropagation(); setShowSortMenu(false); }}
                        />
                        <div className={cn(
                          'absolute right-0 top-full mt-2 w-32 rounded-2xl overflow-hidden z-20',
                          'bg-white dark:bg-[#252b4a] shadow-xl border border-slate-100 dark:border-slate-700'
                        )}>
                          {([
                            { value: 'newest', label: '最新' },
                            { value: 'oldest', label: '最早' },
                            { value: 'priority', label: '优先级' },
                          ] as const).map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => { setSortBy(opt.value); setPage(1); setShowSortMenu(false); }}
                              className={cn(
                                'w-full text-left px-4 py-2.5 text-sm transition-colors',
                                'hover:bg-slate-50 dark:hover:bg-slate-800',
                                sortBy === opt.value
                                  ? 'text-[#5D7CFA] font-semibold bg-blue-50/50 dark:bg-blue-900/10'
                                  : 'text-slate-600 dark:text-slate-300'
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 展开筛选条件 */}
              {showFilters && (
                <div className="mt-3 flex flex-wrap gap-2 pb-1">
                  {(['ALL', 'BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER'] as FilterType[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { setFilterType(t); setPage(1); }}
                      className={cn(
                        'px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
                        'min-h-[36px]',
                        filterType === t
                          ? 'bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white shadow-md'
                          : 'bg-white/70 dark:bg-[#252b4a]/70 text-slate-600 dark:text-slate-400 border border-[#E8ECF5] dark:border-[#2d3454]'
                      )}
                    >
                      {TYPE_LABEL[t]}
                    </button>
                  ))}
                </div>
              )}

              {/* 状态筛选 */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(['ALL', 'PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED'] as FilterStatus[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => { setFilterStatus(s); setPage(1); }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all',
                      'min-h-[32px]',
                      filterStatus === s
                        ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 内容区 */}
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-16 flex-1 overflow-y-auto">
            <FeedbackList
              items={feedbacks}
              loading={loading}
              hasMore={hasMore}
              loadingMore={loadingMore}
              onLoadMore={loadMore}
              onSelect={setSelectedFeedback}
              isAdmin={isAdmin}
            />
          </div>
        </div>

        {/* 提交表单弹窗 */}
        {showForm && (
          <FeedbackForm
            onClose={() => setShowForm(false)}
            onSuccess={() => {
              setShowForm(false);
              fetchFeedbacks();
            }}
          />
        )}

        {/* 详情弹窗 */}
        {selectedFeedback && (
          <FeedbackDetail
            feedback={selectedFeedback}
            onClose={() => setSelectedFeedback(null)}
            isAdmin={isAdmin}
            onRefresh={fetchFeedbacks}
            currentUserId={user?.id}
          />
        )}
      </AppLayout>
    </AuthGuard>
  );
}
