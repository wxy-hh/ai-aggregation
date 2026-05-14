'use client';

import React, { useRef } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  Crown,
  LogOut,
  MessageSquare,
  Mic,
  PencilLine,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
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

function formatTokenCount(value: number) {
  return `${new Intl.NumberFormat('zh-CN').format(value)} Tokens`;
}

function formatTaskCount(value: number) {
  return `${new Intl.NumberFormat('zh-CN').format(value)} 次`;
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
  };
}

function UsageIcon({ feature }: { feature: ProfileUsageItem['feature'] }) {
  const commonClassName = 'h-4 w-4';

  if (feature === 'chat') {
    return <MessageSquare className={commonClassName} />;
  }

  if (feature === 'voice') {
    return <Mic className={commonClassName} />;
  }

  if (feature === 'destiny') {
    return <Crown className={commonClassName} />;
  }

  return <PencilLine className={commonClassName} />;
}

function ProfileStatField({
  label,
  value,
  leading,
  trailing,
  fullWidth = false,
}: {
  label: string;
  value: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <div className={cn('space-y-3', fullWidth ? 'md:col-span-2' : undefined)}>
      <p className="text-sm font-semibold tracking-[0.02em] text-[#64748B] dark:text-slate-300">
        {label}
      </p>
      <div className="relative flex min-h-[56px] items-center gap-3 overflow-hidden rounded-2xl border border-white/55 bg-gradient-to-b from-white/72 via-white/42 to-white/24 px-5 py-3.5 text-sm text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_18px_30px_-24px_rgba(59,130,246,0.24)] backdrop-blur-[18px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.52))] dark:text-slate-100">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/28 to-transparent dark:from-white/5" />
        <div className="pointer-events-none absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-80 dark:via-white/25" />
        <div className="pointer-events-none absolute -right-6 top-0 h-16 w-16 rounded-full bg-blue-200/30 blur-2xl dark:hidden" />
        {leading}
        <span className="relative min-w-0 flex-1 break-all">{value}</span>
        {trailing}
      </div>
    </div>
  );
}

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
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(percent, 100) / 100);

  return (
    <div className="relative mx-auto h-[252px] w-[252px] overflow-hidden rounded-full bg-gradient-to-b from-white/52 via-white/20 to-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_20px_36px_-28px_rgba(59,130,246,0.28)] backdrop-blur-[16px] dark:bg-transparent dark:shadow-none">
      <div className="pointer-events-none absolute inset-0 rounded-full border border-white/60 dark:border-white/10" />
      <div className="pointer-events-none absolute top-3 inset-x-10 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
      <div className="pointer-events-none absolute -right-2 top-3 h-16 w-16 rounded-full bg-[rgba(219,234,254,0.50)] blur-2xl dark:hidden" />
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="profile-usage-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={isAdmin ? '#A78BFA' : '#255DFF'} />
            <stop offset="100%" stopColor={isAdmin ? '#7C3AED' : '#0E39D2'} />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
        <circle
          cx="100" cy="100" r={radius} fill="none"
          stroke="url(#profile-usage-gradient)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {isAdmin ? (
          <>
            <p className="font-[var(--font-space-grotesk)] text-[28px] font-bold leading-none tracking-tight text-[#0F172A] dark:text-white">
              无限额度
            </p>
            <p className="mt-2 text-xs font-semibold text-[#64748B] dark:text-slate-300">
              管理员 · 无配额限制
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#94A3B8]">
              剩余额度
            </p>
            <p className="mt-1 font-[var(--font-space-grotesk)] text-[36px] font-bold leading-none tracking-tight text-[#0F172A] dark:text-white">
              {remaining.toLocaleString()}
            </p>
            <div className="mt-3 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-[#255DFF]" />
              <span className="text-[13px] font-medium text-[#64748B] dark:text-slate-300">
                已消耗 {consumed.toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-[12px] text-[#94A3B8]">共 {total.toLocaleString()} Tokens</p>
          </>
        )}
      </div>
    </div>
  );
}

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
        overlayClassName="bg-[rgba(220,228,247,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.68)]"
        className="w-[calc(100vw-2rem)] max-w-[480px] gap-0 overflow-hidden rounded-[32px] bg-gradient-to-b from-white/72 via-white/32 to-transparent px-5 py-5 shadow-[0_28px_80px_-24px_rgba(59,130,246,0.20)] backdrop-blur-[40px] sm:px-10 sm:py-10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(15,23,42,0.74))] dark:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.48)]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/60 [mask-image:linear-gradient(to_bottom,black_32%,transparent_100%)] dark:border-white/10" />
        <div className="pointer-events-none absolute top-0 inset-x-10 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/6 dark:via-transparent" />
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[rgba(219,234,254,0.50)] blur-3xl dark:hidden" />
        <DialogHeader className="space-y-0">
          <DialogTitle className="font-[var(--font-space-grotesk)] text-[20px] font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-[22px]">
            编辑个人资料
          </DialogTitle>
          <DialogDescription className="sr-only">修改用户名。</DialogDescription>
        </DialogHeader>

        <div className="relative mt-8 grid gap-5">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-[#64748B] dark:text-slate-300">
              用户名
            </label>
            <Input
              value={draft.username}
              onChange={(event) =>
                setDraft((current) => ({ ...current, username: event.target.value }))
              }
              placeholder="用户名"
              className="h-14 rounded-xl border-white/60 bg-gradient-to-b from-white/78 to-white/52 px-5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))] dark:text-slate-100"
            />
            <p className="text-xs text-[#94A3B8]">3-30 个字符，仅支持英文字母、数字和下划线</p>
          </div>
        </div>

        <DialogFooter className="mt-8 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={saving}
            className="h-10 min-w-[96px] rounded-xl border-white/60 bg-white/60 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-slate-900/72 dark:text-slate-100"
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="h-10 min-w-[112px] rounded-xl text-sm shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
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
        className="group relative cursor-pointer overflow-hidden rounded-[24px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.8),rgba(255,255,255,0.54))] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm transition-all duration-300 hover:shadow-[0_10px_24px_rgba(93,124,250,0.32)] dark:border-white/10 dark:bg-slate-900/70"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
        }}
      >
        <div className="pointer-events-none absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
        <img
          src={avatarSrc}
          alt="用户头像"
          className="h-[140px] w-[140px] rounded-[20px] object-cover sm:h-[156px] sm:w-[156px]"
        />
        {/* hover 遮罩 */}
        <div className="absolute inset-1.5 flex items-center justify-center rounded-[20px] bg-black/0 transition-all duration-300 group-hover:bg-black/30">
          <Camera className="h-7 w-7 text-white opacity-0 transition-all duration-300 group-hover:opacity-100" />
        </div>
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
          overlayClassName="bg-[rgba(220,228,247,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.68)]"
          className="w-[calc(100vw-2rem)] max-w-[420px] overflow-hidden rounded-[30px] bg-gradient-to-b from-white/76 via-white/34 to-transparent p-8 shadow-[0_28px_72px_-24px_rgba(59,130,246,0.22)] backdrop-blur-[40px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(15,23,42,0.76))]"
        >
          <DialogHeader className="space-y-0">
            <DialogTitle className="font-[var(--font-space-grotesk)] text-[20px] font-bold tracking-tight text-[#0F172A] dark:text-white">
              预览头像
            </DialogTitle>
            <DialogDescription className="sr-only">确认裁剪区域后上传。</DialogDescription>
          </DialogHeader>

          {previewSrc ? (
            <div className="relative mt-6 flex justify-center">
              <div className="overflow-hidden rounded-full border-4 border-white/80 shadow-xl">
                <img src={previewSrc} alt="头像预览" className="h-52 w-52 object-cover" />
              </div>
            </div>
          ) : null}

          <DialogFooter className="mt-8 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreviewSrc(null)}
              disabled={uploading}
              className="h-10 min-w-[96px] rounded-xl border-white/60 bg-white/60 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px]"
            >
              <X className="mr-1.5 h-4 w-4" />
              取消
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={handleUpload}
              className="h-10 min-w-[112px] rounded-xl text-sm shadow-[0_10px_24px_rgba(93,124,250,0.32)]"
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
        overlayClassName="bg-[rgba(220,228,247,0.58)] backdrop-blur-[10px] dark:bg-[rgba(5,10,24,0.68)]"
        className="w-[calc(100vw-2rem)] max-w-[520px] overflow-hidden rounded-[30px] bg-gradient-to-b from-white/76 via-white/34 to-transparent p-8 shadow-[0_28px_72px_-24px_rgba(244,114,91,0.22)] backdrop-blur-[40px] dark:bg-[linear-gradient(180deg,rgba(48,19,22,0.88),rgba(15,23,42,0.76))]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[30px] border border-red-200/62 [mask-image:linear-gradient(to_bottom,black_32%,transparent_100%)] dark:border-red-900/45" />
        <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/15" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/4 dark:via-transparent" />
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-rose-200/38 blur-3xl dark:hidden" />
        <DialogHeader className="space-y-3 text-left">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-red-100/75 bg-gradient-to-b from-white/80 to-red-50/85 text-red-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(217,119,87,0.12)] dark:border-red-900/45 dark:bg-red-950/40 dark:text-red-300">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <DialogTitle className="font-[var(--font-space-grotesk)] text-[20px] font-bold text-red-600 dark:text-red-300 sm:text-[22px]">
            注销账户确认
          </DialogTitle>
          <DialogDescription className="text-sm leading-[1.625] text-[#64748B] dark:text-slate-300">
            此操作不可撤销，将永久删除您的账户及所有关联数据（对话记录、历史、使用统计等）。请输入密码确认。
          </DialogDescription>
        </DialogHeader>

        <div className="relative mt-6 space-y-2">
          <label className="text-sm font-semibold text-[#64748B] dark:text-slate-300">
            密码确认
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="输入当前密码以确认注销"
            className="h-14 rounded-xl border-white/60 bg-gradient-to-b from-white/78 to-white/52 px-5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(217,119,87,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.56))] dark:text-slate-100"
          />
        </div>

        <DialogFooter className="mt-8 flex-col-reverse gap-3 sm:flex-row sm:justify-end sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-white/60 bg-white/60 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px]"
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
            className="h-10 rounded-xl text-sm shadow-[0_10px_24px_rgba(244,92,126,0.28)]"
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
  // 剩余额度：来自 DB（每次调用已扣减），与管理员端一致
  const tokenRemaining = isAdminUser ? Infinity : (usage?.tokenRemaining ?? user?.tokens ?? 0);
  // 消耗：来自 AIUsageRecord（仅用于展示）
  const tokenConsumed = usage?.totalTokens ?? 0;
  // 总额 = 剩余 + 已消耗（自适应管理员调整配额）
  const tokenTotal = isAdminUser ? 20000 : tokenRemaining + tokenConsumed;

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

        <div className="relative mx-auto flex w-full max-w-[1480px] flex-col">
          <header className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-white/60 via-white/24 to-transparent px-5 py-5 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.10)] backdrop-blur-[40px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.76),rgba(15,23,42,0.58))] dark:shadow-[0_18px_44px_-24px_rgba(0,0,0,0.4)] sm:px-6 sm:py-6 lg:px-8 lg:py-7">
            <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/60 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] dark:border-white/10" />
            <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50 dark:via-white/20" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
            <div className="pointer-events-none absolute -right-10 top-0 h-32 w-32 rounded-full bg-[rgba(219,234,254,0.50)] blur-3xl dark:hidden" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="mb-3 inline-flex items-center rounded-full border border-white/60 bg-white/60 px-3 py-1 text-xs font-bold tracking-[0.05em] text-[#2563EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-900/70 dark:text-[#A8BAFF]">
                  账户中心
                </div>
                <h1 className="font-[var(--font-space-grotesk)] text-2xl font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-[30px]">
                  个人设置
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-[1.625] text-[#64748B] dark:text-slate-300 sm:text-[15px]">
                  统一管理您的数字身份、资源消耗与安全操作。
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:w-auto sm:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-white/72 to-white/38 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(15,23,42,0.54))]">
                  <div className="text-xs font-medium text-[#94A3B8] dark:text-slate-400">
                    账户状态
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#0F172A] dark:text-white">
                    已登录
                  </div>
                </div>
                <div className="relative col-span-2 overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-[#2563EB]/10 via-white/70 to-white/40 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] sm:col-span-1 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(37,99,235,0.2),rgba(15,23,42,0.58))]">
                  <div className="text-xs font-medium text-[#94A3B8] dark:text-slate-400">
                    剩余额度
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#2563EB] dark:text-[#C2D1FF]">
                    {isAdminUser ? '无限额度' : tokenRemaining.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.82fr)]">
            <section className="space-y-6">
              <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-white/60 via-white/24 to-transparent p-5 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.10)] backdrop-blur-[40px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,0.4)] sm:p-6 lg:p-8">
                <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/60 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] dark:border-white/10" />
                <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50 dark:via-white/20" />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/30 via-white/10 to-transparent dark:from-white/6 dark:via-transparent" />
                <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[rgba(219,234,254,0.50)] blur-3xl dark:hidden" />
                <div className="pointer-events-none absolute bottom-0 left-8 h-24 w-48 rounded-full bg-white/30 blur-3xl dark:hidden" />
                <div className="relative flex flex-col gap-4 border-b border-white/60 pb-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/60 text-[#2563EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-800/70 dark:text-[#A8BAFF]">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="font-[var(--font-space-grotesk)] text-[22px] font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-2xl">
                        基本信息
                      </h2>
                      <p className="mt-1 text-sm text-[#94A3B8] dark:text-slate-400">
                        展示头像、身份标识与账号归属信息
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsEditOpen(true)}
                    className="h-10 rounded-xl border-white/60 bg-white/60 px-4 text-sm font-semibold text-[#2563EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm hover:bg-white/80 dark:border-white/10 dark:bg-slate-800/65 dark:text-[#C2D1FF] dark:hover:bg-slate-800"
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    编辑资料
                  </Button>
                </div>

                <div className="relative mt-6 grid gap-5 lg:grid-cols-[168px_minmax(0,1fr)]">
                  <div className="flex flex-col items-center gap-4 lg:items-start">
                    <AvatarEditor
                      currentAvatar={profile.avatar}
                      onAvatarUpdated={() => fetchUser()}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ProfileStatField label="用户 ID" value={profile.userId} />
                    <ProfileStatField
                      label="用户名"
                      value={profile.username}
                      fullWidth
                      trailing={<User className="h-5 w-5 shrink-0 text-[#255DFF]" />}
                    />
                    <ProfileStatField label="所属时区" value={profile.timezone} fullWidth />
                  </div>
                </div>
              </div>

              <div className={`grid gap-6 ${isAdminUser ? 'md:grid-cols-1' : 'md:grid-cols-2'}`}>
                <div className="relative flex min-h-[296px] flex-col overflow-hidden rounded-[24px] border border-slate-100/80 bg-white p-6 shadow-xl transition-all duration-300 hover:shadow-2xl dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.66))] sm:p-7">
                  <div className="pointer-events-none absolute top-0 inset-x-7 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/52 to-transparent dark:from-white/5" />
                  <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[rgba(219,234,254,0.50)] blur-3xl dark:hidden" />
                  <h3 className="font-[var(--font-space-grotesk)] text-[22px] font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-2xl">
                    安全退出
                  </h3>
                  <p className="mt-3 text-sm leading-[1.625] text-[#64748B] dark:text-slate-300 sm:text-[15px]">
                    结束当前的会话并清除本地缓存。建议在公用设备上使用。
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void logout()}
                    className="mt-auto h-11 w-full rounded-xl border-white/60 bg-white/60 text-sm font-semibold text-[#475569] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm hover:bg-white/80 dark:border-white/10 dark:bg-slate-800/72 dark:text-slate-100 dark:hover:bg-slate-800"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    退出当前登录
                  </Button>
                </div>

                {!isAdminUser ? (
                  <div className="relative flex min-h-[296px] flex-col overflow-hidden rounded-[24px] border border-red-100/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,247,247,0.95))] p-6 shadow-xl transition-all duration-300 hover:shadow-2xl dark:border-red-900/40 dark:bg-[linear-gradient(180deg,rgba(48,19,22,0.76),rgba(15,23,42,0.64))] sm:p-7">
                    <div className="pointer-events-none absolute top-0 inset-x-7 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/15" />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/55 to-transparent dark:from-white/4" />
                    <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-rose-100/80 blur-3xl dark:hidden" />
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-6 w-6 text-red-500 dark:text-red-300" />
                      <h3 className="font-[var(--font-space-grotesk)] text-[22px] font-bold tracking-tight text-red-600 dark:text-red-300 sm:text-2xl">
                        危险区域
                      </h3>
                    </div>
                    <p className="mt-3 text-sm leading-[1.625] text-[#64748B] dark:text-slate-300 sm:text-[15px]">
                      永久注销您的账户。此操作将立即删除所有云端数据、积分且无法恢复。
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDeleteOpen(true)}
                      className="mt-auto h-11 w-full rounded-xl border-red-200/75 bg-white/60 text-sm font-semibold text-red-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(217,119,87,0.12)] backdrop-blur-sm hover:bg-red-50/75 dark:border-red-900/50 dark:bg-slate-800/72 dark:text-red-200 dark:hover:bg-red-950/24"
                    >
                      申请注销账户
                    </Button>
                  </div>
                ) : null}
              </div>
            </section>

            <aside className="relative overflow-hidden rounded-[32px] bg-gradient-to-b from-white/66 via-white/24 to-transparent p-6 shadow-[0_20px_60px_-10px_rgba(59,130,246,0.10)] backdrop-blur-[40px] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))] dark:shadow-[0_18px_44px_-18px_rgba(0,0,0,0.4)] sm:p-7 xl:sticky xl:top-8 xl:self-start">
              <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/60 [mask-image:linear-gradient(to_bottom,black_30%,transparent_100%)] dark:border-white/10" />
              <div className="pointer-events-none absolute top-0 inset-x-8 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/32 via-white/10 to-transparent dark:from-white/5 dark:via-transparent" />
              <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-[rgba(219,234,254,0.50)] blur-3xl dark:hidden" />
              <div className="pointer-events-none absolute bottom-0 left-8 h-20 w-40 rounded-full bg-white/28 blur-3xl dark:hidden" />
              <div className="relative flex items-center gap-3 border-b border-white/60 pb-4 dark:border-white/10">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/60 bg-white/60 text-[#2563EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-800/70 dark:text-[#A8BAFF]">
                  <BarChart3 className="h-4 w-4" />
                </div>
                <h2 className="font-[var(--font-space-grotesk)] text-[22px] font-bold tracking-tight text-[#0F172A] dark:text-white sm:text-2xl">
                  资源消耗
                </h2>
              </div>

              <div className="mt-5">
                <ResourceRing remaining={tokenRemaining} consumed={tokenConsumed} total={tokenTotal} isAdmin={isAdminUser} />
              </div>

              <p className="mt-1 text-center text-sm text-[#64748B] dark:text-slate-300 sm:text-[15px]">
                {usageLoading ? '资源统计加载中...' : '全部使用记录'}
              </p>

              <div className="mt-8 space-y-4 text-sm text-slate-600 dark:text-slate-300 sm:text-[15px]">
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-white/70 to-white/36 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.7),rgba(15,23,42,0.52))]">
                  <div className="pointer-events-none absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
                  <div className="relative flex items-center justify-between gap-4">
                    <span>Token 总消耗</span>
                    <strong className="text-lg text-[#0F172A] dark:text-white">
                      {formatTokenCount(usage?.totalTokens ?? 0)}
                    </strong>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-[#2563EB]/8 via-white/72 to-white/36 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(34,78,212,0.22),rgba(15,23,42,0.52))]">
                  <div className="pointer-events-none absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
                  <div className="relative flex items-center justify-between gap-4">
                    <span>调用总次数</span>
                    <strong className="text-lg text-[#2563EB] dark:text-[#A8BAFF]">
                      {formatTaskCount(usage?.totalTaskCount ?? 0)}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="relative mt-7 border-t border-white/60 pt-7 dark:border-white/10">
                {usageError ? (
                  <div className="rounded-2xl border border-red-200/60 bg-red-50/70 px-4 py-3 text-sm text-red-600 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200">
                    {usageError}
                  </div>
                ) : usageLoading ? (
                  <div className="flex items-center justify-center rounded-2xl border border-white/60 bg-white/60 px-4 py-6 text-sm text-[#94A3B8] dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300">
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    正在同步资源消耗
                  </div>
                ) : usage?.features.length ? (
                  <div className="space-y-4">
                    {usage.features.map((item) => (
                      <div
                        key={item.feature}
                        className="relative overflow-hidden rounded-2xl border border-white/60 bg-gradient-to-b from-white/56 to-white/26 px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-[16px] dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.68),rgba(15,23,42,0.5))]"
                      >
                        <div className="pointer-events-none absolute top-0 inset-x-5 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-80 dark:via-white/20" />
                        <div className="relative space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-4">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/60 text-[#2563EB] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),0_6px_16px_rgba(78,99,160,0.12)] backdrop-blur-sm dark:border-white/10 dark:bg-slate-800/68 dark:text-[#A8BAFF]">
                                <UsageIcon feature={item.feature} />
                              </div>
                              <div className="min-w-0">
                                <span className="block truncate text-base font-semibold text-[#0F172A] dark:text-slate-100">
                                  {item.label}
                                </span>
                                <span className="block text-xs text-[#94A3B8] dark:text-slate-400">
                                  {item.hasTokenData ? '按 Token 统计' : '按调用次数统计'}
                                </span>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                              <strong className="text-base text-[#475569] dark:text-slate-300">
                                {item.hasTokenData
                                  ? formatTokenCount(item.totalTokens)
                                  : formatTaskCount(item.taskCount)}
                              </strong>
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() =>
                                  setExpandedFeature((current) =>
                                    current === item.feature ? null : item.feature
                                  )
                                }
                                className="h-8 rounded-lg px-2 text-xs font-medium text-[#2563EB] hover:bg-white/50 dark:text-[#A8BAFF] dark:hover:bg-white/5"
                              >
                                {expandedFeature === item.feature ? '收起明细' : '展开明细'}
                              </Button>
                            </div>
                          </div>
                          {expandedFeature === item.feature ? (
                            <div className="grid gap-2 rounded-xl border border-white/55 bg-white/42 px-3 py-3 text-xs text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.68)] dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300 sm:grid-cols-3">
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  统计方式
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {item.hasTokenData ? 'Token' : '调用次数'}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Token 消耗
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {formatTokenCount(item.totalTokens)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  调用次数
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {formatTaskCount(item.taskCount)}
                                </div>
                              </div>
                              <div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  占比
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {item.percent.toFixed(1)}%
                                </div>
                              </div>
                              <div className="sm:col-span-2">
                                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                  说明
                                </div>
                                <div className="mt-1 font-medium text-slate-800 dark:text-slate-100">
                                  {item.hasTokenData
                                    ? '该功能已记录模型返回的真实 Token 使用量，同时保留调用次数。'
                                    : '该功能当前未返回稳定 Token 字段，先按真实调用次数统计。'}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/60 bg-white/60 px-4 py-6 text-sm text-[#94A3B8] dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300">
                    暂无资源消耗记录
                  </div>
                )}
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
