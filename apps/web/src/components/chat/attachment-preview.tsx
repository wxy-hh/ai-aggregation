'use client';

/**
 * 附件预览组件（AttachmentPreview）
 *
 * 职责与交互约定：
 * 1. 图片附件预览与灯箱（Lightbox）：
 *    - 默认以最大高度 200px、最大宽度 300px 渲染圆角缩略图，左下角附带附件名称标签；
 *    - 桌面端悬停（hover）时浮现快捷操作条（包含「查看原图」与「下载图片」操作）；
 *    - 移动端无需悬停交互，点击缩略图覆层按钮即为直接进入 Lightbox 查看原图的主入口；
 *    - 缩略图容器遵循 DESIGN.md §8.3 兄弟覆层按钮模式，通过透明覆层按钮提供可访问性与原生键盘（Enter/Space）支持；
 *    - 基于项目 Radix Dialog 体系封装，支持 Esc 键、点击背景遮罩与点击关闭按钮关闭，并自动锁定背景滚动；
 *    - Lightbox 底部操作区集成「下载」按钮与文件名称展示，所有 aria-label 均为纯中文；
 * 2. 媒体代理下载：
 *    - 远端地址复用 downloadImage(imageUrl)，通过 BFF 媒体代理避免直接跨域下载受限与鉴权失效；
 *    - 本地 DataURL（用户上传图/图像页接力图）同源可直接取 Blob，**不经代理**（代理只接受 http(s) 上游）；
 *    - 下载触发机制：Blob -> URL.createObjectURL -> a[download] 点击触发，文件名格式为 `${baseName}-${Date.now()}${ext}`（解析原扩展名，无扩展名默认 .png）；
 *    - 对象 URL 于 1000ms 后延迟注销，避免竞态释放；
 *    - 失败兜底：toast.error 提示错误，仅当 http(s) 远端地址时才回退到 window.open 打开原图，data/blob 协议禁止 open；
 *    - 状态管理：isDownloading 状态控制下载中禁用态与文案反馈（「下载中…」）；
 * 3. 文件附件渲染：
 *    - type === 'file' 分支完全保持原样，展示带有红底文件图标、文件名和格式化大小的文件卡片，无灯箱行为；
 * 4. 规范与可访问性：
 *    - 所有交互按钮均保障热区不小于 44x44；
 *    - 动效令牌严格使用 duration-fast 与 ease-out-expo。
 */

import React, { memo, useState, useCallback } from 'react';
import { Eye, Download } from 'lucide-react';
import { toast } from 'sonner';
import type { Attachment } from '@/stores/chat-store';
// 通用代理下载器：跨域下载必须经 BFF 媒体代理，避免浏览器跨域拦截并保障上游鉴权与白名单安全
import { downloadImage } from '@/lib/api/agnes';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export interface AttachmentPreviewProps {
  attachment: Attachment;
}

