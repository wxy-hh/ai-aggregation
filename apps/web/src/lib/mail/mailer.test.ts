import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';

const mocks = vi.hoisted(() => ({
  warn: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('@repo/logger', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}));

import { MailNotConfiguredError, MailSendError, createMailer } from './mailer';

/** 已配置凭证的环境变量样例 */
const CONFIGURED_ENV = {
  ALIYUN_DM_ACCESS_KEY_ID: 'test-key-id',
  ALIYUN_DM_ACCESS_KEY_SECRET: 'test-key-secret',
  ALIYUN_DM_ACCOUNT_NAME: 'noreply@mail.example.com',
  ALIYUN_DM_FROM_ALIAS: 'AI 聚合平台',
};

function okResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({ RequestId: 'req-1', EnvId: 'env-1' }),
  };
}

/** POP 签名规则的独立复算实现：用测试自己的算法交叉验证适配器签名 */
function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

function expectedSignature(body: string, accessKeySecret: string): string {
  const params = new URLSearchParams(body);
  const canonicalized = [...params.entries()]
    .filter(([key]) => key !== 'Signature')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`)
    .join('&');
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalized)}`;
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64');
}

function sentBody(callIndex = 0): URLSearchParams {
  const [, init] = mocks.fetch.mock.calls[callIndex] as [string, RequestInit];
  return new URLSearchParams(init.body as string);
}

describe('邮件适配器工厂', () => {
  beforeEach(() => {
    mocks.warn.mockReset();
    mocks.fetch.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('未配置凭证时降级为未配置适配器：记 warn 日志并抛出未配置错误', async () => {
    const mailer = createMailer({});

    expect(mailer.configured).toBe(false);
    await expect(
      mailer.sendVerificationCode('user@example.com', '123456', 'register')
    ).rejects.toBeInstanceOf(MailNotConfiguredError);
    expect(mocks.warn).toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('凭证齐备时返回已配置的阿里云邮件推送适配器', () => {
    expect(createMailer(CONFIGURED_ENV).configured).toBe(true);
  });
});

describe('阿里云邮件推送适配器（SingleSendMail RPC 签名）', () => {
  beforeEach(() => {
    mocks.warn.mockReset();
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(okResponse());
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('按 POP 规则签名并提交发信参数（含默认区域 cn-hangzhou）', async () => {
    const mailer = createMailer(CONFIGURED_ENV);

    await mailer.sendVerificationCode('user@example.com', '135790', 'register');

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://dm.aliyuncs.com/');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'application/x-www-form-urlencoded'
    );

    const params = sentBody();
    expect(params.get('Action')).toBe('SingleSendMail');
    expect(params.get('Version')).toBe('2015-11-23');
    expect(params.get('Format')).toBe('JSON');
    expect(params.get('AccessKeyId')).toBe(CONFIGURED_ENV.ALIYUN_DM_ACCESS_KEY_ID);
    expect(params.get('SignatureMethod')).toBe('HMAC-SHA1');
    expect(params.get('SignatureVersion')).toBe('1.0');
    expect(params.get('RegionId')).toBe('cn-hangzhou');
    expect(params.get('AccountName')).toBe(CONFIGURED_ENV.ALIYUN_DM_ACCOUNT_NAME);
    expect(params.get('FromAlias')).toBe(CONFIGURED_ENV.ALIYUN_DM_FROM_ALIAS);
    expect(params.get('AddressType')).toBe('1');
    expect(params.get('ReplyToAddress')).toBe('false');
    expect(params.get('ToAddress')).toBe('user@example.com');
    expect(params.get('Subject')).toContain('验证码');
    expect(params.get('Timestamp')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(params.get('SignatureNonce')).toBeTruthy();

    // 签名由测试侧独立复算，防止适配器「自签自验」把错误算法写死
    const signature = params.get('Signature');
    expect(signature).toBe(expectedSignature(init.body as string, CONFIGURED_ENV.ALIYUN_DM_ACCESS_KEY_SECRET));
  });

  it('每次请求使用不同的 SignatureNonce', async () => {
    const mailer = createMailer(CONFIGURED_ENV);

    await mailer.sendVerificationCode('user@example.com', '135790', 'register');
    await mailer.sendVerificationCode('user@example.com', '135790', 'register');

    const first = sentBody(0).get('SignatureNonce');
    const second = sentBody(1).get('SignatureNonce');
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it('ALIYUN_DM_REGION 覆盖默认区域', async () => {
    const mailer = createMailer({ ...CONFIGURED_ENV, ALIYUN_DM_REGION: 'ap-southeast-1' });

    await mailer.sendVerificationCode('user@example.com', '135790', 'bind');

    expect(sentBody().get('RegionId')).toBe('ap-southeast-1');
  });

  it('验证码邮件包含验证码、10 分钟有效期与「若非本人操作请忽略」提示', async () => {
    const mailer = createMailer(CONFIGURED_ENV);

    await mailer.sendVerificationCode('user@example.com', '135790', 'bind');

    const params = sentBody();
    const text = params.get('TextBody') ?? '';
    const html = params.get('HtmlBody') ?? '';
    expect(text).toContain('135790');
    expect(text).toContain('10 分钟');
    expect(text).toContain('若非本人操作，请忽略本邮件');
    expect(html).toContain('135790');
  });

  it('重置密码邮件包含重置链接', async () => {
    const mailer = createMailer(CONFIGURED_ENV);
    const resetUrl = 'https://app.example.com/reset-password?token=abc123';

    await mailer.sendPasswordReset('user@example.com', resetUrl);

    const params = sentBody();
    expect(params.get('ToAddress')).toBe('user@example.com');
    expect(params.get('Subject')).toContain('重置密码');
    expect(params.get('TextBody')).toContain(resetUrl);
    expect(params.get('HtmlBody')).toContain('token=abc123');
  });

  it('投递失败时抛出带服务商错误码的 MailSendError', async () => {
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ Code: 'InvalidMailAddress', Message: '收件地址无效' }),
    });
    const mailer = createMailer(CONFIGURED_ENV);

    await expect(mailer.sendVerificationCode('bad@example.com', '135790', 'register')).rejects.toThrow(
      MailSendError
    );
    await expect(mailer.sendVerificationCode('bad@example.com', '135790', 'register')).rejects.toThrow(
      '收件地址无效'
    );
  });

  it('响应体带错误码（HTTP 200）同样按失败处理', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ Code: 'InvalidAccountName', Message: '发信地址不存在' }),
    });
    const mailer = createMailer(CONFIGURED_ENV);

    await expect(mailer.sendVerificationCode('user@example.com', '135790', 'register')).rejects.toThrow(
      '发信地址不存在'
    );
  });
});
