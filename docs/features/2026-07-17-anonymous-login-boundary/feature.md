# 匿名访问与正常登录边界修复

## Feature ID

`2026-07-17-anonymous-login-boundary`

## 背景

`2026-07-08-anonymous-access-quota` 上线匿名访问后未覆盖匿名/真实登录的边界：
- 匿名状态下手跳 `/login` 被 middleware 重定向 `/home`，无法切换为账号密码登录。
- 匿名 `/profile` 显示「安全退出」「危险区域（注销账户）」，与匿名身份不匹配。
- 匿名额度耗尽弹框缺少跳登录页引导。

## 设计

引入 `auth_kind` cookie（httpOnly，取值 `anonymous` | `user`），与 `refresh_token` 同步生命周期。middleware 通过 `refresh_token + auth_kind='user'` 判定真实登录，匿名用户可在 `/login` 停留；profile/quota 弹框按 `user.isAnonymous` 条件渲染。

## 关键改动

- `apps/web/src/lib/auth/jwt.ts`：`AUTH_KIND_COOKIE` 常量与 set/clear 工具（httpOnly）。
- 5 个 auth API route（anonymous/login/register/logout/refresh）+ 2 个 OAuth 回调：同步写入/清除 `auth_kind`。
- `apps/web/src/middleware.ts`：仅真实登录重定向 `/login` → `/home`。
- `apps/web/src/app/login/page.tsx`：hydration 后仅真实登录跳 `/home`。
- `apps/web/src/app/profile/_components/profile-shell.tsx`：匿名态改为「使用账号密码登录」入口卡片。
- `apps/web/src/components/quota-exhausted-dialog.tsx`：匿名态追加登录入口按钮。

## 验证

- `pnpm typecheck` / `pnpm lint` / `pnpm test` 全通过。
- Playwright A–E 场景 + httpOnly 加固后 4 步关键路径复测全通过。
- 报告：`docs/reviews/2026-07-17-anonymous-login-boundary-verification.md`。
