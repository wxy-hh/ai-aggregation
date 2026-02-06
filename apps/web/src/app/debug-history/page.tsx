'use client';

import { useEffect, useState } from 'react';
import { useHistoryStore } from '@/stores/history-store';
import { Button } from '@/components/ui/button';

export default function DebugHistoryPage() {
  const [mounted, setMounted] = useState(false);
  const items = useHistoryStore((state) => state.items);
  const stats = useHistoryStore((state) => state.getStats());
  const clearHistory = useHistoryStore((state) => state.clearHistory);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">历史记录调试工具</h1>

      <div className="mb-6 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
        <h2 className="font-bold mb-2">统计信息</h2>
        <div className="grid grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-slate-500">总计</div>
            <div className="text-2xl font-bold">{stats.total}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">对话</div>
            <div className="text-2xl font-bold">{stats.chat}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">语音</div>
            <div className="text-2xl font-bold">{stats.voice}</div>
          </div>
          <div>
            <div className="text-sm text-slate-500">图片</div>
            <div className="text-2xl font-bold">{stats.image}</div>
          </div>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <Button
          onClick={() => {
            console.log('当前历史记录:', items);
            alert('已在控制台打印历史记录');
          }}
        >
          在控制台打印
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            if (confirm('确定要清空所有历史记录吗？')) {
              clearHistory();
              alert('已清空');
            }
          }}
        >
          清空所有历史记录
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="font-bold">历史记录列表</h2>
        {items.length === 0 ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-lg text-center text-slate-500">
            暂无历史记录
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 text-xs font-bold rounded ${
                      item.type === 'chat'
                        ? 'bg-green-100 text-green-700'
                        : item.type === 'voice'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {item.type}
                  </span>
                  <span className="font-bold">{item.title}</span>
                </div>
                <span className="text-xs text-slate-500">{item.date}</span>
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                {item.preview}
              </div>
              <div className="mt-2 text-xs text-slate-400">
                ID: {item.id} | Created: {new Date(item.createdAt).toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
        <h3 className="font-bold mb-2">调试提示</h3>
        <ul className="text-sm space-y-1 list-disc list-inside">
          <li>打开浏览器开发者工具 (F12)</li>
          <li>进入 Application → Local Storage → 查看 "ai-history-store"</li>
          <li>进行一次对话/生成图片/转写音频</li>
          <li>刷新此页面查看是否有新记录</li>
          <li>检查控制台是否有 "✓ 已保存到统一历史记录" 的日志</li>
        </ul>
      </div>
    </div>
  );
}
