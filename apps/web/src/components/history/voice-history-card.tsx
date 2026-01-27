'use client';

import { cn } from '@/lib/utils';
import { HistoryItem } from './mock-data';

interface VoiceHistoryCardProps {
  item: HistoryItem;
}

export function VoiceHistoryCard({ item }: VoiceHistoryCardProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.model}</span>
        </div>
        <span className="text-xs text-slate-400">{item.date}</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
          {item.title}
        </h3>
        <span className="flex items-center gap-1 text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {item.duration}
        </span>
      </div>

      {/* Waveform Visualization Placeholder */}
      <div className="h-8 w-full flex items-end gap-0.5 mb-4 opacity-50 group-hover:opacity-100 transition-opacity">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-blue-500 rounded-full"
            style={{ height: `${Math.max(20, Math.random() * 100)}%` }}
          ></div>
        ))}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 flex-1 mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
          <span className="font-bold text-slate-400 mr-1">摘要</span>
          {item.preview}
        </p>
      </div>
    </div>
  );
}
