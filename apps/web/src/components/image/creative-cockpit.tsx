'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Sparkles, Zap, History, LayoutGrid, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CreativeCockpitProps {
  className?: string;
  currentPrompt?: string;
  onPromptAppend?: (text: string) => void;
  onStyleApply?: (style: any) => void;
  onRestoreParams?: (params: any) => void;
}

const MAGIC_PROMPTS = [
  {
    label: '赛博光效',
    text: '霓虹灯光，赛博朋克氛围，体积光，未来感',
    color: 'text-blue-400',
    border: 'border-blue-500/30',
    bg: 'bg-blue-500/10',
  },
  {
    label: '4K 细节',
    text: '8k分辨率，超细节，清晰对焦，杰作',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
    bg: 'bg-purple-500/10',
  },
  {
    label: '丁达尔光',
    text: '丁达尔光，电影级布光，氛围感，梦幻',
    color: 'text-yellow-400',
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/10',
  },
  {
    label: '广角镜头',
    text: '广角镜头，全景视图，史诗级宏大场面',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
  },
  {
    label: '人像特写',
    text: '人像特写，细节眼部，皮肤纹理',
    color: 'text-pink-400',
    border: 'border-pink-500/30',
    bg: 'bg-pink-500/10',
  },
  {
    label: '虚幻引擎',
    text: '虚幻引擎5渲染，octane渲染，3D，写实',
    color: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bg: 'bg-cyan-500/10',
  },
];

