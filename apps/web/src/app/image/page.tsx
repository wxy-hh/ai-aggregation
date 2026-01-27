import { AppLayout } from '@/components/layout/app-layout';

export default function ImagePage() {
  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-4 font-heading">
            灵感绘图
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            超写实艺术渲染，将文字提示瞬间转化为视觉杰作
          </p>
        </div>

        <div className="bg-white dark:bg-dark-card rounded-2xl p-8 shadow-sm border border-slate-200 dark:border-dark-border">
          <p className="text-slate-600 dark:text-slate-400">图像生成功能开发中...</p>
        </div>
      </div>
    </AppLayout>
  );
}
