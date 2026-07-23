/**
 * 匿名认证策略抽象。
 *
 * 通过该接口将设备标识的获取/清除逻辑与 auth-store 解耦，
 * 便于测试、替换实现（如随机 ID 策略）或延迟加载指纹库。
 */

import { getDeviceId, clearDeviceId } from '@/lib/device-fingerprint';

export interface AnonymousAuthStrategy {
  /** 获取匿名凭证（如设备标识） */
  getCredential(): Promise<string>;
  /** 清除匿名凭证，下次使用新身份 */
  clearCredential(): void;
}

/** 默认策略：基于浏览器指纹库生成稳定的设备标识 */
export const fingerprintAnonymousStrategy: AnonymousAuthStrategy = {
  getCredential: getDeviceId,
  clearCredential: clearDeviceId,
};
