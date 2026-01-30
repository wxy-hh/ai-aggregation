'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Search,
  FileText,
  PenTool,
  Bookmark,
  Zap,
  Clock,
  Mic,
  MessageSquare,
  Image as ImageIcon,
  ArrowRight,
  Plus,
  MoreHorizontal,
  Lightbulb,
  File,
} from 'lucide-react';

export function HomeContent() {
  return (
    <div className="flex h-full w-full bg-[#F3F5FA] dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden font-sans">
      {/* 
        二级侧边栏（发现） 
        基于 "Image 1" 描述：左侧侧边栏包含 “发现”、搜索、工具等。
      */}
      <aside className="w-[280px] h-full flex flex-col p-6 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 z-10 flex-shrink-0">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2">发现</h2>

        {/* 搜索 */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索功能、文档或指令..."
            className="w-full bg-white dark:bg-slate-800 border-none rounded-xl py-3 pl-10 pr-4 text-sm text-slate-600 dark:text-slate-300 placeholder:text-slate-400 shadow-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
          />
        </div>

        {/* 常用工具 */}
        <div className="mb-8">
          <h3 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-wider">
            常用工具
          </h3>
          <div className="space-y-1">
            <ToolItem
              icon={FileText}
              label="会议纪要"
              badge="关联语音"
              badgeColor="text-blue-500 bg-blue-50 dark:bg-blue-900/20"
              color="text-blue-600"
            />
            <ToolItem icon={PenTool} label="文案润色" color="text-purple-600" />
            <ToolItem icon={Bookmark} label="收藏夹" color="text-amber-500" />
          </div>
        </div>

        {/* 推荐指令 */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              推荐指令
            </h3>
            <Zap className="w-3 h-3 text-yellow-500 fill-current" />
          </div>

          <div className="space-y-3">
            <CommandCard
              icon={Mic}
              iconColor="text-purple-500"
              iconBg="bg-purple-100 dark:bg-purple-900/30"
              actionIcon={MessageSquare}
              actionColor="text-blue-500"
              actionBg="bg-blue-100 dark:bg-blue-900/30"
              label="将录音总结为文档"
            />
            <CommandCard
              icon={MessageSquare}
              iconColor="text-blue-500"
              iconBg="bg-blue-100 dark:bg-blue-900/30"
              actionIcon={ImageIcon}
              actionColor="text-pink-500"
              actionBg="bg-pink-100 dark:bg-pink-900/30"
              label="优化提示词并绘图"
            />
          </div>
        </div>

        {/* 最近文件 */}
        <div className="flex-1 overflow-y-auto no-scrollbar -mx-2 px-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              最近文件
            </h3>
            <ArrowRight className="w-3 h-3 text-slate-400 cursor-pointer hover:text-blue-500" />
          </div>
          <div className="space-y-3">
            <FileItem name="未来城市概念设计.png" type="image" />
            <FileItem name="Q3 业务复盘录音.mp3" type="audio" />
            <FileItem name="产品发布营销文案.doc" type="doc" />
          </div>
        </div>

        {/* 每日灵感 */}
        <div className="mt-4 p-4 bg-gradient-to-br from-white to-blue-50 dark:from-slate-800 dark:to-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 shadow-sm relative overflow-hidden group cursor-pointer">
          <div className="flex items-start gap-3 relative z-10">
            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-500">
              <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-sm mb-1">每日灵感</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                尝试使用"生成一份周报大纲"来提高效率。
              </p>
            </div>
          </div>
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-blue-500/10 rounded-full blur-xl group-hover:scale-150 transition-transform duration-500"></div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="flex-1 h-full overflow-y-auto custom-scrollbar relative">
        {/* 背景元素 */}
        <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-blue-100/50 to-transparent dark:from-blue-900/10 dark:to-transparent -z-10 pointer-events-none"></div>
        <div className="absolute top-20 right-20 w-96 h-96 bg-purple-200/30 dark:bg-purple-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"></div>
        <div
          className="absolute top-40 left-40 w-72 h-72 bg-blue-200/30 dark:bg-blue-900/20 rounded-full blur-3xl -z-10 animate-pulse pointer-events-none"
          style={{ animationDelay: '2s' }}
        ></div>

        <div className="max-w-[1400px] mx-auto px-8 py-10">
          {/* 具有高级深色混合效果的主视觉区域卡片 */}
          <div className="bg-gradient-to-b from-white/60 via-white/20 to-transparent dark:from-slate-900/60 dark:via-slate-900/20 dark:to-transparent backdrop-blur-2xl rounded-[48px] p-12 pb-0 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.1)] dark:shadow-none mb-16 relative overflow-hidden group/hero">
            {/* 渐变边框遮罩 - 创建“融合边缘”效果 */}
            <div className="absolute inset-0 rounded-[48px] border border-white/60 dark:border-white/10 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] pointer-events-none"></div>

            {/* 顶部光波/高光 */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50"></div>

            {/* 细腻的内部高光 */}
            <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent dark:from-white/5 pointer-events-none"></div>

            {/* 头部 */}
            <div className="text-center mb-16 relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold tracking-wider mb-6">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                AI PRODUCTIVITY SUITE
              </div>

              <h1 className="text-6xl font-black mb-6 tracking-tight text-slate-900 dark:text-white leading-tight">
                开启您的 AI{' '}
                <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  创作宇宙
                </span>
              </h1>

              <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto">
                集成尖端对话模型、高精度语音识别与艺术级图像生成，
                <br />
                为专业创作者打造的沉浸式智能工作空间。
              </p>
            </div>

            {/* 主要功能卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
              <FeatureCard
                href="/chat?new=true"
                title="智能对话"
                description="深度逻辑推理，支持多轮复杂指令理解与代码生成。"
                icon={MessageSquare}
                color="text-blue-600"
                gradient="from-blue-500/20 to-cyan-500/20"
                buttonText="新建对话"
                buttonIcon={Plus}
              />
              <FeatureCard
                href="/voice"
                title="语音转写"
                description="毫秒级低延迟，自动识别说话人并生成智能纪要。"
                icon={Mic}
                color="text-purple-600"
                gradient="from-purple-500/20 to-pink-500/20"
                buttonText="开始会议纪要"
                buttonIcon={ArrowRight}
              />
              <FeatureCard
                href="/image"
                title="灵感绘图"
                description="超写实艺术渲染，将文字提示瞬间转化为视觉杰作。"
                icon={ImageIcon}
                color="text-pink-600"
                gradient="from-pink-500/20 to-rose-500/20"
                buttonText="开始创作"
                buttonIcon={PenTool}
              />
            </div>
          </div>

          {/* 最近创作头部 */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" />
              最近创作
            </h2>
            <Button
              variant="ghost"
              className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              asChild
            >
              <Link href="/history" className="flex items-center gap-1">
                查看全部 <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>

          {/* 最近创作网格 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <CreationCard
              title="未来城市概念"
              time="2小时前"
              type="image"
              gradient="from-slate-800 to-black"
              status="completed"
            />
            <CreationCard
              title="产品营销文案"
              time="5小时前"
              type="doc"
              gradient="bg-white dark:bg-slate-800"
              status="completed"
            />
            <CreationCard
              title="Q3 业务复盘"
              time="昨天"
              type="audio"
              gradient="bg-white dark:bg-slate-800"
              status="processing"
            />

            {/* 新建项目卡片 */}
            <div className="h-40 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex flex-col items-center justify-center cursor-pointer group">
              <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform text-slate-400 group-hover:text-blue-500">
                <Plus className="w-5 h-5" />
              </div>
              <span className="font-medium text-slate-500 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400 transition-colors">
                新建项目
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// 子组件

function ToolItem({ icon: Icon, label, badge, badgeColor, color }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors group">
      <div className="flex items-center gap-3">
        <div
          className={`p-2 rounded-lg bg-slate-50 dark:bg-slate-800 group-hover:bg-white dark:group-hover:bg-slate-700 transition-colors ${color}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
      </div>
      {badge && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeColor}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

function CommandCard({
  icon: Icon,
  iconColor,
  iconBg,
  actionIcon: ActionIcon,
  actionColor,
  actionBg,
  label,
}: any) {
  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl hover:shadow-md transition-shadow cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center ${iconBg} ${iconColor}`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
        <div className="w-1 h-3 border-l border-dashed border-slate-300 dark:border-slate-600"></div>
        <div
          className={`w-6 h-6 rounded-md flex items-center justify-center ${actionBg} ${actionColor}`}
        >
          <ActionIcon className="w-3.5 h-3.5" />
        </div>
      </div>
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300 line-clamp-1">
        {label}
      </span>
    </div>
  );
}

function FileItem({ name, type }: { name: string; type: 'image' | 'doc' | 'audio' }) {
  let Icon = File;
  let color = 'text-slate-500';
  if (type === 'image') {
    Icon = ImageIcon;
    color = 'text-purple-500';
  }
  if (type === 'audio') {
    Icon = Mic;
    color = 'text-pink-500';
  }
  if (type === 'doc') {
    Icon = FileText;
    color = 'text-blue-500';
  }

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
      <Icon className={`w-4 h-4 ${color}`} />
      <span className="text-sm text-slate-600 dark:text-slate-400 truncate">{name}</span>
    </div>
  );
}

function FeatureCard({
  href,
  title,
  description,
  icon: Icon,
  color,
  gradient,
  buttonText,
  buttonIcon: ButtonIcon,
}: any) {
  return (
    <div className="relative overflow-hidden bg-white dark:bg-slate-900 rounded-[32px] p-8 shadow-xl hover:shadow-2xl transition-all duration-300 group border border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700">
      {/* 渐变背景光圈 */}
      <div
        className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${gradient} blur-3xl rounded-full translate-x-12 -translate-y-12 opacity-50 group-hover:opacity-100 transition-opacity duration-500`}
      ></div>

      <div
        className={`w-14 h-14 rounded-2xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-6 shadow-sm group-hover:scale-110 transition-transform duration-300 ${color}`}
      >
        <Icon className="w-7 h-7" />
      </div>

      <h3 className="text-2xl font-bold mb-3">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 leading-relaxed mb-8 min-h-[48px]">
        {description}
      </p>

      <Link href={href}>
        <div
          className={`inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 font-semibold text-sm hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${color}`}
        >
          {buttonText}
          <ButtonIcon className="w-4 h-4" />
        </div>
      </Link>
    </div>
  );
}

function CreationCard({ title, time, type, gradient, status }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-100 dark:border-slate-800 cursor-pointer group">
      <div
        className={`aspect-[4/3] rounded-xl mb-4 overflow-hidden relative ${type === 'image' ? '' : 'bg-slate-50 dark:bg-slate-800 flex items-center justify-center'}`}
      >
        {type === 'image' ? (
          <div
            className={`absolute inset-0 bg-gradient-to-br ${gradient} group-hover:scale-105 transition-transform duration-500`}
          >
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564&auto=format&fit=crop')] bg-cover bg-center opacity-80 mix-blend-overlay"></div>
          </div>
        ) : (
          <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
            {type === 'doc' ? <FileText className="w-10 h-10" /> : <Mic className="w-10 h-10" />}
          </div>
        )}

        {/* 状态指示点 */}
        <div
          className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full border border-white dark:border-slate-900 ${status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
        ></div>
      </div>

      <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">{title}</h4>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <div
          className={`w-1.5 h-1.5 rounded-full ${type === 'image' ? 'bg-purple-500' : type === 'doc' ? 'bg-blue-500' : 'bg-pink-500'}`}
        ></div>
        {time}
      </div>
    </div>
  );
}
