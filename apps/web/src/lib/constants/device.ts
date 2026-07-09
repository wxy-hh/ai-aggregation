/**
 * 设备标识格式校验正则。
 * 客户端（device-fingerprint）与服务端（anonymous auth）共享，避免两边不一致。
 */
export const DEVICE_ID_REGEX = /^[a-f0-9]{64}$/;

/**
 * localStorage 中保存设备标识的键名。
 */
export const DEVICE_ID_STORAGE_KEY = 'ai-device-id';
