'use client';

import type { Agent } from '@fingerprintjs/fingerprintjs';
import { DEVICE_ID_REGEX, DEVICE_ID_STORAGE_KEY } from '@/lib/constants/device';

let fpPromise: Promise<Agent> | null = null;

async function getFingerprintAgent(): Promise<Agent> {
  if (!fpPromise) {
    const { load } = await import('@fingerprintjs/fingerprintjs');
    fpPromise = load({ monitoring: false });
  }
  return fpPromise;
}

/**
 * 从 localStorage 读取已保存的设备标识。
 */
function getStoredDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    return value && DEVICE_ID_REGEX.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * 将设备标识保存到 localStorage。
 */
function storeDeviceId(deviceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  } catch {
    // 忽略写入失败（如隐私模式）
  }
}

/**
 * 生成一个加密学安全的随机设备标识（降级方案）。
 */
function generateRandomDeviceId(): string {
  const bytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 获取稳定的设备标识。
 *
 * 流程：
 * 1. 优先从 localStorage 复用已有标识。
 * 2. 否则使用 @fingerprintjs/fingerprintjs 生成 visitorId。
 * 3. 指纹库加载失败时降级为随机 UUID。
 *
 * 注意：返回的 deviceId 是客户端透明标识，服务端会进一步用 HMAC 加盐计算 deviceHash。
 */
export async function getDeviceId(): Promise<string> {
  const stored = getStoredDeviceId();
  if (stored) return stored;

  try {
    const agent = await getFingerprintAgent();
    const result = await agent.get();
    const deviceId = result.visitorId;

    if (DEVICE_ID_REGEX.test(deviceId)) {
      storeDeviceId(deviceId);
      return deviceId;
    }
  } catch (error) {
    console.warn('[device-fingerprint] 指纹采集失败，降级为随机标识:', error);
  }

  const fallbackId = generateRandomDeviceId();
  storeDeviceId(fallbackId);
  return fallbackId;
}

/**
 * 清除本地保存的设备标识。
 * 登出或需要重置匿名身份时调用。
 */
export function clearDeviceId(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    // 忽略清除失败
  }
}

/**
 * 校验设备标识格式。
 */
export function isValidDeviceId(deviceId: unknown): deviceId is string {
  return typeof deviceId === 'string' && DEVICE_ID_REGEX.test(deviceId);
}
