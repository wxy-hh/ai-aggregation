import { redirect } from 'next/navigation';

/**
 * 根路径兜底重定向。
 *
 * 实际访问由 middleware.ts 处理：未登录访客 302 拦截至 /login，已登录用户直通 /chat。
 */
export default function HomePage() {
  redirect('/chat');
}
