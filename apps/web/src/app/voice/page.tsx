import { AppLayout } from '@/components/layout/app-layout';

export default function VoicePage() {
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 font-heading">
            语音转写
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            毫秒级低延迟，自动断句说话人并生成会议纪要
          </p>
        </div>

        <div className="bg-white dark:bg-dark-card rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-dark-border">
          <p className="text-slate-600 dark:text-slate-400">语音转写功能开发中...</p>
        </div>
      </div>
    </AppLayout>
  );
}
