/**
 * 认证/授权错误类，替代字符串匹配进行错误类型判断。
 */
export class AuthError extends Error {
  public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN';

  constructor(message: string, code: 'UNAUTHORIZED' | 'FORBIDDEN') {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}
