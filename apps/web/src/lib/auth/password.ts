import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/** 对明文密码进行 bcrypt 哈希 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** 验证明文密码与哈希是否匹配 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
