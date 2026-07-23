import crypto from 'crypto';

// ==================== 微信 OAuth ====================

interface WechatTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  unionid?: string;
}

interface WechatUserInfo {
  openid: string;
  unionid?: string;
  nickname: string;
  headimgurl: string;
  sex: number;
}

/** 构造微信 OAuth 授权 URL */
export function getWechatAuthUrl(state: string): string {
  const appId = process.env.WECHAT_APP_ID;
  const redirectUri = process.env.WECHAT_REDIRECT_URI;

  if (!appId || !redirectUri) {
    throw new Error('微信 OAuth 未配置');
  }

  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state,
  });

  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`;
}

/** 使用 code 换取微信 access_token */
export async function getWechatAccessToken(code: string): Promise<WechatTokenResponse> {
  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('微信 OAuth 未配置');
  }

  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code',
  });

  const res = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`微信获取 access_token 失败: ${res.status}`);
  }

  const data = await res.json();

  if ('errcode' in data && data.errcode !== 0) {
    throw new Error(`微信 OAuth 错误: ${data.errmsg || data.errcode}`);
  }

  return data as WechatTokenResponse;
}

/** 获取微信用户信息 */
export async function getWechatUserInfo(
  accessToken: string,
  openId: string
): Promise<WechatUserInfo> {
  const params = new URLSearchParams({
    access_token: accessToken,
    openid: openId,
  });

  const res = await fetch(`https://api.weixin.qq.com/sns/userinfo?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`微信获取用户信息失败: ${res.status}`);
  }

  const data = await res.json();

  if ('errcode' in data && data.errcode !== 0) {
    throw new Error(`微信获取用户信息错误: ${data.errmsg || data.errcode}`);
  }

  return data as WechatUserInfo;
}

// ==================== QQ OAuth ====================

interface QQTokenResponse {
  access_token: string;
  expires_in: string;
  refresh_token: string;
}

interface QQUserInfo {
  nickname: string;
  figureurl_qq_2: string;
  gender: string;
}

/** 构造 QQ OAuth 授权 URL */
export function getQQAuthUrl(state: string): string {
  const appId = process.env.QQ_APP_ID;
  const redirectUri = process.env.QQ_REDIRECT_URI;

  if (!appId || !redirectUri) {
    throw new Error('QQ OAuth 未配置');
  }

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'get_user_info',
    state,
  });

  return `https://graph.qq.com/oauth2.0/authorize?${params.toString()}`;
}

/** 使用 code 换取 QQ access_token */
export async function getQQAccessToken(code: string): Promise<QQTokenResponse> {
  const appId = process.env.QQ_APP_ID;
  const appSecret = process.env.QQ_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('QQ OAuth 未配置');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: process.env.QQ_REDIRECT_URI || '',
  });

  const res = await fetch(`https://graph.qq.com/oauth2.0/token?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`QQ 获取 access_token 失败: ${res.status}`);
  }

  const text = await res.text();

  // QQ 返回的是 URL 参数格式，不是 JSON
  const data = Object.fromEntries(new URLSearchParams(text)) as unknown as QQTokenResponse;

  if (!data.access_token) {
    throw new Error(`QQ OAuth 错误: ${text}`);
  }

  return data;
}

/** 获取 QQ 用户的 OpenID */
export async function getQQOpenId(accessToken: string): Promise<string> {
  const res = await fetch(
    `https://graph.qq.com/oauth2.0/me?access_token=${accessToken}`
  );

  if (!res.ok) {
    throw new Error(`QQ 获取 OpenID 失败: ${res.status}`);
  }

  const text = await res.text();
  // 响应格式: callback( {"client_id":"xxx","openid":"xxx"} );
  const match = text.match(/"openid"\s*:\s*"([^"]+)"/);

  if (!match || !match[1]) {
    throw new Error(`QQ 获取 OpenID 失败: ${text}`);
  }

  return match[1];
}

/** 获取 QQ 用户信息 */
export async function getQQUserInfo(
  accessToken: string,
  openId: string
): Promise<QQUserInfo> {
  const appId = process.env.QQ_APP_ID;
  const params = new URLSearchParams({
    access_token: accessToken,
    oauth_consumer_key: appId || '',
    openid: openId,
  });

  const res = await fetch(`https://graph.qq.com/user/get_user_info?${params.toString()}`);

  if (!res.ok) {
    throw new Error(`QQ 获取用户信息失败: ${res.status}`);
  }

  const data = await res.json();

  if (data.ret !== 0) {
    throw new Error(`QQ 获取用户信息错误: ${data.msg}`);
  }

  return data as QQUserInfo;
}

/** 生成防 CSRF 的 state 参数 */
export function generateOAuthState(): string {
  return crypto.randomBytes(16).toString('hex');
}
