/**
 * 匿名用户权限策略。
 *
 * 集中管理匿名用户与真实用户在账号操作上的差异，
 * 避免在各个 API handler 中重复内联判断。
 */

import { AuthError } from './errors';
import type { UserContext } from './get-current-user';

/**
 * 校验用户是否可以修改用户名。
 * 匿名用户不允许修改用户名，避免设备标识与人工账号混淆。
 */
export function assertCanUpdateUsername(user: UserContext, username?: string): void {
  if (user.isAnonymous && username !== undefined) {
    throw new AuthError('匿名用户不允许修改用户名', 'FORBIDDEN');
  }
}

/**
 * 校验用户是否可以自助注销账号。
 * 匿名用户不支持自助注销，防止误删设备关联数据。
 */
export function assertCanDeleteAccount(user: UserContext): void {
  if (user.isAnonymous) {
    throw new AuthError('匿名用户不支持自助注销，请登录后使用', 'FORBIDDEN');
  }
}
