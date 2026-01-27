'use client';

import { cn } from '@/lib/utils';
import { useState } from 'react';

const aspectRatios = [
  { id: '1:1', label: '1:1', title: 'Square' },
  { id: '4:3', label: '4:3', title: 'Portrait' },
  { id: '16:9', label: '16:9', title: 'Landscape' },
];

export function SettingsPanel() {
  const [ratio, setRatio] = useState('16:9');
  const [steps, setSteps] = useState(30);
  const [cfg, setCfg] = useState(7.5);

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <div className="flex items-center gap-2 mb-2">
        <svg
          className="w-5 h-5 text-indigo-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
          />
        </svg>
        <h3 className="font-bold text-slate-800 dark:text-white">参数设置</h3>
      </div>

      {/* Aspect Ratio */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">宽高比例</span>
          <span className="text-slate-900 dark:text-white font-mono">{ratio}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-lg">
          {aspectRatios.map((item) => (
            <button
              key={item.id}
              onClick={() => setRatio(item.id)}
              className={cn(
                'text-xs py-1.5 rounded-md font-medium transition-all duration-200',
                ratio === item.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Steps Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">生成的质量 (Steps)</span>
          <span className="text-slate-900 dark:text-white font-mono">{steps}</span>
        </div>
        <input
          type="range"
          min="10"
          max="150"
          value={steps}
          onChange={(e) => setSteps(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* CFG Slider */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 font-medium">提示词相关性 (CFG)</span>
          <span className="text-slate-900 dark:text-white font-mono">{cfg}</span>
        </div>
        <input
          type="range"
          min="1"
          max="20"
          step="0.5"
          value={cfg}
          onChange={(e) => setCfg(Number(e.target.value))}
          className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* Seed Input */}
      <div className="space-y-3">
        <label className="text-xs text-slate-500 dark:text-slate-400 font-medium">
          种子 (Seed)
        </label>
        <div className="relative">
          <input
            type="text"
            defaultValue=""
            placeholder="随机 (-1)"
            className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