export const AttachmentPreview = memo(function AttachmentPreview({
  attachment,
}: AttachmentPreviewProps) {
  // 控制原图灯箱（Lightbox）弹层的显示与隐藏
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  // 控制图片下载中状态，防止并发重复触发并驱动按钮禁用态与文案反馈
  const [isDownloading, setIsDownloading] = useState(false);

  // 处理图片下载：本地 DataURL（用户上传图/接力图）同源直接取 Blob，
  // 远端地址经 BFF 媒体代理避免跨域受限，统一走对象 URL 触发 a 标签下载
  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const url = attachment.imageUrl;
      if (!url || isDownloading) return;

      setIsDownloading(true);
      try {
        const blob = /^(data:|blob:)/i.test(url)
          ? await (await fetch(url)).blob()
          : await downloadImage(url);
        const objectUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;

        // 解析文件名与扩展名：lastIndexOf('.') > 0 时拆分，保留原扩展名含点；无扩展名默认 .png
        const rawName = attachment.name || 'image';
        const lastDotIndex = rawName.lastIndexOf('.');
        const hasValidExt = lastDotIndex > 0;
        const baseName = hasValidExt ? rawName.slice(0, lastDotIndex) : rawName;
        const ext = hasValidExt ? rawName.slice(lastDotIndex) : '.png';
        link.download = `${baseName}-${Date.now()}${ext}`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 延迟 1000ms 注销对象 URL，避免并发或大文件下载时 URL 过早释放导致浏览器下载中断
        setTimeout(() => {
          window.URL.revokeObjectURL(objectUrl);
        }, 1000);
      } catch (error) {
        console.error('下载图片失败:', error);
        toast.error('下载失败，请稍后重试');
        // 安全防护：禁止对 data:/blob: 协议调用 window.open，仅当 http(s) 协议命中时才兜底打开
        if (/^https?:\/\//i.test(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      } finally {
        setIsDownloading(false);
      }
    },
    [attachment.imageUrl, attachment.name, isDownloading]
  );

  // 图片附件分支
  if (attachment.type === 'image' && attachment.imageUrl) {
    return (
      <>
        {/* 缩略图容器：普通 div，无容器级按键监听或按钮角色，点击交互由兄弟覆层按钮提供 */}
        <div className="relative group/image mb-2 inline-block select-none">
          {/* 图片缩略图 */}
          <img
            src={attachment.imageUrl}
            alt={attachment.name}
            className="max-h-[200px] max-w-[300px] rounded-2xl border border-white/70 object-cover shadow-[0_10px_24px_rgba(76,95,154,0.1)] transition-transform duration-fast ease-out-expo active:scale-[0.99]"
          />

          {/* 兄弟覆层按钮：透明覆盖在缩略图上，提供无障碍语义支持并响应点击与原生键盘 Enter/Space */}
          <button
            type="button"
            onClick={() => setIsLightboxOpen(true)}
            aria-label={`查看图片附件 ${attachment.name}`}
            className="absolute inset-0 z-0 h-full w-full cursor-pointer rounded-2xl opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />

          {/* 附件名称胶囊 */}
          <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full border border-white/20 bg-slate-950/60 px-2.5 py-1 text-xs text-white backdrop-blur-sm">
            {attachment.name}
          </div>

          {/* 桌面端悬停操作条（移动端常显）：z-10 确保层级高于覆层按钮 */}
          <div
            className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-xl bg-slate-950/70 p-1 border border-white/20 backdrop-blur-md shadow-lg transition-opacity duration-fast ease-out-expo max-sm:opacity-100 opacity-0 group-hover/image:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 查看原图按钮：热区 >= 44x44 */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsLightboxOpen(true);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-[color,background-color,transform] duration-fast ease-out-expo active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              title="查看原图"
              aria-label="查看原图"
            >
              <Eye className="w-4 h-4" />
              <span className="sr-only">查看原图</span>
            </button>

            {/* 下载图片按钮：热区 >= 44x44 */}
            <button
              type="button"
              disabled={isDownloading}
              onClick={(e) => {
                e.stopPropagation();
                void handleDownload(e);
              }}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-white/90 hover:text-white hover:bg-white/20 transition-[color,background-color,transform] duration-fast ease-out-expo active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:pointer-events-none"
              title="下载图片"
              aria-label="下载图片"
            >
              <Download className="w-4 h-4" />
              <span className="sr-only">下载图片</span>
            </button>
          </div>
        </div>

        {/* 全屏原图灯箱（Lightbox）：深色面板，覆盖默认关闭按钮的浅色 hover 样式避免对比度刺眼 */}
        <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
          <DialogContent
            className="max-w-[95vw] sm:max-w-4xl max-h-[92vh] p-4 sm:p-6 bg-slate-950/90 border-slate-800 text-white flex flex-col items-center justify-between rounded-2xl shadow-2xl backdrop-blur-xl [&>button]:text-white/80 [&>button:hover]:bg-white/20 [&>button:hover]:text-white"
            aria-label="查看原图"
          >
            <DialogTitle className="sr-only">查看原图</DialogTitle>
            <DialogDescription className="sr-only">附件原图预览与操作</DialogDescription>

            {/* 原图展示区 */}
            <div className="relative flex flex-1 items-center justify-center w-full min-h-0 overflow-auto my-2">
              <img
                src={attachment.imageUrl}
                alt={attachment.name}
                className="max-h-[72vh] sm:max-h-[76vh] w-auto max-w-full object-contain rounded-lg shadow-md"
              />
            </div>

            {/* 底部操作区 */}
            <div className="flex items-center justify-between w-full pt-3 border-t border-white/10 gap-3">
              <span className="truncate text-xs sm:text-sm text-slate-300 max-w-[65%]" title={attachment.name}>
                {attachment.name}
              </span>
              <Button
                type="button"
                disabled={isDownloading}
                onClick={(e) => {
                  void handleDownload(e);
                }}
                variant="default"
                className="min-h-[44px] min-w-[44px] px-4 py-2 flex items-center gap-2 rounded-xl transition-transform duration-fast ease-out-expo active:scale-95 disabled:opacity-50"
                aria-label="下载图片"
              >
                <Download className="w-4 h-4" />
                <span>{isDownloading ? '下载中…' : '下载'}</span>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // 文件附件分支：保持原样迁入
  if (attachment.type === 'file') {
    return (
      <div className="mb-2 flex items-center gap-3 rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 shadow-[0_8px_20px_rgba(76,95,154,0.08)] dark:border-slate-700/80 dark:bg-slate-800/[0.72]">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/[0.12]">
          <svg
            className="w-4 h-4 text-red-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-100">
            {attachment.name}
          </p>
          {attachment.size && (
            <p className="text-xs text-slate-400">{(attachment.size / 1024).toFixed(1)} KB</p>
          )}
        </div>
      </div>
    );
  }

  return null;
});
