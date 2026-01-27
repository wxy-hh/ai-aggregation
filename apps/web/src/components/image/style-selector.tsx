'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';

const styles = [
  { id: '3d-render', name: '3D 渲染', icon: 'box' },
  { id: 'realistic', name: '超写实', icon: 'camera' },
  { id: 'cyberpunk', name: '赛博朋克', icon: 'cube' },
  { id: 'anime', name: '动漫插画', icon: 'pen' },
  { id: 'watercolor', name: '水彩画', icon: 'drop' },
  { id: 'sketch', name: '素描', icon: 'pencil' },
];

export function StyleSelector() {
  const [selected, setSelected] = useState('3d-render');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-5 h-5 text-purple-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
        <h3 className="font-bold text-slate-800 dark:text-white">风格艺术</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {styles.map((style) => (
          <button
            key={style.id}
            onClick={() => setSelected(style.id)}
            className={cn(
              'relative p-4 rounded-xl border flex flex-col items-center gap-3 transition-all duration-200 group',
              selected === style.id
                ? 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                : 'bg-white dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
            )}
          >
            {/* Active Indication Dot */}
            {selected === style.id && (
              <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm animate-pulse-slow"></div>
            )}

            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                selected === style.id
                  ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
              )}
            >
              {/* Simple Icons based on type */}
              {style.icon === 'box' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              )}
              {style.icon === 'camera' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              )}
              {style.icon === 'cube' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5"
                  />
                </svg>
              )}
              {style.icon === 'pen' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              )}
              {style.icon === 'drop' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
              )}
              {style.icon === 'pencil' && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              )}
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                selected === style.id
                  ? 'text-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              )}
            >
              {style.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
