import type { MailPurpose } from './mailer';

/**
 * 邮件文案模板（纯函数）：主题与正文集中在此维护，邮件通道只负责投递。
 * 文案要求：中文、含有效期说明与「若非本人操作请忽略」提示。
 */

const PRODUCT_NAME = 'AI 聚合平台';

/** 各用途的场景词，用于主题与正文措辞 */
const PURPOSE_SCENE: Record<MailPurpose, string> = {
  register: '注册账号',
  bind: '绑定邮箱',
};

export interface MailContent {
  subject: string;
  html: string;
  text: string;
}

/** HTML 转义：正文里会嵌入用户可控的重置链接 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 验证码邮件：注册 / 绑定邮箱两处复用，10 分钟内有效 */
export function verificationCodeContent(purpose: MailPurpose, code: string): MailContent {
  const scene = PURPOSE_SCENE[purpose];
  const subject = `【${PRODUCT_NAME}】${scene}验证码`;
  const text = [
    '您好，',
    `您正在${scene}，验证码为：${code}`,
    '',
    '验证码 10 分钟内有效，请勿泄露给他人。',
    '若非本人操作，请忽略本邮件。',
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;color:#0f172a;line-height:1.7;font-size:14px;">',
    `<p>您好，</p>`,
    `<p>您正在${scene}，验证码为：</p>`,
    `<p style="font-size:26px;font-weight:700;letter-spacing:4px;color:#2563eb;margin:16px 0;">${code}</p>`,
    '<p>验证码 10 分钟内有效，请勿泄露给他人。</p>',
    '<p style="color:#64748b;">若非本人操作，请忽略本邮件。</p>',
    '</div>',
  ].join('');

  return { subject, html, text };
}

/** 重置密码邮件：链接 5 分钟内有效（与 reset token 有效期一致） */
export function passwordResetContent(resetUrl: string): MailContent {
  const subject = `【${PRODUCT_NAME}】重置密码`;
  const text = [
    '您好，',
    '我们收到了重置密码的请求，请打开以下链接设置新密码：',
    resetUrl,
    '',
    '链接 5 分钟内有效。若非本人操作，请忽略本邮件。',
  ].join('\n');

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;color:#0f172a;line-height:1.7;font-size:14px;">',
    '<p>您好，</p>',
    '<p>我们收到了重置密码的请求，请点击下面的按钮设置新密码：</p>',
    `<p style="margin:20px 0;"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;">重置密码</a></p>`,
    `<p style="color:#64748b;word-break:break-all;">若按钮无法点击，请复制此链接到浏览器打开：${escapeHtml(resetUrl)}</p>`,
    '<p style="color:#64748b;">链接 5 分钟内有效。若非本人操作，请忽略本邮件。</p>',
    '</div>',
  ].join('');

  return { subject, html, text };
}
