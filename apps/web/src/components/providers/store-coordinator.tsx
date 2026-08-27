'use client';

import { useEffect } from 'react';
import { registerStoreCoordinator } from '@/stores/store-coordinator';

/**
 * 注册 Store 协调器（全局生命周期内只执行一次）。
 * 监听跨 Store 事件并分发同步操作，替代各 Store 内的直接 require 调用。
 */
export function StoreCoordinator() {
  useEffect(() => {
    const cleanup = registerStoreCoordinator();
    return cleanup;
  }, []);

  return null;
}
