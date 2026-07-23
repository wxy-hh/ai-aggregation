import { redirect } from 'next/navigation';

/**
 * 首页直接重定向到工作台。
 *
 * 未登录用户由 /home 页面的 AuthGuard 触发匿名设备认证；
 * 已登录用户由 middleware 识别 refresh_token cookie 后同样重定向到 /home。
 */
export default function HomePage() {
  redirect('/home');
}
