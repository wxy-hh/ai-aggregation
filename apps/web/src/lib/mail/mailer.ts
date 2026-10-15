import { logger } from '@repo/logger';
import { AliyunDirectMailAdapter } from './aliyun-direct-mail';

/**
 * 平台邮件通道（阿里云邮件推送 DirectMail）。
 *
 * 设计：
 * - `MailAdapter` 是路由层唯一的发信接口，真实实现与测试替身都以它为准；
 * - 未配置凭证时降级为 `UnconfiguredMailAdapter`：记 warn 日志并抛出未配置错误，
 *   路由层据 `configured` 标记统一按 503 处理（内测环境可无邮件通道跑通其余流程）。
 */

/** 验证码用途：注册 / 绑定邮箱（忘记密码走重置链接，只发链接不发验证码） */
export type MailPurpose = 'register' | 'bind';

export interface MailAdapter {
  /** 凭证是否齐备；未配置的降级适配器为 false */
  readonly configured: boolean;
  /** 发送验证码邮件（10 分钟内有效） */
  sendVerificationCode(email: string, code: string, purpose: MailPurpose): Promise<void>;
  /** 发送密码重置链接邮件 */
  sendPasswordReset(email: string, resetUrl: string): Promise<void>;
}

/** 邮件通道未配置凭证（路由层按 503 处理） */
export class MailNotConfiguredError extends Error {
  constructor(message = '邮件服务未配置，无法发送邮件') {
    super(message);
    this.name = 'MailNotConfiguredError';
  }
}

/** 邮件投递失败（网络异常或服务商返回错误码） */
export class MailSendError extends Error {
  /** 服务商错误码，如 InvalidMailAddress */
  readonly providerCode?: string;

  constructor(message: string, providerCode?: string) {
    super(message);
    this.name = 'MailSendError';
    this.providerCode = providerCode;
  }
}

export type MailEnv = Record<string, string | undefined>;

export interface AliyunDirectMailConfig {
  accessKeyId: string;
  accessKeySecret: string;
  accountName: string;
  fromAlias?: string;
  region: string;
}

const DEFAULT_REGION = 'cn-hangzhou';

/** 从环境变量读取阿里云邮件推送配置；缺任一必填项返回 null（视为未配置） */
export function readAliyunDirectMailConfig(env: MailEnv = process.env): AliyunDirectMailConfig | null {
  const accessKeyId = env.ALIYUN_DM_ACCESS_KEY_ID?.trim();
  const accessKeySecret = env.ALIYUN_DM_ACCESS_KEY_SECRET?.trim();
  const accountName = env.ALIYUN_DM_ACCOUNT_NAME?.trim();

  if (!accessKeyId || !accessKeySecret || !accountName) {
    return null;
  }

  return {
    accessKeyId,
    accessKeySecret,
    accountName,
    fromAlias: env.ALIYUN_DM_FROM_ALIAS?.trim() || undefined,
    region: env.ALIYUN_DM_REGION?.trim() || DEFAULT_REGION,
  };
}

/** 未配置凭证时的降级适配器：每次发信都记 warn 日志并抛未配置错误 */
class UnconfiguredMailAdapter implements MailAdapter {
  readonly configured = false;

  private unavailable(): never {
    logger.warn('邮件通道未配置，无法发送邮件', {
      hint: '请配置 ALIYUN_DM_ACCESS_KEY_ID / ALIYUN_DM_ACCESS_KEY_SECRET / ALIYUN_DM_ACCOUNT_NAME',
    });
    throw new MailNotConfiguredError();
  }

  async sendVerificationCode(): Promise<void> {
    this.unavailable();
  }

  async sendPasswordReset(): Promise<void> {
    this.unavailable();
  }
}

/** 按环境变量构造邮件适配器；凭证不全会得到未配置的降级适配器 */
export function createMailer(env: MailEnv = process.env): MailAdapter {
  const config = readAliyunDirectMailConfig(env);
  if (!config) {
    return new UnconfiguredMailAdapter();
  }
  return new AliyunDirectMailAdapter(config);
}

/** 进程内单例：首次取用时按环境变量构造，之后复用 */
let instance: MailAdapter | null = null;

export function getMailer(): MailAdapter {
  if (!instance) {
    instance = createMailer();
  }
  return instance;
}

/** 替换当前适配器（测试注入或运行期替换）；传 null 恢复为按环境变量重建 */
export function setMailer(mailer: MailAdapter | null): void {
  instance = mailer;
}
