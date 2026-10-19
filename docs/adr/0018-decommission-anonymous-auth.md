# 彻底下线匿名登录与全面推行实名/OAuth身份体系

## Context
此前系统为了降低初次体验门槛，基于客户端设备指纹和 `ANONYMOUS_DEVICE_SALT` 环境变量实现了设备匿名自动建号（`isAnonymous: true`、`deviceHash`），并配发 20,000 Token 免费体验额度。
随着系统正式接入 QQ OAuth 互联登录，用户已具备「一键授权、秒级静默建号」的极低门槛进入路径。与此同时，匿名登录存在以下显著痛点：
1. 难以防范伪造设备指纹的刷量攻击以薅取免费 Token 配额；
2. 匿名用户会话因本地缓存清理极易丢失资产与历史数据，并在个人中心、智能体工具、命盘历史、额度弹窗等处衍生了大量复杂的二义性分支；
3. Edge Middleware 需在客户端维护额外的 `auth_kind` Cookie 来区分真实账号与匿名设备，系统心智与架构冗余。

## Decision
我们决定彻底清除系统中的匿名登录逻辑，全面收敛为「账密登录 + QQ OAuth 登录」的双轨注册用户体系：
1. **数据层与 Schema 迁移**：
   - 在 Prisma 迁移脚本中，级联清理存量 `isAnonymous = true` 的临时用户及其关联历史数据；
   - 彻底从 `User` 模型中移除 `isAnonymous` 和 `deviceHash` 字段。
2. **路由拦截与中间件精简**：
   - `middleware.ts` 设立严格公开白名单（`/login`, `/register`, `/forgot-password`, `/reset-password`, `/api/auth/` 及静态资源）；
   - 未登录访客访问根路径 `/` 或受保护页面（`/home`, `/chat`, `/destiny`, `/profile` 等）统一在服务端 302 重定向到 `/login`，辅以客户端 `AuthGuard` 兜底；
   - 废弃 `auth_kind` Cookie，鉴权回归单一标准的 `refresh_token` + Authorization Bearer JWT 机制。
3. **前端状态与业务逻辑剥离**：
   - 彻底物理删除 `apps/web/src/app/api/auth/anonymous/route.ts`、`apps/web/src/lib/auth/anonymous-policy.ts`、`apps/web/src/lib/auth/anonymous-strategy.ts`、`apps/web/src/lib/constants/device.ts` 及诊断脚本 `scripts/test-anonymous-access.py`；
   - 移除 `ANONYMOUS_DEVICE_SALT` 环境变量与 `ANONYMOUS_FREE_TOKENS` 常量；
   - 个人中心（Profile）移除所有针对匿名用户的提示条与功能隐藏分支，对所有合法用户完全开放个人资料、安全设置、Agent 运行记录与 Webhook 工具；
   - 管理后台与 Agent 运行时上下文移除 `isAnonymous` 相关的 Prisma 查询过滤。
4. **测试套件改造**：
   - 清理所有针对匿名策略的无用单测，升级现有单元测试中的 Mock 用户模型；
   - E2E 测试调整为基于未登录重定向断言与标准测试账号夹具。

## Status
Accepted

## Consequences
- **Positive**：
  - 代码库移除近千行胶水代码与冗余防御分支，维护成本与认知负担大幅降低；
  - 杜绝针对匿名设备指纹的刷额度滥用，资产账本与风控体系更加稳健；
  - 用户体验与数据归属更加清晰，所有操作均绑定至合法 User 实体。
- **Trade-off**：
  - 用户必须完成注册或通过 QQ 授权登录后方可进入系统使用 AI 能力，不再支持无账号试用。
