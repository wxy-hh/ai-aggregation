import { prisma } from '@repo/db';

function sanitize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 20);
}

export async function generateOAuthUsername(
  provider: string,
  nickname: string
): Promise<string> {
  const base = sanitize(nickname) || `${provider}_user`;
  const prefix = `${provider}_${base}`.slice(0, 25);
  let candidate = prefix;
  let suffix = 0;

  while (await prisma.user.findUnique({ where: { username: candidate } })) {
    suffix++;
    candidate = `${prefix}_${suffix}`;
  }

  return candidate;
}
