import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { logger } from '@repo/logger';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { withAuth } from '@/lib/api/with-auth';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import {
  consumeEmailDailyQuota,
  generateEmailCode,
  storeEmailCode,
  type EmailPurpose,
} from '@/lib/auth/email-verification';
import { sendEmailCodeSchema } from '@/schemas/auth.schema';
import { getMailer, type MailAdapter } from '@/lib/mail/mailer';

/**
 * POST /api/auth/email/send-code
 *
 * 平台级「发送验证码」入口，注册验证 / 绑定邮箱两处复用
 * （忘记密码走重置链接，不发验证码）。
 * - 限流：5 次/分钟/IP（fail-closed）+ 单邮箱日上限 10 次（Redis 计数，防邮件轰炸）；
 * - register：邮箱未被注册才发；bind：需登录且邮箱未被他人绑定；
 * - 验证码存 Redis `verify:<purpose>:<email>`，只存 SHA-256 摘要，10 分钟有效。
 */

const SUCCESS_MESSAGE: Record<EmailPurpose, string> = {
  register: '验证码已发送，请在 10 分钟内完成注册',
  bind: '验证码已发送，请在 10 分钟内完成绑定',
};

interface IssueCodeInput {
  purpose: EmailPurpose;
  email: string;
  /** bind 用途的当前登录用户 id；register 用途为 null */
  userId: string | null;
  mailer: MailAdapter;
}

async function issueCode({ purpose, email, userId, mailer }: IssueCodeInput) {
  if (purpose === 'register') {
    const taken = await prisma.user.findFirst({ where: { email } });
    if (taken) {
      return ApiError.badRequest('该邮箱已被注册，请直接登录或更换邮箱', 'EMAIL_EXISTS');
    }
  }

  if (purpose === 'bind') {
    const taken = await prisma.user.findFirst({ where: { email, id: { not: userId! } } });
    if (taken) {
      return ApiError.badRequest('该邮箱已被其他账号绑定', 'EMAIL_EXISTS');
    }
  }

  // 日配额先于存在性判断计数：存在与不存在的邮箱在第 11 次请求上表现一致
  const quota = await consumeEmailDailyQuota(email);
  if (quota.status === 'unavailable') {
    return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
  }
  if (quota.status === 'exceeded') {
    return ApiError.tooManyRequests('该邮箱今日获取验证码次数过多，请稍后再试', {
      retryAfter: quota.retryAfter,
    });
  }

  const code = generateEmailCode();

  try {
    await storeEmailCode(purpose, email, code);
  } catch (error) {
    logger.warn('验证码存储不可用，拒绝发送', {
      purpose,
      error: error instanceof Error ? error.message : String(error),
    });
    return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
  }

  await mailer.sendVerificationCode(email, code, purpose);

  return createSuccessResponse(null, SUCCESS_MESSAGE[purpose]);
}

export async function POST(req: NextRequest) {
  try {
    // 先过 IP 级限流（fail-closed：防止验证码被批量请求）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.emailSendCode);
    if (limited) {
      return limited;
    }

    const body = await req.json().catch(() => null);
    const parsed = sendEmailCodeSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { purpose, email } = parsed.data;

    // 邮件能力检查放在账号查询之前：未配置时对所有用途、所有邮箱统一 503，
    // 不因「账号是否存在」产生可观测差异
    const mailer = getMailer();
    if (!mailer.configured) {
      logger.warn('邮件通道未配置，拒绝发送验证码', { purpose });
      return ApiError.serviceUnavailable('邮件服务暂不可用，请稍后再试');
    }

    if (purpose === 'bind') {
      return withAuth(req, (user) => issueCode({ purpose, email, userId: user.id, mailer }));
    }

    return issueCode({ purpose, email, userId: null, mailer });
  } catch (error) {
    console.error('发送邮箱验证码失败:', error);
    // 不向客户端透传底层异常细节，仅保留服务端日志
    return ApiError.internalError('发送失败，请稍后重试');
  }
}
