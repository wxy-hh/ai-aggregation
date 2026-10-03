'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

// 全局通知组件：基于 Emil Kowalski 的 Sonner 规范，定制融合通透磨砂玻璃与细腻微投影
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      position="top-center"
      closeButton
      richColors
      style={{ zIndex: 99999 }}
      toastOptions={{
        classNames: {
          toast:
            'group toast font-sans rounded-2xl border border-white/70 bg-white/85 p-4 text-slate-800 shadow-[0_16px_36px_rgba(76,95,154,0.14)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-900/85 dark:text-slate-100 dark:shadow-[0_20px_40px_rgba(0,0,0,0.45)]',
          description: 'group-[.toast]:text-slate-500 dark:group-[.toast]:text-slate-400 text-xs mt-1',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-xl font-medium text-xs',
          cancelButton:
            'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-600 dark:group-[.toast]:bg-slate-800 dark:group-[.toast]:text-slate-300 group-[.toast]:rounded-xl text-xs',
          closeButton:
            'border-white/50 bg-white/80 dark:border-slate-700 dark:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-[color,background-color,transform] duration-fast ease-out-expo',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
