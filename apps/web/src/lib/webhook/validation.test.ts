/**
 * Webhook URL 收紧层纯函数单测
 *
 * 验证目标：
 * - 必须为 https 协议（http 协议拒绝）
 * - 拦截内网 IP、云元数据 IP、localhost、.local 等保留主机名
 * - 合法公网 https 地址放行
 */

import { describe, expect, it } from 'vitest';
import { validateWebhookUrl } from './validation';

describe('validateWebhookUrl', () => {
  it('拒绝 http 协议的合法公网地址', () => {
    const res = validateWebhookUrl('http://api.example.com/webhook');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('Webhook 网址必须使用 https 协议');
    }
  });

  it('放行合法的公网 https 地址', () => {
    const res = validateWebhookUrl('https://api.example.com/v1/webhook?source=agent');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.hostname).toBe('api.example.com');
      expect(res.url.pathname).toBe('/v1/webhook');
    }
  });

  it('拒绝非 http/https 协议', () => {
    const res = validateWebhookUrl('ftp://example.com/resource');
    expect(res.ok).toBe(false);
  });

  it('拒绝空字符串和无效 URL', () => {
    expect(validateWebhookUrl('').ok).toBe(false);
    expect(validateWebhookUrl('not-a-valid-url').ok).toBe(false);
  });

  it('拒绝 localhost 与危险后缀域名', () => {
    const blockedDomains = [
      'https://localhost/webhook',
      'https://service.localhost:8080/hook',
      'https://internal.local/api',
      'https://backend.internal/event',
      'https://myhome.localdomain/sync',
      'https://router.home.arpa/notify',
    ];

    for (const raw of blockedDomains) {
      const res = validateWebhookUrl(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe('该地址不允许访问');
      }
    }
  });

  it('拒绝内网与保留 IPv4 地址字面量', () => {
    const blockedIps = [
      'https://127.0.0.1/hook',
      'https://10.0.0.5:8443/hook',
      'https://192.168.1.100/webhook',
      'https://172.16.0.1/notify',
      'https://169.254.169.254/latest/meta-data', // AWS 云元数据
      'https://100.64.0.1/cgnat',
      'https://0.0.0.0/any',
    ];

    for (const raw of blockedIps) {
      const res = validateWebhookUrl(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe('该地址不允许访问');
      }
    }
  });

  it('拒绝内网 IPv6 地址字面量', () => {
    const blockedIpv6 = [
      'https://[::1]/hook',
      'https://[fc00::1]/hook',
      'https://[fe80::1]/hook',
    ];

    for (const raw of blockedIpv6) {
      const res = validateWebhookUrl(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toBe('该地址不允许访问');
      }
    }
  });
});
