/**
 * 工具领域错误与异常定义
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 */

/** 工具领域错误：message 即面向用户/模型的中文文案；code 供程序化作错误分类（避免中文文案匹配） */
export class ToolError extends Error {
  readonly code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}
