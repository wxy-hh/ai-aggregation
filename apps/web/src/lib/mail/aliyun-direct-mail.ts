import crypto from 'crypto';
import { MailSendError, type MailAdapter, type MailPurpose } from './mailer';
import { passwordResetContent, verificationCodeContent, type MailContent } from './templates';

/**
 * 阿里云邮件推送（DirectMail）适配层。
 *
 * 走 RPC 风格 HTTPS API（Action=SingleSendMail, Version=2015-11-23），
 * 签名按阿里云 POP 规则用 node:crypto 现算（HMAC-SHA1），不引入 SDK 依赖。
 */

const DM_ENDPOINT = 'https://dm.aliyuncs.com/';
const DM_API_VERSION = '2015-11-23';
const DM_ACTION = 'SingleSendMail';

export interface AliyunDirectMailOptions {
  accessKeyId: string;
  accessKeySecret: string;
  accountName: string;
  /** 发件人昵称 */
  fromAlias?: string;
  /** 区域，默认 cn-hangzhou */
  region: string;
}

/** POP 签名要求的百分号编码：encodeURIComponent 后再修正 +、*、~ */
function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, '%20')
    .replace(/\*/g, '%2A')
    .replace(/%7E/g, '~');
}

/** 按参数名字典序拼接规范化查询串 */
function canonicalizeParams(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join('&');
}

/** POP 签名：StringToSign = POST & %2F & percentEncode(规范化查询串) */
function computeSignature(canonicalizedQuery: string, accessKeySecret: string): string {
  const stringToSign = `POST&${percentEncode('/')}&${percentEncode(canonicalizedQuery)}`;
  return crypto.createHmac('sha1', `${accessKeySecret}&`).update(stringToSign).digest('base64');
}

/** 拼出带签名的表单请求体 */
export function buildSignedRequestBody(
  params: Record<string, string>,
  accessKeySecret: string
): string {
  const canonicalizedQuery = canonicalizeParams(params);
  const signature = computeSignature(canonicalizedQuery, accessKeySecret);
  return `${canonicalizedQuery}&Signature=${percentEncode(signature)}`;
}

interface DirectMailResponse {
  Code?: string;
  Message?: string;
  RequestId?: string;
}

export class AliyunDirectMailAdapter implements MailAdapter {
  readonly configured = true;

  private readonly options: AliyunDirectMailOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AliyunDirectMailOptions, fetchImpl: typeof fetch = fetch) {
    this.options = options;
    this.fetchImpl = fetchImpl;
  }

  async sendVerificationCode(email: string, code: string, purpose: MailPurpose): Promise<void> {
    await this.sendMail(email, verificationCodeContent(purpose, code));
  }

  async sendPasswordReset(email: string, resetUrl: string): Promise<void> {
    await this.sendMail(email, passwordResetContent(resetUrl));
  }

  private async sendMail(to: string, content: MailContent): Promise<void> {
    const { accessKeyId, accessKeySecret, accountName, fromAlias, region } = this.options;

    // 公共参数（RPC 风格）与业务参数一起参与签名
    const params: Record<string, string> = {
      Action: DM_ACTION,
      Version: DM_API_VERSION,
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomUUID(),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      RegionId: region,
      AccountName: accountName,
      // 1 = 发信地址（AccountName 必须是控制台已配置的发信地址）
      AddressType: '1',
      ReplyToAddress: 'false',
      ToAddress: to,
      Subject: content.subject,
      HtmlBody: content.html,
      TextBody: content.text,
      ...(fromAlias ? { FromAlias: fromAlias } : {}),
    };

    let response: Response;
    try {
      response = await this.fetchImpl(DM_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: buildSignedRequestBody(params, accessKeySecret),
      });
    } catch (error) {
      throw new MailSendError(
        `邮件服务请求失败：${error instanceof Error ? error.message : '未知网络错误'}`
      );
    }

    const payload = (await response.json().catch(() => null)) as DirectMailResponse | null;

    // 服务商错误既可能走 HTTP 错误码，也可能在 200 响应体里带 Code
    if (!response.ok || payload?.Code) {
      throw new MailSendError(
        payload?.Message || `邮件发送失败（HTTP ${response.status}）`,
        payload?.Code
      );
    }
  }
}
