/**
 * 审批凭证模块（AGENT-HITL-ACTION / ADR-0041 §4）
 *
 * 凭证 = HMAC-SHA256 签名的载荷，绑定「用户、会话范围、工具名、工具 ID、目标域名、参数哈希、过期时间」，有效期 10 分钟。
 * 验签通过后用 Redis `SET NX`（TTL 等于有效期）标记已用，重放即拒绝。
 *
 * 失败关闭原则：签名密钥缺失、Redis 不可用时一律拒绝执行写操作，绝不降级放行。
 * 密钥来自环境变量 APPROVAL_TOKEN_SECRET（至少 32 个字符）；本期单密钥，不支持轮换。
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { getRedisClient } from '@repo/redis';
import { MCP_MAX_APPROVAL_PARAM_CHARS } from './mcp/contracts';
import { canonicalizeApprovalParams } from './approval-display';

export { canonicalizeApprovalParams };

/** 凭证有效期：10 分钟 */
export const APPROVAL_TOKEN_TTL_MS = 10 * 60 * 1000;

/** 签名密钥最小长度 */
const MIN_SECRET_LENGTH = 32;

/** 已用标记的 Redis key 前缀 */
const USED_KEY_PREFIX = 'agent:approval-used:';

/** 拒绝原因分类 */
export type ApprovalRejectKind =
  | 'unavailable'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'tool_unavailable'
  | 'params_too_large';

const REJECT_PRESETS: Record<ApprovalRejectKind, { status: number; message: string }> = {
  unavailable: {
    status: 503,
    message: '审批服务暂时不可用，该操作未执行，请稍后重试',
  },
  invalid: {
    status: 403,
    message: '审批凭证无效，该操作未执行，请重新提出需求',
  },
  expired: {
    status: 410,
    message: '审批已过期（超过 10 分钟），该操作未执行，请重新提出需求',
  },
  used: {
    status: 409,
    message: '该审批已被使用，操作不会重复执行',
  },
  tool_unavailable: {
    status: 409,
    message: '该工具已被停用或删除，操作未执行',
  },
  params_too_large: {
    status: 400,
    message: `审批参数规范化序列化超过 ${MCP_MAX_APPROVAL_PARAM_CHARS.toLocaleString('en-US')} 字符上限，拒绝签发审批凭证`,
  },
};

/** 审批被拒绝：携带可直接展示给用户的中文提示与 HTTP 状态 */
export class ApprovalRejectedError extends Error {
  readonly kind: ApprovalRejectKind;
  readonly status: number;

  constructor(kind: ApprovalRejectKind) {
    super(REJECT_PRESETS[kind].message);
    this.name = 'ApprovalRejectedError';
    this.kind = kind;
    this.status = REJECT_PRESETS[kind].status;
  }
}

/** 个人远程 MCP 扩展附加安全绑定（Server + 快照版本 + 配置指纹） */
export interface McpApprovalBinding {
  serverId: string;
  snapshotVersion: number;
  configFingerprint: string;
}

/** 凭证所绑定的调用特征 */
export interface ApprovalBinding {
  userId: string;
  /** 会话范围（前端传入的当前会话 ID；缺省为空串） */
  scope: string;
  toolName: string;
  /** 工具 ID：同名工具被删除重建或替换后，旧凭证不再适用 */
  toolId: string;
  /** 目标域名：与卡片向用户展示的域名一致，工具 URL 被改到别的域名后旧凭证不再适用 */
  host: string;
  params: unknown;
  /** 可选 MCP 配置指纹绑定（仅个人远程 MCP 工具携带；Webhook 为空） */
  mcp?: McpApprovalBinding | null;
}

interface ApprovalMcpPayload {
  /** MCP 服务器 ID */
  i: string;
  /** 快照版本号 */
  v: number;
  /** 配置指纹 */
  f: string;
}

interface ApprovalPayload {
  v: 1;
  /** 用户 ID */
  u: string;
  /** 会话范围 */
  s: string;
  /** 工具名 */
  t: string;
  /** 工具 ID */
  i: string;
  /** 目标域名 */
  d: string;
  /** 参数规范化序列化后的 sha256 */
  h: string;
  /** 过期时间（毫秒时间戳） */
  e: number;
  /** 一次性随机串，Redis 已用标记以它为 key */
  n: string;
  /** MCP 扩展安全绑定（缺省与 Webhook 兼容） */
  m?: ApprovalMcpPayload;
}

/** 规范化 MCP 绑定为统一结构（签发与验签共用，Webhook 与空值归一为 null） */
function normalizeMcpBinding(mcp?: McpApprovalBinding | null): McpApprovalBinding | null {
  if (!mcp) return null;
  if (
    typeof mcp.serverId !== 'string' ||
    !mcp.serverId ||
    typeof mcp.snapshotVersion !== 'number' ||
    !Number.isFinite(mcp.snapshotVersion) ||
    typeof mcp.configFingerprint !== 'string' ||
    !mcp.configFingerprint
  ) {
    return null;
  }
  return {
    serverId: mcp.serverId,
    snapshotVersion: mcp.snapshotVersion,
    configFingerprint: mcp.configFingerprint,
  };
}

