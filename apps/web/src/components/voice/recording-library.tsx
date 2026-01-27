import { cn } from '@/lib/utils';

interface Recording {
  id: string;
  title: string;
  time: string;
  duration: string;
  tags: ('Live' | 'AI' | 'Meeting' | 'Interview')[];
  active?: boolean;
}

const recordings: Recording[] = [
  {
    id: '1',
    title: '产品周会_20240127',
    time: '10:00 AM',
    duration: '00:45:12',
    tags: ['Live', 'Meeting'],
    active: true,
  },
  {
    id: '2',
    title: '个人备忘录_Idea',
    time: '09:15 AM',
    duration: '00:03:45',
    tags: ['AI'],
  },
  {
    id: '3',
    title: '客户访谈 - 张总',
    time: '昨天',
    duration: '00:28:05',
    tags: ['Interview'],
  },
  {
    id: '4',
    title: '英语口语练习',
    time: '昨天',
    duration: '00:15:00',
    tags: ['AI'],
  },
];

export function RecordingLibrary() {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-80 shrink-0">
      {/* Search Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">录音记录</h2>
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="搜索录音..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Group: Today */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 mb-2 px-2">今天</h3>
          <div className="space-y-2">
            {recordings.slice(0, 2).map((rec) => (
              <RecordingItem key={rec.id} recording={rec} />
            ))}
          </div>
        </div>

        {/* Group: Yesterday */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 mb-2 px-2">昨天</h3>
          <div className="space-y-2">
            {recordings.slice(2).map((rec) => (
              <RecordingItem key={rec.id} recording={rec} />
            ))}
          </div>
        </div>
      </div>

      {/* Storage Status */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-slate-600 dark:text-slate-300">云端存储</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">85%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div className="bg-blue-500 h-full rounded-full w-[85%]"></div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-right">已使用 4.2GB / 5.0GB</p>
      </div>
    </div>
  );
}

function RecordingItem({ recording }: { recording: Recording }) {
  return (
    <div
      className={cn(
        'p-3 rounded-xl border transition-all cursor-pointer group',
        recording.active
          ? 'bg-white dark:bg-blue-900/20 border-blue-500 shadow-md transform scale-[1.02]'
          : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-slate-600 hover:shadow-sm'
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center',
              recording.active
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
              />
            </svg>
          </div>
          <div>
            <h4
              className={cn(
                'text-sm font-semibold truncate max-w-[120px]',
                recording.active
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-slate-700 dark:text-slate-200'
              )}
            >
              {recording.title}
            </h4>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>{recording.time}</span>
              <span>•</span>
              <span>{recording.duration}</span>
            </div>
          </div>
        </div>
        {recording.active && (
          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300 text-[10px] font-bold rounded">
            Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-2">
        {recording.tags.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-[10px] rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
