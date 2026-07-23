'use client';

import React from 'react';
import { AdminGuard } from '@/components/auth/admin-guard';

/**
 * Admin 页面的统一布局守卫。
 * 所有 /admin/* 下的页面都会被 AdminGuard 包裹，确保只有 admin 用户可以访问。
 * 各子页面无需再单独实现权限检查。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGuard>{children}</AdminGuard>;
}
