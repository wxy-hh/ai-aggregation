import { describe, it, expect } from 'vitest';
import {
  validateUrlLiteral,
  isBlockedIp,
  guardResolvedAddresses,
  guardedFetch,
  SsrfSecurityError,
} from './ssrf';

describe('SSRF 安全守卫 (TC01)', () => {
  describe('断言 1: validateUrlLiteral 字面量校验', () => {
    it('拒绝空输入和非法格式', () => {
      expect(validateUrlLiteral('').ok).toBe(false);
      expect(validateUrlLiteral('   ').ok).toBe(false);
      expect(validateUrlLiteral('not-a-url').ok).toBe(false);
    });

    it('拒绝不支持的协议', () => {
      const ftpResult = validateUrlLiteral('ftp://example.com/file.txt');
      expect(ftpResult.ok).toBe(false);
      if (!ftpResult.ok) {
        expect(ftpResult.reason).toContain('仅支持 http/https');
      }

      const fileResult = validateUrlLiteral('file:///etc/passwd');
      expect(fileResult.ok).toBe(false);
    });

    it('拒绝危险主机名', () => {
      expect(validateUrlLiteral('http://localhost:3000').ok).toBe(false);
      expect(validateUrlLiteral('http://test.localhost').ok).toBe(false);
      expect(validateUrlLiteral('http://service.internal').ok).toBe(false);
      expect(validateUrlLiteral('http://app.local').ok).toBe(false);
    });

    it('拒绝私有 IP 与云元数据字面量', () => {
      expect(validateUrlLiteral('http://127.0.0.1:8080').ok).toBe(false);
      expect(validateUrlLiteral('http://192.168.1.1').ok).toBe(false);
      expect(validateUrlLiteral('http://10.0.0.1').ok).toBe(false);
      expect(validateUrlLiteral('http://172.16.0.1').ok).toBe(false);
      expect(validateUrlLiteral('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
      expect(validateUrlLiteral('http://[::1]:8080').ok).toBe(false);
    });

    it('放行合法的公网 HTTP/HTTPS 网址', () => {
      const res1 = validateUrlLiteral('https://mp.weixin.qq.com/s/sample_article_id');
      expect(res1.ok).toBe(true);

      const res2 = validateUrlLiteral('http://example.com/blog/article-1');
      expect(res2.ok).toBe(true);
    });
  });

  describe('断言 2: guardResolvedAddresses DNS 结果安全校验（防重绑定）', () => {
    it('拒绝包含私网 IP 的解析结果', () => {
      const resLocal = guardResolvedAddresses([{ address: '127.0.0.1', family: 4 }]);
      expect(resLocal.ok).toBe(false);

      const resPrivate = guardResolvedAddresses([
        { address: '10.0.1.20', family: 4 },
      ]);
      expect(resPrivate.ok).toBe(false);

      const resMeta = guardResolvedAddresses([
        { address: '169.254.169.254', family: 4 },
      ]);
      expect(resMeta.ok).toBe(false);

      const resV6 = guardResolvedAddresses([{ address: '::1', family: 6 }]);
      expect(resV6.ok).toBe(false);
    });

    it('若同时解析出公网和内网 IP，必须 fail-closed 全局拒绝', () => {
      const mixed = guardResolvedAddresses([
        { address: '93.184.216.34', family: 4 }, // example.com
        { address: '192.168.1.100', family: 4 }, // 攻击者混入的内网 IP
      ]);
      expect(mixed.ok).toBe(false);
      if (!mixed.ok) {
        expect(mixed.reason).toContain('不允许访问');
      }
    });

    it('仅当全部 IP 均为合法公网 IP 时放行', () => {
      const publicIps = guardResolvedAddresses([
        { address: '93.184.216.34', family: 4 },
        { address: '93.184.216.35', family: 4 },
      ]);
      expect(publicIps.ok).toBe(true);
    });
  });

  describe('断言 3: guardedFetch 逐跳重定向安全检查', () => {
    it('直接请求内网地址时应抛出 SsrfSecurityError 并拦截', async () => {
      await expect(
        guardedFetch('http://127.0.0.1:9999/admin')
      ).rejects.toThrow(SsrfSecurityError);
    });
  });
});
