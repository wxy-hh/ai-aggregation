'use client';

/**
 * 星座寰宇 · 出生城市搜索
 *
 * 支持中国城市模糊搜索，选中后保存城市名与经纬度。
 * 仅候选项可提交——模糊文本不允许发起排盘（保证真值可复现）。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { searchCities, type ChinaCity } from '@repo/shared';
import { cn } from '@/lib/utils';
import type { BirthLocation } from './astrology-types';

type AstrologyCitySearchProps = {
  value: BirthLocation;
  onChange: (location: BirthLocation) => void;
  error?: string;
  disabled?: boolean;
};

export function AstrologyCitySearch({ value, onChange, error, disabled }: AstrologyCitySearchProps) {
  const [query, setQuery] = useState(value.name);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 外部值变化时同步输入框
  useEffect(() => {
    setQuery(value.name);
  }, [value.name]);

  const results = useMemo<ChinaCity[]>(() => {
    const q = query.trim();
    if (!q) return [];
    // 优先区县（level 2），兼顾街道
    return searchCities(q, 8);
  }, [query]);

  // 点击外部收起
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const hasExact = value.lat != null && value.lon != null && value.name;

  const pick = (city: ChinaCity) => {
    onChange({ name: city.fullName, lat: city.lat, lon: city.lon });
    setQuery(city.fullName);
    setOpen(false);
    setActiveIndex(-1);
  };

  const clear = () => {
    onChange({ name: '', lat: null, lon: null });
    setQuery('');
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      pick(results[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className={cn(
          'group relative flex h-11 items-center rounded-xl border bg-white/80 backdrop-blur-xl transition-all duration-200',
          'dark:bg-slate-900/80',
          error
            ? 'border-rose-500/60 focus-within:ring-2 focus-within:ring-rose-500/10'
            : hasExact
              ? 'border-emerald-500/50 focus-within:border-emerald-500/60 focus-within:ring-2 focus-within:ring-emerald-500/10'
              : 'border-slate-200/50 focus-within:border-blue-500/50 focus-within:ring-2 focus-within:ring-blue-500/10 dark:border-slate-800/50',
          disabled && 'cursor-not-allowed opacity-40'
        )}
      >
        <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          placeholder="搜索出生城市，如：北京、上海、成都"
          aria-label="出生城市"
          role="combobox"
          aria-expanded={open}
          aria-controls="astrology-city-listbox"
          aria-autocomplete="list"
          className="h-full w-full bg-transparent pl-11 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-200"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActiveIndex(-1);
            // 输入变化即视为未确认精确城市
            if (hasExact) onChange({ name: e.target.value, lat: null, lon: null });
          }}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="清除城市"
            className="mr-3 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 候选列表 */}
      {open && results.length > 0 && !disabled && (
        <div
          role="listbox"
          id="astrology-city-listbox"
          className="absolute z-50 mt-2 w-full overflow-hidden rounded-xl border border-white/60 bg-white/95 p-1 shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
        >
          {results.map((city, idx) => (
            <button
              key={city.id}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(city);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors',
                idx === activeIndex
                  ? 'bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-slate-700 hover:bg-slate-100/70 dark:text-slate-200 dark:hover:bg-slate-800/50'
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{city.fullName}</span>
            </button>
          ))}
        </div>
      )}

      {/* 状态提示 */}
      {error ? (
        <p className="ml-1 mt-1.5 text-[11px] font-medium text-rose-500">{error}</p>
      ) : query.trim() && !hasExact && !open ? (
        <p className="ml-1 mt-1.5 text-[11px] text-slate-400">请从候选列表中选择精确城市</p>
      ) : null}
    </div>
  );
}
