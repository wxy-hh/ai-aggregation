import { cn } from '@/lib/utils';

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  speaker: string;
  role: 'Speaker A' | 'Speaker B' | 'Speaker C';
  text: string;
  active?: boolean;
}

interface TranscriptListProps {
  segments: TranscriptSegment[];
}

export function TranscriptList({ segments }: TranscriptListProps) {
  return (
    <div className="space-y-6">
      {segments.map((segment) => (
        <div
          key={segment.id}
          className={cn(
            'group relative p-4 rounded-xl transition-all duration-300 border',
            segment.active
              ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800 shadow-sm'
              : 'border-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50'
          )}
        >
          {/* Active Indicator Line */}
          {segment.active && (
            <div className="absolute left-0 top-4 bottom-4 w-1 bg-blue-500 rounded-r-full" />
          )}

          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4">
            {/* Metadata */}
            <div className="flex sm:flex-col items-center sm:items-start gap-2 sm:gap-1 min-w-[120px]">
              <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                {segment.timestamp}
              </span>
              <div
                className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-md',
                  segment.role === 'Speaker A'
                    ? 'text-blue-600 bg-blue-100 dark:text-blue-300 dark:bg-blue-900/30'
                    : 'text-purple-600 bg-purple-100 dark:text-purple-300 dark:bg-purple-900/30'
                )}
              >
                {segment.speaker}
              </div>
            </div>

            {/* Text Content */}
            <div className="flex-1">
              <p
                className={cn(
                  'leading-relaxed text-[15px]',
                  segment.active
                    ? 'text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-300'
                )}
              >
                {segment.text}
              </p>

              {/* Segment Actions (Hover) */}
              <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  播放
                </button>
                <button className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  编辑
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
