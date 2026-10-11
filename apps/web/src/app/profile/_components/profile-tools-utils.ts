/**
 * Agent 自定义工具前端辅助工具函数
 *
 * 包含：
 * - suggestCallName: 从工具名称自动建议合法调用名
 * - validateCallName: 校验调用名格式
 * - extractHostname: 从 URL 提取展示用域名
 */

// CALL_NAME_REGEX 单一真源在 schemas/agent-tool-constants（客户端安全零依赖层）；
// 禁止改为从 agent-tool.schema 值导入——其依赖链含 node:net，会炸客户端包（验收实录）
import { CALL_NAME_REGEX } from '@/schemas/agent-tool-constants';

export { CALL_NAME_REGEX };

/** 单个工具最多可声明的参数个数（与服务端 zod .max(20) 对齐） */
export const MAX_PARAMS_LIMIT = 20;

/**
 * 从输入的工具名称建议调用名。
 *
 * @param name 用户输入的工具名称
 * @returns 建议的合法调用名
 */
export function suggestCallName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '';
  }

  // 尝试提取英文部分
  const cleaned = trimmed
    .toLowerCase()
    .replace(/[\s\t\n]+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 30);

  // 必须以小写字母开头，且长度至少为 2
  if (CALL_NAME_REGEX.test(cleaned)) {
    return cleaned;
  }

  // 若清理后不是以小写字母开头或长度不足（例如纯中文名），生成 tool_ 前缀加简短标识
  const randomSuffix = Math.random().toString(36).substring(2, 6);
  return `tool_${randomSuffix}`;
}

/**
 * 校验调用名是否符合规范。
 *
 * @param callName 待校验的调用名
 * @returns 错误提示文案，校验通过返回 null
 */
export function validateCallName(callName: string): string | null {
  const val = callName.trim();
  if (!val) {
    return '请输入调用名';
  }
  if (!/^[a-z]/.test(val)) {
    return '调用名必须以小写英文字母开头';
  }
  if (val.length < 2 || val.length > 31) {
    return '调用名长度必须在 2 到 31 个字符之间';
  }
  if (!/^[a-z0-9_-]+$/.test(val)) {
    return '调用名仅支持小写字母、数字、下划线及连字符';
  }
  return null;
}

/**
 * 从完整的 URL 中提取主机名，提取失败返回原串。
 *
 * @param url 完整 URL 网址
 * @returns 提取的域名或原串
 */
export function extractHostname(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}
