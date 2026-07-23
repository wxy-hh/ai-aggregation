'use client';

import React, { useRef } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Crown,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MessageSquare,
  Mic,
  PencilLine,
  RefreshCw,
  User,
  Video,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import {
  fetchProfileUsageSummary,
  updateProfile,
  deleteAccount,
  uploadAvatar,
} from '@/lib/api/profile';
import type { ProfileUsageItem } from '@repo/shared';
import type { ProfileViewModel, ResourceUsageViewModel } from './profile-types';
import { toast } from 'sonner';

const DEFAULT_AVATAR =
  'https://api.dicebear.com/9.x/thumbs/svg?seed=ai-user&backgroundColor=bfdbfe&shapeColor=0a5b83';

/**
 * 页面材质分级（对齐 DESIGN.md）：
 * - 玻璃质感只保留在容器层（基本信息卡 / 资源消耗卡），内层元素一律不用 backdrop-blur，
 *   避免「玻璃套玻璃」导致的画面发糊与 GPU 浪费（DESIGN.md 禁忌一）。
 * - 阴影即 Z 轴高度：主卡 Z-3、次级操作卡 Z-2、页头扁平无阴影，形成清晰层级。
 */
const GLASS_CARD =
  'group relative overflow-hidden rounded-[24px] border border-white/60 bg-gradient-to-b from-white/70 via-white/45 to-white/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] backdrop-blur-[40px] transition-[box-shadow,border-color] duration-300 hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7),0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,0.4)] dark:hover:border-white/20 dark:hover:shadow-[0_24px_48px_-18px_rgba(0,0,0,0.5)]';

const SOLID_CARD =
  'group relative overflow-hidden rounded-[24px] border border-slate-900/[0.06] bg-white shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:shadow-none dark:hover:border-white/15';

const OUTLINE_BUTTON =
  'h-11 w-full rounded-xl border-slate-200/90 bg-white text-sm font-semibold text-[#475569] shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10';

const HAIRLINE = 'border-slate-900/[0.06] dark:border-white/[0.08]';

/** 功能色彩编码，对齐 DESIGN.md「艺术霓虹流」：对话蓝 / 语音紫 / 绘图粉 / 视频靛。 */
const ACCENTS = {
  blue: 'bg-blue-500/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300',
  violet: 'bg-violet-500/10 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300',
  pink: 'bg-pink-500/10 text-pink-600 dark:bg-pink-400/10 dark:text-pink-300',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300',
  amber: 'bg-amber-500/10 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  red: 'bg-red-500/10 text-red-500 dark:bg-red-400/10 dark:text-red-300',
  slate: 'bg-slate-500/10 text-slate-500 dark:bg-slate-400/10 dark:text-slate-300',
} as const;

type AccentKey = keyof typeof ACCENTS;

function getFeatureAccent(feature: ProfileUsageItem['feature']): AccentKey {
  switch (feature) {
    case 'chat':
      return 'blue';
    case 'voice':
      return 'violet';
    case 'destiny':
      return 'amber';
    case 'video':
    case 'video_prompt':
      return 'indigo';
    default:
      return 'pink';
  }
}

function formatTokenCount(value: number) {
  return `${new Intl.NumberFormat('zh-CN').format(value)} Tokens`;
}

function formatTaskCount(value: number) {
  return `${new Intl.NumberFormat('zh-CN').format(value)} 次`;
}

const numberFormatter = new Intl.NumberFormat('zh-CN');

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

/** 语音时长拆分为「数值 + 单位」，用于统计行的大小字分级展示（完整文案见 formatDurationSeconds）。 */
function formatDurationParts(value: number) {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0
    ? { amount: `${minutes} 分 ${remainder}`, unit: '秒' }
    : { amount: `${remainder}`, unit: '秒' };
}

