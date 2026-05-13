'use client';

import React, { useState, useCallback } from 'react';
import { Eye, EyeOff } from 'lucide-react';

// ── Hook ──────────────────────────────────────────

interface UsePasswordValidationReturn {
  password: string;
  confirmPassword: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  setPassword: (v: string) => void;
  setConfirmPassword: (v: string) => void;
  togglePassword: () => void;
  toggleConfirmPassword: () => void;
  /** 密码一致性校验：null 表示确认密码为空，true/false 为校验结果 */
  isMatch: boolean | null;
  /** 重置所有密码相关状态到初始值 */
  reset: () => void;
}

/**
 * 管理密码输入相关状态：密码值、确认密码值、显示/隐藏切换、密码一致性校验。
 */
export function usePasswordValidation(): UsePasswordValidationReturn {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const togglePassword = useCallback(() => {
    setShowPassword((v) => !v);
  }, []);

  const toggleConfirmPassword = useCallback(() => {
    setShowConfirmPassword((v) => !v);
  }, []);

  const reset = useCallback(() => {
    setPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, []);

  const isMatch: boolean | null =
    confirmPassword === ''
      ? null
      : password === confirmPassword;

  return {
    password,
    confirmPassword,
    showPassword,
    showConfirmPassword,
    setPassword,
    setConfirmPassword,
    togglePassword,
    toggleConfirmPassword,
    isMatch,
    reset,
  };
}

// ── 组件 ──────────────────────────────────────────

interface PasswordToggleButtonProps {
  show: boolean;
  onToggle: () => void;
  className?: string;
  iconClassName?: string;
}

/**
 * 密码显示/隐藏切换按钮（仅按钮元素本身，不包含外层容器）。
 * 样式通过 className/iconClassName 由消费方传入，适配不同的视觉风格。
 */
export function PasswordToggleButton({
  show,
  onToggle,
  className = '',
  iconClassName = 'h-4.5 w-4.5',
}: PasswordToggleButtonProps) {
  return (
    <button
      type="button"
      aria-label={show ? '隐藏密码' : '显示密码'}
      className={className}
      onClick={onToggle}
    >
      {show ? (
        <EyeOff className={iconClassName} />
      ) : (
        <Eye className={iconClassName} />
      )}
    </button>
  );
}