function resolveSecret(): string {
  const secret = process.env.APPROVAL_TOKEN_SECRET;
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new ApprovalRejectedError('unavailable');
  }
  return secret.trim();
}

function hashParamsCanonical(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/**
 * 签发审批凭证。密钥缺失时抛 ApprovalRejectedError('unavailable')，调用方应失败关闭。
 */
export function issueApprovalToken(
  binding: ApprovalBinding,
  now: number = Date.now()
): { token: string; expiresAt: number } {
  const secret = resolveSecret();
  const normalizedMcp = normalizeMcpBinding(binding.mcp);
  const canonicalParams = canonicalizeApprovalParams(binding.params);
  if (normalizedMcp && canonicalParams.length > MCP_MAX_APPROVAL_PARAM_CHARS) {
    throw new ApprovalRejectedError('params_too_large');
  }

  const expiresAt = now + APPROVAL_TOKEN_TTL_MS;
  const payload: ApprovalPayload = {
    v: 1,
    u: binding.userId,
    s: binding.scope,
    t: binding.toolName,
    i: binding.toolId,
    d: binding.host,
    h: hashParamsCanonical(canonicalParams),
    e: expiresAt,
    n: randomUUID(),
    ...(normalizedMcp
      ? {
          m: {
            i: normalizedMcp.serverId,
            v: normalizedMcp.snapshotVersion,
            f: normalizedMcp.configFingerprint,
          },
        }
      : {}),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${body}.${sign(secret, body)}`, expiresAt };
}

/**
 * 校验凭证签名、绑定与有效期（纯计算，不触碰 Redis）。
 * 通过返回一次性标记 nonce；任何不符抛 ApprovalRejectedError。
 */
export function verifyApprovalToken(
  token: string,
  expected: ApprovalBinding,
  now: number = Date.now()
): { nonce: string } {
  const secret = resolveSecret();

  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new ApprovalRejectedError('invalid');
  }
  const [body, signature] = parts;

  const expectedSig = Buffer.from(sign(secret, body));
  const actualSig = Buffer.from(signature);
  if (expectedSig.length !== actualSig.length || !timingSafeEqual(expectedSig, actualSig)) {
    throw new ApprovalRejectedError('invalid');
  }

  let payload: ApprovalPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ApprovalPayload;
  } catch {
    throw new ApprovalRejectedError('invalid');
  }
  if (
    payload.v !== 1 ||
    typeof payload.n !== 'string' ||
    !payload.n ||
    typeof payload.e !== 'number'
  ) {
    throw new ApprovalRejectedError('invalid');
  }

  const expectedParamsHash = hashParamsCanonical(canonicalizeApprovalParams(expected.params));
  if (
    payload.u !== expected.userId ||
    payload.s !== expected.scope ||
    payload.t !== expected.toolName ||
    payload.i !== expected.toolId ||
    payload.d !== expected.host ||
    payload.h !== expectedParamsHash
  ) {
    throw new ApprovalRejectedError('invalid');
  }

  // MCP 配置绑定对称归一化比对：Webhook 双方皆 null 通过；MCP 需三要素严格一致
  const expectedMcp = normalizeMcpBinding(expected.mcp);
  if (payload.m !== undefined) {
    if (
      typeof payload.m !== 'object' ||
      payload.m === null ||
      typeof payload.m.i !== 'string' ||
      !payload.m.i ||
      typeof payload.m.v !== 'number' ||
      !Number.isFinite(payload.m.v) ||
      typeof payload.m.f !== 'string' ||
      !payload.m.f
    ) {
      throw new ApprovalRejectedError('invalid');
    }
  }
  const tokenMcp: McpApprovalBinding | null = payload.m
    ? {
        serverId: payload.m.i,
        snapshotVersion: payload.m.v,
        configFingerprint: payload.m.f,
      }
    : null;

  if (expectedMcp === null && tokenMcp !== null) {
    throw new ApprovalRejectedError('invalid');
  }
  if (expectedMcp !== null) {
    if (
      tokenMcp === null ||
      tokenMcp.serverId !== expectedMcp.serverId ||
      tokenMcp.snapshotVersion !== expectedMcp.snapshotVersion ||
      tokenMcp.configFingerprint !== expectedMcp.configFingerprint
    ) {
      throw new ApprovalRejectedError('invalid');
    }
  }

  if (now > payload.e) {
    throw new ApprovalRejectedError('expired');
  }

  return { nonce: payload.n };
}

/**
 * 标记凭证已用（Redis SET NX，TTL 等于有效期）。
 * 已被使用抛 'used'；Redis 不可用抛 'unavailable'（失败关闭）。
 */
export async function consumeApprovalToken(nonce: string): Promise<void> {
  let result: unknown;
  try {
    result = await getRedisClient().set(
      `${USED_KEY_PREFIX}${nonce}`,
      '1',
      'EX',
      Math.ceil(APPROVAL_TOKEN_TTL_MS / 1000),
      'NX'
    );
  } catch (error) {
    console.warn('[approval] Redis 标记已用失败，按失败关闭拒绝执行:', error);
    throw new ApprovalRejectedError('unavailable');
  }
  if (result !== 'OK') {
    throw new ApprovalRejectedError('used');
  }
}