function formatDurationSeconds(value: number) {
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes} 分 ${remainder} 秒` : `${remainder} 秒`;
}

function getUsageSourceLabel(sourceKind: ProfileUsageItem['sourceKind']) {
  if (sourceKind === 'tokens') return '按 Token 统计';
  if (sourceKind === 'audio_seconds') return '按音频时长统计';
  if (sourceKind === 'tasks') return '按媒体任务次数统计';
  return '按多种真实计量单位统计';
}

function formatUsageValue(item: ProfileUsageItem) {
  const values: string[] = [];
  if (item.totalTokens > 0) values.push(formatTokenCount(item.totalTokens));
  if (item.audioSeconds > 0) values.push(formatDurationSeconds(item.audioSeconds));
  if (item.taskCount > 0) values.push(formatTaskCount(item.taskCount));
  return values.join(' · ') || '0';
}

/** 注册时间展示格式，无效输入返回 null（对应字段不渲染）。 */
function formatJoinDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function buildProfileViewModel(
  user: ReturnType<typeof useAuthStore.getState>['user']
): ProfileViewModel {
  const username = user?.username || '';
  return {
    username,
    fullName: '',
    displayName: username || 'user_unknown',
    email: user?.email || null,
    userId: user?.id ? `UID_${user.id.slice(0, 6).toUpperCase()}` : 'UID_8492015',
    timezone: '(GMT+08:00) 中国标准时间 - 北京',
    bio: '',
    avatar: user?.avatar || DEFAULT_AVATAR,
    membership: '标准版',
    createdAt: user?.createdAt || null,
  };
}

/** hover 背光：平时隐藏，鼠标移入卡片时淡入（DESIGN.md 7.2 高光流动规范），移动端无 hover 不生效。 */
function HoverGlow({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue-400/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100 dark:bg-blue-500/10',
        className
      )}
    />
  );
}

/** 扁平功能图标底座：纯色半透明，不叠加模糊，用于卡片标题与统计行。 */
function CardIconChip({
  children,
  accent = 'blue',
  className,
}: {
  children: React.ReactNode;
  accent?: AccentKey;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
        ACCENTS[accent],
        className
      )}
    >
      {children}
    </span>
  );
}

function UsageIcon({ feature }: { feature: ProfileUsageItem['feature'] }) {
  const iconClassName = 'h-4 w-4';
  let icon = <PencilLine className={iconClassName} />;

  if (feature === 'chat') {
    icon = <MessageSquare className={iconClassName} />;
  } else if (feature === 'voice') {
    icon = <Mic className={iconClassName} />;
  } else if (feature === 'destiny') {
    icon = <Crown className={iconClassName} />;
  } else if (feature === 'image') {
    icon = <ImageIcon className={iconClassName} />;
  } else if (feature === 'video' || feature === 'video_prompt') {
    icon = <Video className={iconClassName} />;
  }

  return <CardIconChip accent={getFeatureAccent(feature)}>{icon}</CardIconChip>;
}

/** 资料字段：细线分隔的定义列表行（底部发丝线 + hover 底色），支持两列网格布局。 */
function ProfileStatField({
  label,
  value,
  mono = false,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-6 border-b border-slate-900/[0.06] px-2 py-3.5 transition-colors -mx-2 rounded-lg hover:bg-slate-900/[0.03] dark:border-white/[0.08] dark:hover:bg-white/[0.04]',
        className
      )}
    >
      <span className="shrink-0 text-sm text-[#64748B] dark:text-slate-400">{label}</span>
      <span
        className={cn(
          'min-w-0 truncate text-[15px] font-medium text-[#0F172A] dark:text-slate-100',
          mono && 'font-mono text-sm tracking-wide'
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** 消耗统计行：功能色图标 + 标签 + 大数字小单位的分级展示，行间细线分隔。 */
function UsageStatRow({
  icon,
  label,
  amount,
  unit,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  amount: string;
  unit: string;
  accent: AccentKey;
}) {
  return (
    <div className="-mx-2 flex items-center gap-3 rounded-xl border-b border-slate-900/[0.06] px-2 py-3 transition-colors last:border-b-0 hover:bg-slate-900/[0.03] dark:border-white/[0.08] dark:hover:bg-white/[0.04]">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          ACCENTS[accent]
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-[#475569] dark:text-slate-300">
        {label}
      </span>
      <strong className="flex shrink-0 items-baseline gap-1 font-[var(--font-space-grotesk)]">
        <span className="text-[17px] font-bold tabular-nums text-[#0F172A] dark:text-white">
          {amount}
        </span>
        <span className="text-xs font-medium text-[#94A3B8] dark:text-slate-500">{unit}</span>
      </strong>
    </div>
  );
}

/** 额度圆环：瘦身后的细环，去掉外层玻璃罩，数字居中等宽显示。 */
function ResourceRing({
  remaining,
  consumed,
  total,
  isAdmin = false,
}: {
  remaining: number;
  consumed: number;
  total: number;
  isAdmin?: boolean;
}) {
  const percent = total > 0 ? (consumed / total) * 100 : 0;
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  // 管理员无配额概念，画满环避免空灰圈；普通用户按已结算比例绘制
  const offset = isAdmin ? 0 : circumference * (1 - Math.min(percent, 100) / 100);

  return (
    <div className="relative mx-auto h-[208px] w-[208px]">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="profile-usage-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isAdmin ? '#A78BFA' : '#3B82F6'} />
            <stop offset="100%" stopColor={isAdmin ? '#7C3AED' : '#2563EB'} />
          </linearGradient>
        </defs>
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="8"
          className="text-slate-900/[0.08] dark:text-white/[0.14]"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#profile-usage-gradient)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
          style={{
            filter: isAdmin
              ? 'drop-shadow(0 0 6px rgba(139,92,246,0.45))'
              : 'drop-shadow(0 0 6px rgba(59,130,246,0.45))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {isAdmin ? (
          <>
            <p className="font-[var(--font-space-grotesk)] text-[26px] font-bold leading-none tracking-tight text-[#0F172A] dark:text-white">
              无限额度
            </p>
            <p className="mt-2 text-xs font-medium text-[#64748B] dark:text-slate-400">
              管理员 · 无配额限制
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#94A3B8] dark:text-slate-500">
              剩余额度
            </p>
            <p className="mt-1.5 font-[var(--font-space-grotesk)] text-[38px] font-bold leading-none tracking-tight tabular-nums text-[#0F172A] dark:text-white">
              {remaining.toLocaleString()}
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#2563EB] shadow-[0_0_6px_rgba(37,99,235,0.6)]" />
              <span className="text-xs font-medium tabular-nums text-[#64748B] dark:text-slate-400">
                已结算 {consumed.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs tabular-nums text-[#94A3B8] dark:text-slate-500">
              共 {total.toLocaleString()} 统一额度
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/** 弹窗统一容器样式：Z-5 层允许 G-3 玻璃，内部控件使用实体高对比背景。 */
const DIALOG_SHELL =
  'w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-[24px] border border-white/70 bg-white/90 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.25),0_10px_30px_-15px_rgba(59,130,246,0.15)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/90';

const DIALOG_OVERLAY = 'bg-slate-950/45 backdrop-blur-md dark:bg-slate-950/65';

const DIALOG_INPUT =
  'h-12 rounded-xl border-slate-200/90 bg-white px-4 text-sm shadow-sm dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100';

const DIALOG_CANCEL_BUTTON =
  'h-11 min-w-[96px] rounded-xl border-slate-200/90 bg-white text-sm shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-100 dark:hover:bg-white/10';

function EditProfileDialog({
  open,
  onOpenChange,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ProfileViewModel;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const fetchUser = useAuthStore((s) => s.fetchUser);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraft(value);
    }
    onOpenChange(nextOpen);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        username: draft.username,
      });
      await fetchUser();
      toast.success('个人资料已更新');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName={DIALOG_OVERLAY}
        className={cn(DIALOG_SHELL, 'max-w-[480px] px-6 py-6 sm:px-8 sm:py-8')}
      >
        <DialogHeader className="space-y-0">
          <DialogTitle className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
            编辑个人资料
          </DialogTitle>
          <DialogDescription className="sr-only">修改用户名。</DialogDescription>
        </DialogHeader>

        <div className="mt-6 grid gap-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#475569] dark:text-slate-300">
              用户名
            </label>
            <Input
              value={draft.username}
              onChange={(event) =>
                setDraft((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="用户名"
              className={DIALOG_INPUT}
            />
            <p className="text-xs text-[#94A3B8] dark:text-slate-500">
              3-30 个字符，仅支持英文字母、数字和下划线
            </p>
          </div>
        </div>

        <DialogFooter className="mt-7 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className={DIALOG_CANCEL_BUTTON}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="h-11 min-w-[112px] rounded-xl text-sm shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
          >
            {saving ? '保存中...' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AvatarEditor({
  currentAvatar,
  onAvatarUpdated,
}: {
  currentAvatar: string | null;
  onAvatarUpdated: () => void;
}) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = () => setPreviewSrc(reader.result as string);
    reader.readAsDataURL(file);

    e.target.value = '';
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setPreviewSrc(null);
      return;
    }

    setUploading(true);
    try {
      await uploadAvatar(selectedFile);
      onAvatarUpdated();
      setPreviewSrc(null);
      setSelectedFile(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '头像上传失败');
    } finally {
      setUploading(false);
    }
  };

  const avatarSrc = currentAvatar || DEFAULT_AVATAR;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label="更换头像"
        className="group relative w-fit cursor-pointer rounded-full outline-none transition-transform duration-200 hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <img
          src={avatarSrc}
          alt="用户头像"
          className="h-32 w-32 rounded-full object-cover shadow-[0_10px_28px_-10px_rgba(15,23,42,0.35)] ring-4 ring-white/90 sm:h-36 sm:w-36 dark:ring-white/15"
        />
        {/* hover 遮罩（桌面端增强） */}
        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/0 transition-colors duration-200 group-hover:bg-slate-950/30">
          <Camera className="h-6 w-6 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        </div>
        {/* 常驻相机角标：移动端无 hover，保证可发现性 */}
        <span className="absolute bottom-0.5 right-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-[#2563EB] text-white shadow-[0_4px_10px_rgba(37,99,235,0.4)] ring-[3px] ring-white dark:ring-slate-900">
          <Camera className="h-3.5 w-3.5" />
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* 预览/确认弹窗 */}
      <Dialog open={previewSrc !== null} onOpenChange={() => setPreviewSrc(null)}>
        <DialogContent
          overlayClassName={DIALOG_OVERLAY}
          className={cn(DIALOG_SHELL, 'max-w-[420px] p-6 sm:p-8')}
        >
          <DialogHeader className="space-y-0">
            <DialogTitle className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
              预览头像
            </DialogTitle>
            <DialogDescription className="sr-only">确认裁剪区域后上传。</DialogDescription>
          </DialogHeader>

          {previewSrc ? (
            <div className="relative mt-6 flex justify-center">
              <div className="overflow-hidden rounded-full shadow-xl ring-4 ring-white/90 dark:ring-white/15">
                <img src={previewSrc} alt="头像预览" className="h-52 w-52 object-cover" />
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-7 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewSrc(null)}
              disabled={uploading}
              className={DIALOG_CANCEL_BUTTON}
            >
              <X className="mr-1.5 h-4 w-4" />
              取消
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={handleUpload}
              className="h-11 min-w-[112px] rounded-xl text-sm shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
            >
              {uploading ? '上传中...' : '确认上传'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const logout = useAuthStore((s) => s.logout);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount(password || undefined);
      toast.success('账户已注销');
      await logout();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '注销失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName={DIALOG_OVERLAY}
        className={cn(
          DIALOG_SHELL,
          'max-w-[520px] border-red-200/70 p-6 shadow-[0_30px_60px_-20px_rgba(15,23,42,0.28),0_10px_30px_-15px_rgba(244,63,94,0.15)] sm:p-8 dark:border-red-900/40'
        )}
      >
        <DialogHeader className="space-y-3 text-left">
          <CardIconChip accent="red" className="h-12 w-12 rounded-2xl">
            <AlertTriangle className="h-6 w-6" />
          </CardIconChip>
          <DialogTitle className="font-[var(--font-space-grotesk)] text-xl font-bold text-red-600 dark:text-red-300">
            注销账户确认
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
            此操作不可撤销，将永久删除您的账户及所有关联数据（对话记录、历史、使用统计等）。请输入密码确认。
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6 space-y-2">
          <label className="text-sm font-semibold text-[#475569] dark:text-slate-300">
            密码确认
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入当前密码以确认注销"
            className={DIALOG_INPUT}
          />
        </div>

        <DialogFooter className="mt-7 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className={DIALOG_CANCEL_BUTTON}
            onClick={() => onOpenChange(false)}
            disabled={deleting}
          >
            我再想想
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={deleting}
            onClick={handleDelete}
            className="h-11 rounded-xl text-sm shadow-[0_10px_24px_rgba(244,92,126,0.28)]"
          >
            {deleting ? '注销中...' : '确认注销'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProfileShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const accessToken = useAuthStore((state) => state.accessToken);
  const authLoading = useAuthStore((state) => state.isLoading);
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [usage, setUsage] = useState<ResourceUsageViewModel | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [expandedFeature, setExpandedFeature] = useState<ProfileUsageItem['feature'] | null>(null);
  const fetchingUsageRef = useRef(false);

  const profile = useMemo(() => buildProfileViewModel(user), [user]);
  const isAdminUser = user?.role === 'admin';
  const isAnonymousUser = user?.isAnonymous === true;
  // 注册时间仅对正式账号展示，匿名账号的创建时间没有账户意义
  const joinDate = isAnonymousUser ? null : formatJoinDate(profile.createdAt);
  const profileFields: Array<{ label: string; value: string; mono?: boolean; span?: boolean }> = [
    { label: '用户 ID', value: profile.userId, mono: true },
    { label: '用户名', value: profile.username },
    ...(profile.email ? [{ label: '邮箱', value: profile.email }] : []),
    ...(joinDate ? [{ label: '注册时间', value: joinDate }] : []),
    // 时区文案最长，独占整行避免两列网格内被截断
    { label: '所属时区', value: profile.timezone, span: true },
  ];
  // 剩余额度仅来自统一额度账户，避免用户资料快照与真实账本混用。
  const tokenRemaining = isAdminUser ? Infinity : (usage?.tokenRemaining ?? 0);
  // 圆环只使用统一账本的已结算额度，不能把音频秒数、图片或视频任务混入 Token 展示。
  const tokenConsumed = usage?.quota?.settledUnits ?? 0;
  // 总额读取统一额度账户。
  const tokenTotal = isAdminUser ? 20000 : (usage?.quota?.grantedUnits ?? 0);

  useEffect(() => {
    // 等待 auth 初始化完成，避免用过期 token 触发不必要的 401 刷新
    if (!accessToken || authLoading) {
      setUsage(null);
      setUsageLoading(false);
      setUsageError(null);
      fetchingUsageRef.current = false;
      return;
    }

    // 防止并发请求（React StrictMode 会导致 useEffect 执行两次）
    if (fetchingUsageRef.current) return;
    fetchingUsageRef.current = true;

    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);

    void fetchProfileUsageSummary()
      .then((data) => {
        if (cancelled) return;
        setUsage(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setUsageError(error instanceof Error ? error.message : '获取资源消耗失败');
      })
      .finally(() => {
        if (cancelled) return;
        setUsageLoading(false);
        fetchingUsageRef.current = false;
      });

    return () => {
      cancelled = true;
      // React StrictMode 会先清理再重新执行 effect，这里需要及时释放请求锁。
      fetchingUsageRef.current = false;
    };
  }, [accessToken, authLoading]);

  return (
    <>
      <div className="relative min-h-full w-full overflow-y-auto overflow-x-hidden bg-[#F3F5FA] px-4 pb-8 pt-6 dark:bg-slate-950 sm:px-6 lg:px-10 lg:py-10">
        {/* 背景光斑效果 - 对齐 home 规范 */}
        <div
          className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
          aria-hidden
          style={{
            backgroundColor: '#F3F5FA',
            backgroundImage:
              'radial-gradient(980px 540px at 14% 8%, rgba(219,234,254,0.50) 0%, rgba(219,234,254,0.20) 40%, transparent 72%),' +
              'radial-gradient(1040px 580px at 84% 16%, rgba(233,213,255,0.30) 0%, rgba(233,213,255,0.12) 35%, transparent 68%)',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center, center',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
          aria-hidden
          style={{
            backgroundImage:
              'radial-gradient(900px 460px at 18% 10%, rgba(37,99,235,0.14) 0%, rgba(37,99,235,0.05) 34%, rgba(37,99,235,0) 70%),' +
              'radial-gradient(960px 520px at 80% 18%, rgba(99,102,241,0.1) 0%, rgba(99,102,241,0.04) 30%, rgba(99,102,241,0) 62%)',
            backgroundRepeat: 'no-repeat, no-repeat',
            backgroundSize: 'cover, cover',
            backgroundPosition: 'center, center',
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-blue-100/40 via-white/15 to-transparent dark:from-blue-500/8 dark:via-transparent" />

        <div className="relative mx-auto flex w-full max-w-[1400px] flex-col">
          {/* 页头：扁平处理，不与大内容卡争夺视觉重心 */}
          <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <span className="inline-flex items-center rounded-full bg-blue-500/[0.08] px-3 py-1 text-xs font-semibold tracking-[0.05em] text-[#2563EB] dark:bg-blue-400/10 dark:text-[#A8BAFF]">
                账户中心
              </span>
              <h1 className="mt-3 font-[var(--font-space-grotesk)] text-[28px] font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-[32px]">
                个人设置
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#64748B] dark:text-slate-400 sm:text-[15px]">
                统一管理您的数字身份、资源消耗与安全操作。
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-900/[0.06] bg-white/80 px-3.5 text-[13px] shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                <span className="text-[#94A3B8] dark:text-slate-400">账户状态</span>
                <strong className="font-semibold text-[#0F172A] dark:text-white">已登录</strong>
              </span>
              <span className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-900/[0.06] bg-white/80 px-3.5 text-[13px] shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.06]">
                <span className="text-[#94A3B8] dark:text-slate-400">文本/语音额度</span>
                <strong className="font-[var(--font-space-grotesk)] font-bold tabular-nums text-[#2563EB] dark:text-[#A8BAFF]">
                  {isAdminUser ? '无限额度' : tokenRemaining.toLocaleString()}
                </strong>
              </span>
            </div>
          </header>

          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.82fr)]">
            <section className="space-y-6">
              <div className={cn(GLASS_CARD, 'p-6 sm:p-8')}>
                <HoverGlow />
                <div
                  className={cn(
                    'flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-center sm:justify-between',
                    HAIRLINE
                  )}
                >
                  <div className="flex items-center gap-3">
                    <CardIconChip>
                      <User className="h-4 w-4" />
                    </CardIconChip>
                    <div>
                      <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
                        基本信息
                      </h2>
                      <p className="mt-0.5 text-[13px] text-[#94A3B8] dark:text-slate-400">
                        展示头像、身份标识与账号归属信息
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditOpen(true)}
                    className="h-11 rounded-xl border-slate-200/90 bg-white/80 px-4 text-sm font-semibold text-[#2563EB] shadow-sm hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:text-[#C2D1FF] dark:hover:bg-white/10"
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    编辑资料
                  </Button>
                </div>

                <div className="mt-7 grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center">
                  <div className="flex justify-center lg:justify-start">
                    <AvatarEditor
                      currentAvatar={profile.avatar}
                      onAvatarUpdated={() => fetchUser()}
                    />
                  </div>

                  <div className="grid gap-x-10 sm:grid-cols-2">
                    {profileFields.map((field, index) => (
                      <ProfileStatField
                        key={field.label}
                        {...field}
                        className={
                          field.span ||
                          (profileFields.length % 2 === 1 && index === profileFields.length - 1)
                            ? 'sm:col-span-2'
                            : undefined
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div
                className={`grid gap-6 ${isAdminUser || isAnonymousUser ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}
              >
                {isAnonymousUser ? (
                  <div
                    className={cn(
                      SOLID_CARD,
                      'flex h-full flex-col border-blue-200/70 bg-gradient-to-b from-blue-50/70 to-white p-6 dark:border-blue-900/40 dark:from-blue-950/20 dark:to-transparent'
                    )}
                  >
                    <HoverGlow />
                    <div className="flex items-center gap-3">
                      <CardIconChip>
                        <LogIn className="h-4 w-4" />
                      </CardIconChip>
                      <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-[#0F172A] dark:text-white">
                        使用账号密码登录
                      </h3>
                    </div>
                    <p className="mb-5 mt-3 text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
                      您当前处于匿名体验模式。使用账号密码登录后，可享受完整额度、云端同步与个性化服务。
                    </p>
                    <Button
                      asChild
                      type="button"
                      variant="outline"
                      className={cn(
                        OUTLINE_BUTTON,
                        'mt-auto border-blue-200/80 text-[#255DFF] hover:bg-blue-50/80 sm:w-auto sm:min-w-[200px] sm:self-start dark:border-blue-900/50 dark:text-[#A8BAFF] dark:hover:bg-blue-950/30'
                      )}
                    >
                      <Link href="/login">
                        <LogIn className="mr-2 h-4 w-4" />
                        前往登录页
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className={cn(SOLID_CARD, 'flex h-full flex-col p-6')}>
                    <HoverGlow />
                    <div className="flex items-center gap-3">
                      <CardIconChip accent="slate">
                        <LogOut className="h-4 w-4" />
                      </CardIconChip>
                      <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-[#0F172A] dark:text-white">
                        安全退出
                      </h3>
                    </div>
                    <p className="mb-5 mt-3 text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
                      结束当前的会话并清除本地缓存。建议在公用设备上使用。
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void logout()}
                      className={cn(
                        OUTLINE_BUTTON,
                        'mt-auto sm:w-auto sm:min-w-[200px] sm:self-start'
                      )}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      退出当前登录
                    </Button>
                  </div>
                )}

                {!isAdminUser && !isAnonymousUser ? (
                  <div
                    className={cn(
                      SOLID_CARD,
                      'flex h-full flex-col border-red-200/70 p-6 dark:border-red-900/40 dark:bg-red-950/[0.06]'
                    )}
                  >
                    <HoverGlow className="bg-red-400/10 dark:bg-red-500/10" />
                    <div className="flex items-center gap-3">
                      <CardIconChip accent="red">
                        <AlertTriangle className="h-4 w-4" />
                      </CardIconChip>
                      <h3 className="font-[var(--font-space-grotesk)] text-lg font-semibold tracking-tight text-red-600 dark:text-red-300">
                        危险区域
                      </h3>
                    </div>
                    <p className="mb-5 mt-3 text-sm leading-relaxed text-[#64748B] dark:text-slate-400">
                      永久注销您的账户。此操作将立即删除所有云端数据、积分且无法恢复。
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDeleteOpen(true)}
                      className={cn(
                        OUTLINE_BUTTON,
                        'mt-auto border-red-200/90 text-red-600 hover:bg-red-50/80 sm:w-auto sm:min-w-[200px] sm:self-start dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/30'
                      )}
                    >
                      申请注销账户
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className={cn(GLASS_CARD, 'p-6 sm:p-7 xl:sticky xl:top-8 xl:self-start')}>
              <HoverGlow />
              <div className={cn('flex items-center gap-3 border-b pb-4', HAIRLINE)}>
                <CardIconChip>
                  <BarChart3 className="h-4 w-4" />
                </CardIconChip>
                <h2 className="font-[var(--font-space-grotesk)] text-xl font-bold tracking-tight text-[#0F172A] dark:text-white">
                  资源消耗
                </h2>
              </div>

              <div className="mt-6">
                <ResourceRing
                  remaining={tokenRemaining}
                  consumed={tokenConsumed}
                  total={tokenTotal}
                  isAdmin={isAdminUser}
                />
              </div>

              <div className="mt-7">
                <UsageStatRow
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Token 总消耗"
                  amount={formatNumber(usage?.totalTokens ?? 0)}
                  unit="Tokens"
                  accent="blue"
                />
                <UsageStatRow
                  icon={<Mic className="h-4 w-4" />}
                  label="语音转写时长"
                  {...formatDurationParts(usage?.totalAudioSeconds ?? 0)}
                  accent="violet"
                />
                <UsageStatRow
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="图片生成任务"
                  amount={formatNumber(usage?.taskUsage?.imageCount ?? 0)}
                  unit="次"
                  accent="pink"
                />
                <UsageStatRow
                  icon={<Video className="h-4 w-4" />}
                  label="视频生成任务"
                  amount={formatNumber(usage?.taskUsage?.videoCount ?? 0)}
                  unit="次"
                  accent="indigo"
                />
              </div>

              <div className={cn('mt-7 border-t pt-6', HAIRLINE)}>
                <p className="text-xs font-semibold tracking-[0.1em] text-[#94A3B8] dark:text-slate-500">
                  {usageLoading ? '资源统计加载中...' : '全部使用记录'}
                </p>
                <div className="mt-4">
                  {usageError ? (
                    <div className="rounded-2xl border border-red-200/70 bg-red-50/70 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                      {usageError}
                    </div>
                  ) : usageLoading ? (
                    <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300/80 px-4 py-6 text-sm text-[#94A3B8] dark:border-white/10 dark:text-slate-400">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      正在同步资源消耗
                    </div>
                  ) : usage?.features.length ? (
                    <div className="space-y-3">
                      {usage.features.map((item) => (
                        <div
                          key={item.feature}
                          className="rounded-2xl border border-slate-900/[0.06] bg-white/55 px-4 py-3.5 transition-colors hover:bg-white/85 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-3">
                              <UsageIcon feature={item.feature} />
                              <div className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-[#0F172A] dark:text-slate-100">
                                  {item.label}
                                </span>
                                <span className="mt-0.5 block text-xs text-[#94A3B8] dark:text-slate-400">
                                  {getUsageSourceLabel(item.sourceKind)}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2.5">
                              <strong className="text-sm font-semibold tabular-nums text-[#475569] dark:text-slate-300">
                                {formatUsageValue(item)}
                              </strong>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                  setExpandedFeature((current) =>
                                    current === item.feature ? null : item.feature
                                  )
                                }
                                className="h-9 rounded-lg px-2.5 text-xs font-medium text-[#2563EB] hover:bg-blue-500/[0.08] dark:text-[#A8BAFF] dark:hover:bg-white/[0.06]"
                              >
                                {expandedFeature === item.feature ? '收起明细' : '展开明细'}
                              </Button>
                            </div>
                          </div>
                          {expandedFeature === item.feature ? (
                            <div className="mt-3.5 grid gap-3 rounded-xl border border-slate-900/[0.06] bg-slate-50/70 px-3.5 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300 sm:grid-cols-3">
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  统计方式
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {getUsageSourceLabel(item.sourceKind)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Token 消耗
                                </div>
                                <div className="mt-1 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                  {formatTokenCount(item.totalTokens)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  语音转写时长
                                </div>
                                <div className="mt-1 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                  {formatDurationSeconds(item.audioSeconds)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  媒体任务次数
                                </div>
                                <div className="mt-1 font-medium tabular-nums text-slate-800 dark:text-slate-100">
                                  {formatTaskCount(item.taskCount)}
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  说明
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  Token、音频时长与图片/视频任务分别统计；图片和视频任务不会占用文本/语音额度。
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2.5 rounded-2xl border border-dashed border-slate-300/80 px-4 py-8 text-center dark:border-white/10">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-500/10 text-slate-400 dark:text-slate-500">
                        <BarChart3 className="h-4 w-4" />
                      </span>
                      <p className="text-sm text-[#94A3B8] dark:text-slate-400">
                        暂无资源消耗记录
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <EditProfileDialog open={isEditOpen} onOpenChange={setIsEditOpen} value={profile} />
      {!isAdminUser ? (
        <DeleteAccountDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
      ) : null}
    </>
  );
}
