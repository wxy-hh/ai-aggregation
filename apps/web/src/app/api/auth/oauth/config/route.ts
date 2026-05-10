import { createSuccessResponse } from '@/lib/api/responses';

export async function GET() {
  return createSuccessResponse({
    wechat: Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET && process.env.WECHAT_REDIRECT_URI),
    qq: Boolean(process.env.QQ_APP_ID && process.env.QQ_APP_SECRET && process.env.QQ_REDIRECT_URI),
  });
}
