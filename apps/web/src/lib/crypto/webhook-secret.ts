/**
 * Webhook 凭证对称加密件（AES-256-GCM）
 *
 * 职责与安全规范：
 * - 仓库首个可逆加密件，专用于用户自定义 Webhook 的鉴权凭证存储（数据库中仅存密文，永不回显）。
 * - 加密算法：AES-256-GCM。
 * - 密文打包格式：base64(iv ‖ tag ‖ cipherText)
 *   - iv：12 字节随机数（96 位，AES-GCM 推荐安全长度）
 *   - tag：16 字节认证标签（128 位，用于完整性校验与防篡改）
 *   - cipherText：加密后的变长密文
 * - 密钥规范：
 *   - 主密钥来源于环境变量 WEBHOOK_SECRET_KEY（32 字节十六进制，共 64 个十六进制字符）。
 *   - 生成新密钥命令：node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   - 密钥轮换机制：当前单密钥；密钥轮换需双密钥过渡方案，spec §7 定为届时再实现。
 * - 失败处理语义：
 *   - 密钥缺失、格式错误、解密失败（错密钥/篡改/坏数据）均显式抛出错误，绝不静默降级为未鉴权或空字符串。
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-GCM 推荐 IV 长度（12 字节） */
const IV_LENGTH = 12;

/** AES-GCM 认证标签长度（16 字节） */
const TAG_LENGTH = 16;

/** 密文二进制最小长度：IV(12) + TAG(16) = 28 字节 */
const MIN_PAYLOAD_LENGTH = IV_LENGTH + TAG_LENGTH;

/** 32 字节十六进制字符串正则（64 位 hex） */
const HEX_32_BYTES_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * 解析并校验 32 字节十六进制密钥。
 *
 * @param customKey 可选注入密钥（用于测试或临时指定）
 * @returns 32 字节密钥 Buffer
 */
export function resolveWebhookSecretKey(customKey?: string): Buffer {
  const rawKey = customKey ?? process.env.WEBHOOK_SECRET_KEY;

  if (!rawKey || typeof rawKey !== 'string' || rawKey.trim() === '') {
    throw new Error('未配置 WEBHOOK_SECRET_KEY 环境变量');
  }

  const trimmed = rawKey.trim();
  if (!HEX_32_BYTES_REGEX.test(trimmed)) {
    throw new Error('WEBHOOK_SECRET_KEY 必须为 32 字节十六进制字符串（64 个字符）');
  }

  return Buffer.from(trimmed, 'hex');
}

/**
 * 加密明文字符串为 Base64 打包格式（iv ‖ tag ‖ cipherText）。
 *
 * @param plainText 待加密的明文字符串
 * @param customKey 可选传入密钥，便于单测注入
 * @returns Base64 编码的密文字符串
 */
export function encryptWebhookSecret(plainText: string, customKey?: string): string {
  if (typeof plainText !== 'string') {
    throw new Error('待加密数据必须为字符串');
  }

  const keyBuffer = resolveWebhookSecretKey(customKey);
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv('aes-256-gcm', keyBuffer, iv);
  const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // 格式打包：iv(12 字节) + tag(16 字节) + cipherText(变长)
  const combined = Buffer.concat([iv, tag, cipherText]);
  return combined.toString('base64');
}

/**
 * 解密 Base64 打包密文并校验完整性。
 *
 * @param cipherBase64 Base64 打包密文字符串（iv ‖ tag ‖ cipherText）
 * @param customKey 可选传入密钥，便于单测注入
 * @returns 解密后的明文字符串
 */
export function decryptWebhookSecret(cipherBase64: string, customKey?: string): string {
  if (!cipherBase64 || typeof cipherBase64 !== 'string') {
    throw new Error('待解密数据必须为非空字符串');
  }

  const keyBuffer = resolveWebhookSecretKey(customKey);

  let combined: Buffer;
  try {
    combined = Buffer.from(cipherBase64, 'base64');
  } catch {
    throw new Error('解密失败：无效的 Base64 密文格式');
  }

  if (combined.length < MIN_PAYLOAD_LENGTH) {
    throw new Error('解密失败：密文数据长度不足');
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const cipherText = combined.subarray(IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    throw new Error('解密失败：密钥不匹配或数据已被篡改');
  }
}
