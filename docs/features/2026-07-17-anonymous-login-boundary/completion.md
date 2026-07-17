---
dev_flow_completion:
  schema_version: "1"
  feature_id: "2026-07-17-anonymous-login-boundary"
  level: "M"
  outcome: "verified"
  completed_at: "2026-07-17T13:30:00+08:00"
  retention: "compact"
  workflow_version: "0.9.0"
  risk_labels: ["security"]
  risk_approval_evidence: "用户已在 dev-task 输入中明确 3 项诉求，Playwright A-E 场景全部通过后确认 implementation_approval"
  risk_verification_summary: "auth_kind cookie 引入后，typecheck/lint/test 全绿；Playwright 覆盖匿名/真实/OAuth 边界 4 步关键路径，httpOnly 加固已生效"
  business_diff_fingerprint: "471f34d209217bfe5934c1d4291dd33f409a88ca"
  commits: []
  pull_request: "none"
  accepted_risks: []
---

# 完成报告：2026-07-17-anonymous-login-boundary

## 交付

- 匿名用户手动访问 `/login` 可停留并输入账号密码登录，不再被 middleware 重定向 `/home`。
- 匿名 `/profile` 隐藏「安全退出」「危险区域（注销账户）」，改为「使用账号密码登录」入口卡片。
- 匿名额度耗尽弹框追加「使用账号密码登录」按钮，点击跳 `/login`。
- 真实登录、OAuth、注册、refresh、logout 全链路 `auth_kind` cookie 同步，middleware 判定准确。

## 改动

11 个源码文件：
- `apps/web/src/lib/auth/jwt.ts`：`AUTH_KIND_COOKIE` + set/clear 工具（httpOnly）。
- `apps/web/src/app/api/auth/anonymous/route.ts`、`login/route.ts`、`register/route.ts`、`refresh/route.ts`、`logout/route.ts`：同步 `auth_kind` 生命周期。
- `apps/web/src/app/api/auth/oauth/qq/callback/route.ts`、`oauth/wechat/callback/route.ts`：OAuth 同步种 `auth_kind=user`。
- `apps/web/src/middleware.ts`：仅真实登录重定向 `/login` 等路径。
- `apps/web/src/app/login/page.tsx`：hydration 后仅真实登录跳 `/home`。
- `apps/web/src/app/profile/_components/profile-shell.tsx`：匿名态条件渲染登录入口卡片。
- `apps/web/src/components/quota-exhausted-dialog.tsx`：匿名态追加登录按钮。

## 验证

- `pnpm typecheck`：8/8 通过。
- `pnpm lint`：7/7 通过。
- `pnpm test`：34 文件 / 130 用例全通过。
- Playwright A–E + httpOnly 加固后 4 步复测全通过。详见 `docs/reviews/2026-07-17-anonymous-login-boundary-verification.md`。

## 遗留

- profile-shell 三态卡片渲染存在重复样式，可在后续抽取公共 `ProfileActionCard` 组件（Nice-to-have）。
- quota 弹框「使用账号密码登录」按钮可使用 `DialogClose` 提升语义（Nice-to-have）。
- OAuth 真实链路（QQ/微信沙箱）未跑 E2E；cookie 写入路径与 login 一致，已通过单元级验证。
