import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateOAuthState, getWechatAuthUrl, getQQAuthUrl } from '../oauth';

const ENV_BACKUP = { ...process.env };

beforeEach(() => {
  vi.unstubAllEnvs();
  process.env.WECHAT_APP_ID = 'wx-test-app-id';
  process.env.WECHAT_REDIRECT_URI = 'https://example.com/api/auth/oauth/wechat/callback';
  process.env.QQ_APP_ID = 'qq-test-app-id';
  process.env.QQ_REDIRECT_URI = 'https://example.com/api/auth/oauth/qq/callback';
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...ENV_BACKUP };
});

describe('generateOAuthState', () => {
  it('应生成 32 字符的十六进制字符串', () => {
    const state = generateOAuthState();
    expect(state).toHaveLength(32);
    expect(/^[0-9a-f]+$/.test(state)).toBe(true);
  });

  it('每次生成应不同', () => {
    const s1 = generateOAuthState();
    const s2 = generateOAuthState();
    expect(s1).not.toBe(s2);
  });
});

describe('getWechatAuthUrl', () => {
  it('应构造正确的微信 OAuth URL', () => {
    const url = getWechatAuthUrl('test-state-123');
    expect(url).toContain('https://open.weixin.qq.com/connect/qrconnect');
    expect(url).toContain('appid=wx-test-app-id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=snsapi_login');
    expect(url).toContain('state=test-state-123');
    expect(url).toContain('#wechat_redirect');
  });

  it('未配置环境变量时应抛出异常', () => {
    delete process.env.WECHAT_APP_ID;
    expect(() => getWechatAuthUrl('test')).toThrow('微信 OAuth 未配置');
  });
});

describe('getQQAuthUrl', () => {
  it('应构造正确的 QQ OAuth URL', () => {
    const url = getQQAuthUrl('test-state-456');
    expect(url).toContain('https://graph.qq.com/oauth2.0/authorize');
    expect(url).toContain('client_id=qq-test-app-id');
    expect(url).toContain('response_type=code');
    expect(url).toContain('scope=get_user_info');
    expect(url).toContain('state=test-state-456');
  });

  it('未配置环境变量时应抛出异常', () => {
    delete process.env.QQ_APP_ID;
    expect(() => getQQAuthUrl('test')).toThrow('QQ OAuth 未配置');
  });
});