export function CreativeCockpit({ className, onPromptAppend, onStyleApply }: CreativeCockpitProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div
      className={cn(
        'relative flex flex-col h-full transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] z-20',
        isCollapsed ? 'w-12 border-l-0' : 'w-80',
        className
      )}
    >
      {/* 玻璃外壳 */}
      <div
        className={cn(
          'absolute inset-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-3xl border-l border-white/20 dark:border-white/5 shadow-[-20px_0_50px_rgba(0,0,0,0.1)] transition-all duration-500',
          isCollapsed && 'bg-transparent backdrop-blur-none border-none shadow-none'
        )}
      />

      {/* 切换按钮 */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={cn(
          'absolute -left-3 top-6 w-6 h-6 rounded-full bg-white dark:bg-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] border border-white/50 dark:border-slate-700 flex items-center justify-center z-30 hover:scale-110 transition-all duration-300 cursor-pointer group',
          isCollapsed ? 'translate-x-3' : ''
        )}
      >
        {isCollapsed ? (
          <ChevronLeft className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
        ) : (
          <ChevronRight className="w-3 h-3 text-slate-400 group-hover:text-blue-500" />
        )}
      </button>

      {/* 内容容器 */}
      <div
        className={cn(
          'relative flex flex-col h-full overflow-hidden transition-all duration-500',
          isCollapsed ? 'opacity-0 translate-x-10 pointer-events-none' : 'opacity-100 translate-x-0'
        )}
      >
        {/* 头部：创作驾驶舱 */}
        <div className="flex-none px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-1.5">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500 blur-[8px] opacity-40 animate-pulse" />
              <div className="relative p-1.5 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-500">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-white tracking-wide">
                创作灵感舱
              </h2>
              <div className="text-[9px] font-bold text-indigo-500 uppercase tracking-[0.2em]">
                Creative Cockpit
              </div>
            </div>
          </div>
        </div>

        {/* 滚动区域 */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8">
          {/* 模块 1: 魔法咒语增强 */}
          <section className="space-y-4 group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-blue-500" />
                <span>魔法咒语增强</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 font-mono">
                AI BOOSTER
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {MAGIC_PROMPTS.map((item, index) => (
                <button
                  key={index}
                  onClick={() => onPromptAppend?.(item.text)}
                  className={cn(
                    'relative overflow-hidden rounded-xl p-3 text-left transition-all duration-300 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer group/chip',
                    'border backdrop-blur-md bg-white/40 dark:bg-slate-800/40',
                    item.border
                  )}
                >
                  <div
                    className={cn(
                      'absolute inset-0 opacity-0 group-hover/chip:opacity-100 transition-opacity duration-500',
                      item.bg
                    )}
                  />
                  <div className="relative z-10">
                    <span className={cn('text-xs font-bold block mb-0.5', item.color)}>
                      {item.label}
                    </span>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 line-clamp-1 opacity-70">
                      {item.text}
                    </span>
                  </div>
                  {/* 晶体高光效果 */}
                  <div className="absolute -top-10 -right-10 w-20 h-20 bg-white/20 rotate-45 blur-xl group-hover/chip:translate-y-5 transition-transform duration-700" />
                </button>
              ))}
            </div>
          </section>

          {/* 分割线 */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-white/10 to-transparent opacity-50" />

          {/* 模块 2: 灵感流 (Inspiration Stream) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <LayoutGrid className="w-3.5 h-3.5 text-purple-500" />
                <span>社区灵感流</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {[
                {
                  id: 1,
                  image:
                    'https://images.unsplash.com/photo-1535868463750-c78d9543614f?auto=format&fit=crop&w=400&q=80',
                  tags: ['Cyberpunk', 'Neon'],
                  prompt: '赛博朋克, 霓虹雨夜, 未来城市, 湿润地面反射',
                  params: { ratio: '9:16', steps: 30, style: 'cyberpunk' },
                },
                {
                  id: 2,
                  image:
                    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
                  tags: ['3D', 'Abstract'],
                  prompt: '3D渲染, 极简主义, 抽象几何, 柔和光影, 甚至配色',
                  params: { ratio: '1:1', steps: 25, style: '3d-render' },
                },
                {
                  id: 3,
                  image:
                    'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=400&q=80',
                  tags: ['Nature', 'Epic'],
                  prompt: '史诗级风景, 广角大片, 晨雾, 壮丽山脉, 8k分辨率',
                  params: { ratio: '16:9', steps: 40, style: 'landscape' },
                },
                {
                  id: 4,
                  image:
                    'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&w=400&q=80',
                  tags: ['Art', 'Oil'],
                  prompt: '油画风格, 印象派, 浓厚笔触, 星空, 艺术杰作',
                  params: { ratio: '3:4', steps: 35, style: 'oil-painting' },
                },
                {
                  id: 5,
                  image:
                    'https://images.unsplash.com/photo-1515462277126-2dd0c162007a?auto=format&fit=crop&w=400&q=80',
                  tags: ['Dark', 'Mystery'],
                  prompt: '暗黑风格, 神秘氛围, 电影质感, 侧光, 悬疑',
                  params: { ratio: '16:9', steps: 50, style: 'realistic' },
                },
                {
                  id: 6,
                  image:
                    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                  tags: ['Portrait', 'Soft'],
                  prompt: '精美人像, 柔光摄影, 眼神光, 皮肤纹理, 浅景深',
                  params: { ratio: '3:4', steps: 30, style: 'realistic' },
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-square rounded-xl overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-all border border-white/10"
                >
                  {/* 真实图片背景 */}
                  <img
                    src={item.image}
                    alt={item.tags[0]}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  {/* 噪点纹理叠加，增加胶片感 */}
                  <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay" />

                  {/* 悬停玻璃遮罩 */}
                  <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center p-2 gap-3">
                    {/* 流光溢彩的标签 */}
                    <div className="flex flex-wrap justify-center gap-1.5 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300 delay-75">
                      {item.tags.map((tag, i) => (
                        <span
                          key={i}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded shadow-[0_0_10px_rgba(255,255,255,0.3)] bg-gradient-to-r from-white/20 to-white/10 text-white border border-white/20 backdrop-blur-md"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* 克隆按钮 */}
                    <Button
                      size="sm"
                      className="h-7 text-[10px] px-3 rounded-lg bg-white text-black hover:bg-white/90 shadow-[0_0_20px_rgba(255,255,255,0.4)] transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 delay-100 font-bold tracking-wide"
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        onPromptAppend?.(item.prompt);
                        onStyleApply?.(item.params);
                      }}
                    >
                      <Sparkles className="w-3 h-3 mr-1 text-purple-600" />
                      克隆参数
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* 分割线 */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 dark:via-white/10 to-transparent opacity-50" />

          {/* 模块 3: 参数回溯 (Parameter Snapshot) */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5 text-emerald-500" />
                <span>参数回溯</span>
              </div>
            </div>

            <div className="relative pl-4 space-y-6 before:absolute before:left-[5px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200 dark:before:bg-white/10">
              {[
                { id: 1, time: '刚刚', params: { seed: 12345, cfg: 7 }, img: 'bg-indigo-500' },
                { id: 2, time: '10分钟前', params: { seed: 67890, cfg: 9 }, img: 'bg-pink-500' },
                { id: 3, time: '30分钟前', params: { seed: 11223, cfg: 5 }, img: 'bg-emerald-500' },
              ].map((snap, i) => (
                <div key={snap.id} className="relative group cursor-pointer">
                  {/* 时间轴节点 */}
                  <div className="absolute -left-[15px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-800 bg-slate-200 dark:bg-slate-700 group-hover:bg-emerald-500 group-hover:first-letter:scale-125 transition-all z-10" />

                  <div className="flex items-start gap-3 p-2 rounded-xl hover:bg-white/50 dark:hover:bg-white/5 border border-transparent hover:border-slate-100 dark:hover:border-white/5 transition-all">
                    <div className={cn('w-10 h-10 rounded-lg shrink-0 shadow-sm', snap.img)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] text-slate-400 font-mono">{snap.time}</span>
                        <History className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-300 font-medium truncate">
                        Seed: {snap.params.seed}
                      </div>
                      <div className="text-[9px] text-slate-400">
                        CFG: {snap.params.cfg} · Steps: 30
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* 折叠态图标栏 */}
      <div
        className={cn(
          'absolute top-0 right-0 w-full h-full flex flex-col items-center pt-20 gap-6 transition-opacity duration-500',
          isCollapsed ? 'opacity-100 visible delay-200' : 'opacity-0 invisible'
        )}
      >
        <div
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
          title="魔法增强"
        >
          <Zap className="w-5 h-5" />
        </div>
        <div
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-purple-400 transition-colors cursor-pointer"
          title="灵感流"
        >
          <LayoutGrid className="w-5 h-5" />
        </div>
        <div
          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          title="历史回溯"
        >
          <History className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
