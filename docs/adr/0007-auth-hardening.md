# 0007. 认证加固：保留自研认证、令牌只存摘要、限流故障处置分层

* **状态**：已接受
* **日期**：2026-09-29
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web/src/lib/auth/`、认证相关路由（`apps/web/src/app/api/auth/**`、`apps/web/src/app/api/profile/email/**`）、`packages/shared/src/rate-limit.ts`、`apps/worker`（过期令牌清理任务）

---

## 背景

认证加固专项（`docs/features/2026-09-29-auth-hardening/spec.md`）在补齐 SSRF、限流、凭证存储、会话一致性与邮件通道的同时，暴露出三个需要团队级取舍的结构性问题：

1. **框架选型被反复重开**：NextAuth/Auth.js 是社区默认心智模型，环境变量示例、部署文档与外部世界知识都默认指向它，每次评审都会重新讨论「是否迁过去」；而实锤的问题（令牌明文落库、限流器静默放行、媒体代理 SSRF）全部位于加固层，与认证框架本身无关。
2. **凭证明文落库**：会话表与令牌表以明文保存 refresh token 与密码重置令牌，数据库导出、备份、慢查询日志任一环节泄露，即可直接冒用他人会话，完全绕过口令。
3. **限流器故障语义单一**：`RateLimiter` 在 Redis 异常/超时下一律放行（fail-open）。对业务接口这是可用性正确的选择，对认证接口等于「Redis 抖动 = 口令爆破窗口无上限」——且登录失败锁定计数同样存在 Redis，Redis 挂掉时两道防线一起消失。

## 决策

### 1. 保留自研认证方案，不迁移 Auth.js / NextAuth

认证链路维持自研：HS256 JWT（access token，15 分钟）+ bcrypt 口令 + 数据库 refresh token（30 天，httpOnly cookie）+ 匿名设备指纹（HMAC-SHA256）+ Postgres 额度账本。三入口（账密、微信扫码、QQ OAuth）并存。

判定依据：本轮与历史暴露的问题都位于加固层（令牌存储、限流语义、代理白名单、OAuth 回调状态检查），框架替换不会自动修复其中任何一项；而迁移必须重写全部 OAuth 回调、匿名建号与额度接缝。

### 2. 一次性凭证只存 SHA-256 摘要

- **refresh token**：`crypto.randomBytes(48)` 生成，明文只存在客户端 httpOnly cookie 中，库中存 `sha256(明文)` 的 hex；校验时先哈希再按摘要查询（`apps/web/src/lib/auth/jwt.ts` 的 `hashRefreshToken`）。
- **密码重置令牌（数据库）**：沿用同一前缀模式，落库值为 `reset:<sha256>`，明文只出现在重置邮件链接里。
- **邮箱验证码（Redis）**：键为 `verify:<purpose>:<email>`，值只存验证码的 SHA-256 摘要，10 分钟有效、验证通过即删。
- **上线即存量会话全部失效**：不做「明文 + 摘要双读」兼容，内测阶段直接接受一次性强制重新登录。
- **配套清理**：`apps/worker` 新增每日 03:17（东八区）的 BullMQ repeatable job，删除 `RefreshToken` 表中 `expiresAt < now()` 的记录，避免表单调增长。

### 3. 限流设施故障处置分层：无兜底的 fail-closed、有 DB 兜底的 fail-open

- **认证接口 fail-closed**：登录、注册、忘记密码、重置密码使用 `AUTH_RATE_LIMITS` 配置并以 `failureMode: 'closed'` 接入（`apps/web/src/lib/auth/rate-limit.ts`）。Redis 异常或超时（限流器内部上限 1s）时拒绝请求，由路由映射为 503。
- **业务接口 fail-open**：默认 `failureMode: 'open'`（`packages/shared/src/rate-limit.ts` 的构造默认值）保持不变，但异常必须走 warn 级日志，不再静默吞掉。
- **分层依据是「有没有第二道兜底」**：认证入口没有兜底（限流不可用 = 爆破无上限），因此宁可拒绝；业务 AI 接口的真实成本闸门在 Postgres 额度账本（`QuotaSession` / `quota-ledger`），限流只是缓冲垫，Redis 抖动不应让业务整体不可用。
- **应急出口**：`AUTH_RATE_LIMIT_FAILURE_MODE=open` 作为运维开关，仅在 Redis 长时间故障、必须恢复登录能力时临时使用，恢复后立即改回 `closed`。

## 备选方案及否决理由

| 备选方案 | 否决理由 |
| --- | --- |
| 迁移 Auth.js / NextAuth | 微信扫码、QQ OAuth、匿名设备指纹、额度账本深度耦合自研链路，迁移需重写全部回调与计费接缝；本轮问题不在架构层，迁移不解决任何一条已发现缺陷 |
| access token 改存 httpOnly cookie | 会引入全站 CSRF 防护需求（全部写接口 + SameSite 策略），当前阶段负收益；本轮改用「access token 只驻内存」，同样消除了凭证持久化面 |
| 令牌明文落库 + 应用层对称加密列 | 解密密钥仍需与库同处一份配置，泄露面从「库」平移到「配置 + 库」，且每次校验都要解密；摘要不可逆，泄露即失去使用价值 |
| 摘要改用 bcrypt 慢哈希 | 令牌是 48 字节随机串（非低熵口令），慢哈希不带来额外的抗爆破收益，只放大登录/刷新延迟 |
| 认证限流也保持 fail-open，仅补告警 | 告警无法阻止正在进行的爆破；Redis 故障期间认证入口必须关闭，可用性损失由运维开关兜底 |
| 双读兼容（明文与摘要同时接受） | 兼容期会把明文会话的暴露窗口延长到无法预估，且需要额外的数据迁移与回滚脚本；内测阶段直接失效更简单可靠 |

## 后果

- **安全边界**：数据库导出/备份/慢查询日志不再等价于「会话可直接冒用」；限流设施故障不再静默放大认证攻击面。
- **可用性代价**：Redis 长时间故障时认证入口整段返回 503，必须由运维按预案切 `AUTH_RATE_LIMIT_FAILURE_MODE=open` 应急；部署文档需长期保留这条说明。
- **一次性运维成本**：切换上线即全部存量会话失效（含内测渠道），所有用户需重新登录；不做双读兼容，因此不需要回滚脚本。
- **登录锁定须防「锁死人」**：锁定期内的登录尝试只拒绝（423 + 剩余分钟数），不累计失败、不延长锁定；锁定期满后再次失败才从既有计数继续累进翻倍（`apps/web/src/lib/auth/login-lockout.ts` 的 `recordFailure` + `apps/web/src/app/api/auth/login/route.ts`）。若锁定期内继续累计并刷新 `lockedUntil`，攻击者只需周期性重试同一账号即可让锁定永不解除——把防爆破机制变成拒绝服务工具；因此「锁定期内不喂养计数器」是锁定策略的硬约束，后续调整锁定参数时不得回退此语义。
- **可测试性**：限流决策表（Redis 正常 / 抛错 / 超时 × fail-open / fail-closed）由 `packages/shared/src/__tests__/rate-limit.test.ts` 单源覆盖；滑动窗口的计数语义另有「内存 zset 语义」的假 Redis 用例守护（写死 zcard 的 mock 无法发现 member 去重导致的计数失效）；路由测试只断言外部可见行为（HTTP 状态码、写入的摘要），遵循 ADR-0003「接口即测试面」。
- **回潮防线**：此后新增认证/验证类令牌必须走「前缀 + sha256 摘要」模式；新增认证路由必须显式选择 fail-closed；新增一次性凭证不得明文落库。
- **已知让步**：
  - 匿名建号限流仍为 fail-open（`apps/web/src/app/api/auth/anonymous/route.ts`，额度由 DB 账本兜底），匿名属内测临时能力，不做进一步收紧。
  - **登录失败计数层的 Redis 异常按 fail-open 处理**：`createLoginAttemptStore` 读写失败时按「未锁定」放行（记 warn 日志），避免计数设施抖动把用户挡在登录之外；此让步成立的前提是 IP 级认证限流为 fail-closed（Redis 整体故障时登录入口本身返回 503），即两道防线不会同时因 Redis 故障而消失。若将来登录限流改为 fail-open，必须同步把计数层改为 fail-closed。
