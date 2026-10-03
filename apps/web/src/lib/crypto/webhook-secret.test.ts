/**
 * Webhook 凭证加密纯函数单元测试
 *
 * 验证目标：
 * - 正常加解密 roundtrip 正确性
 * - 注入自定义测试密钥（不读取真实环境变量）
 * - 密钥缺失、格式错误时的显式抛错
 * - 密文被篡改、使用错误密钥解密时的显式抛错（绝不静默降级）
 */

import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  resolveWebhookSecretKey,
} from './webhook-secret';

/** 生成临时的 32 字节十六进制测试密钥（64 个 hex 字符） */
function generateTestHexKey(): string {
  return randomBytes(32).toString('hex');
}

describe('webhook-secret 加解密纯函数', () => {
  const testKey = generateTestHexKey();

  it('加解密 roundtrip 正确，支持各类明文字符串', () => {
    const testCases = [
      'Bearer secret-token-123456',
      'Basic YWxhZGRpbjpvcGVuc2VzYW1l',
      '纯中文测试凭证-密码@123#',
      JSON.stringify({ apiKey: 'ak-live-123456789', role: 'admin' }),
      '',
    ];

    for (const text of testCases) {
      const encrypted = encryptWebhookSecret(text, testKey);
      expect(typeof encrypted).toBe('string');
      // 密文应为非空的 Base64 字符串，且不能与明文相同
      if (text.length > 0) {
        expect(encrypted).not.toBe(text);
      }

      const decrypted = decryptWebhookSecret(encrypted, testKey);
      expect(decrypted).toBe(text);
    }
  });

  it('两次加密相同明文应生成不同密文（因 IV 随机）', () => {
    const plain = 'my-secret-password';
    const encrypted1 = encryptWebhookSecret(plain, testKey);
    const encrypted2 = encryptWebhookSecret(plain, testKey);

    expect(encrypted1).not.toBe(encrypted2);
    expect(decryptWebhookSecret(encrypted1, testKey)).toBe(plain);
    expect(decryptWebhookSecret(encrypted2, testKey)).toBe(plain);
  });

  it('打包格式符合 base64(iv 12 字节 ‖ tag 16 字节 ‖ cipherText)', () => {
    const plain = 'test-token';
    const encrypted = encryptWebhookSecret(plain, testKey);
    const raw = Buffer.from(encrypted, 'base64');

    // 至少包含 12 字节 IV + 16 字节 Tag + 明文长度
    expect(raw.length).toBeGreaterThanOrEqual(28 + plain.length);
  });

  it('支持读取环境变量 WEBHOOK_SECRET_KEY', () => {
    const originalEnv = process.env.WEBHOOK_SECRET_KEY;
    try {
      process.env.WEBHOOK_SECRET_KEY = testKey;
      const plain = 'env-secret-value';
      const encrypted = encryptWebhookSecret(plain);
      const decrypted = decryptWebhookSecret(encrypted);
      expect(decrypted).toBe(plain);
    } finally {
      process.env.WEBHOOK_SECRET_KEY = originalEnv;
    }
  });

  it('密钥缺失时显式抛错', () => {
    const originalEnv = process.env.WEBHOOK_SECRET_KEY;
    try {
      delete process.env.WEBHOOK_SECRET_KEY;
      expect(() => resolveWebhookSecretKey()).toThrow('未配置 WEBHOOK_SECRET_KEY 环境变量');
      expect(() => encryptWebhookSecret('hello')).toThrow('未配置 WEBHOOK_SECRET_KEY 环境变量');
      expect(() => decryptWebhookSecret('some-data')).toThrow('未配置 WEBHOOK_SECRET_KEY 环境变量');
    } finally {
      process.env.WEBHOOK_SECRET_KEY = originalEnv;
    }
  });

  it('密钥格式非法时显式抛错', () => {
    const invalidKeys = [
      'short-key',
      '1234567890abcdef', // 只有 16 字符
      'g'.repeat(64), // 非十六进制字符
      'a'.repeat(63), // 长度不足 64
      'a'.repeat(65), // 长度超出 64
    ];

    for (const invalid of invalidKeys) {
      expect(() => resolveWebhookSecretKey(invalid)).toThrow(
        'WEBHOOK_SECRET_KEY 必须为 32 字节十六进制字符串（64 个字符）'
      );
    }
  });

  it('使用错误密钥解密时显式抛错，绝不静默降级', () => {
    const encrypted = encryptWebhookSecret('sensitive-data', testKey);
    const anotherKey = generateTestHexKey();

    expect(() => decryptWebhookSecret(encrypted, anotherKey)).toThrow(
      '解密失败：密钥不匹配或数据已被篡改'
    );
  });

  it('密文被篡改时显式抛错', () => {
    const plain = 'super-sensitive-token';
    const encrypted = encryptWebhookSecret(plain, testKey);
    const raw = Buffer.from(encrypted, 'base64');

    // 1. 篡改 IV 部分（前 12 字节中的某个字节）
    const tamperedIv = Buffer.from(raw);
    tamperedIv[2] ^= 0xff;
    expect(() => decryptWebhookSecret(tamperedIv.toString('base64'), testKey)).toThrow(
      '解密失败：密钥不匹配或数据已被篡改'
    );

    // 2. 篡改 Tag 部分（第 12 到 28 字节中的某个字节）
    const tamperedTag = Buffer.from(raw);
    tamperedTag[15] ^= 0xff;
    expect(() => decryptWebhookSecret(tamperedTag.toString('base64'), testKey)).toThrow(
      '解密失败：密钥不匹配或数据已被篡改'
    );

    // 3. 篡改 CipherText 部分（第 28 字节及之后）
    const tamperedCipher = Buffer.from(raw);
    tamperedCipher[30] ^= 0xff;
    expect(() => decryptWebhookSecret(tamperedCipher.toString('base64'), testKey)).toThrow(
      '解密失败：密钥不匹配或数据已被篡改'
    );
  });

  it('密文数据长度不足 28 字节时显式抛错', () => {
    const shortBuffer = Buffer.from('short-data');
    const shortBase64 = shortBuffer.toString('base64');

    expect(() => decryptWebhookSecret(shortBase64, testKey)).toThrow('解密失败：密文数据长度不足');
  });

  it('传入非字符串明文或空密文时显式抛错', () => {
    // @ts-expect-error 测试非字符串入参
    expect(() => encryptWebhookSecret(12345, testKey)).toThrow('待加密数据必须为字符串');
    expect(() => decryptWebhookSecret('', testKey)).toThrow('待解密数据必须为非空字符串');
  });
});
