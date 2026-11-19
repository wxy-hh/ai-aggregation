# 技术规格：接入 QQ 登录并彻底下线匿名设备认证，推行全站登录墙与意图回跳 (QQ Login & Decommission Anonymous Auth)

Status: `ready-for-agent`  
ADR: `docs/adr/0018-decommission-anonymous-auth.md`  
Glossary: `GLOSSARY.md` (User, OAuthAccount, OpenID, 静默建号, 弹窗授权)

---

## Problem Statement

在平台早期建设阶段，为了降低初次体验门槛，系统引入了基于浏览器客户端设备指纹的匿名认证体系：未认证访客进站时，系统自动采集设备指纹并在后台静默创建匿名账号（`isAnonymous: true`、`deviceHash`），并赋予 20,000 Token 免费体验额度。
随着系统正式接入 QQ OAuth 互联登录（支持 PC 端独立弹窗 postMessage 通信与移动端自适应重定向），新用户已具备「一键授权、秒级静默建号」的极低门槛进入路径。在此背景下，既有的匿名认证体系已完全丧失存在价值，反而成为系统架构中最大的历史包袱与技术债源头：
1. **认证状态机冗余脆弱**：为了兼顾匿名认证与设备指纹生成，客户端初始化设置了 15 秒超时等待兜底，弱网或接口偶发抖动时，用户会被长时间卡在整屏 Loading 遮罩中；
2. **风控攻击面与配额消耗**：匿名注册接口仅依赖设备指纹哈希，极易被自动化脚本通过伪造设备指纹批量注册、薅取免费 Token 配额；
3. **业务逻辑全链路二义性污染**：为了区分匿名用户与真实用户，个人中心强行插入转正提示、封锁自定义 Webhook 工具与 Agent Runs 记录，额度弹窗与命盘提示中充斥着“游客/访客登录可得更多额度”等割裂分支；
4. **Edge 中间件心智复杂**：Edge Middleware 需在客户端维护额外的 `auth_kind` Cookie 来区分真实账号与匿名设备，系统架构不够纯粹；
5. **权限边界不一致**：未登录访客在不同页面表现不一，部分页面可看、部分白屏、部分静默创建账号，缺乏清晰一致的访问控制边界。

---

## Solution

彻底废除匿名认证体系与设备指纹链路，推行全站统一的 **全站登录拦截墙 (LoginWall)** 与 **意图回跳 (DeepRedirect)** 访问控制架构：
1. **纯净轻量的认证状态机**：移除客户端所有设备指纹采集与匿名登录逻辑，客户端引导收敛为“检查本地凭证与静默换票验证”；若无有效会话，立即将状态明确标记为已就绪且未登录（`status = 'ready', isAuthenticated = false`），无多余等待；
2. **服务端边缘严格拦截与意图回跳**：确立清晰的白名单路由（登录、注册、忘记密码、重置密码、OAuth 回调及静态资产）；未认证访客访问根路径或任何受保护业务路由时，中间件在服务端层面即刻 302 拦截并重定向至登录页，携带来源路径参数（`?redirect=...`），登录（账密或 QQ）成功后无缝原路回跳；
3. **数据库物理清理与破坏性迁移**：执行 Prisma 数据库迁移，在事务中级联清理所有存量匿名用户及其关联资产，物理抹除数据表中的 `isAnonymous` 与 `deviceHash` 字段；
4. **业务逻辑全面平权化**：清理个人中心针对匿名身份的降级封锁，彻底删除 `anonymous-policy.ts`，解除工具配置卡片与 Agent Runs 执行记录上的封锁，额度耗尽弹窗与提示文案统一对齐为标准的额度充值与反馈引导；
5. **依赖与死代码彻底拔除**：物理删除 `api/auth/anonymous` 路由、设备常量、策略文件及调试脚本，移除废弃环境变量 `ANONYMOUS_DEVICE_SALT` 与常量 `ANONYMOUS_FREE_TOKENS`；
6. **自动化测试套件改造**：重构 E2E 测试夹具为标准登录预热模式，全面更新单元测试 Mock 数据，补齐未登录拦截与意图回跳回归测试，保证全量测试绿灯。

---

## User Stories

1. 作为一名未认证访客，当我直接在浏览器输入网站根路径 `/` 时，我希望系统立即且平滑地重定向到 `/login`，以便我能第一时间看到清晰的登录选项（账号密码登录或 QQ 快捷登录）。
2. 作为一名未认证访客，当我点击他人分享的特定对话链接（如 `/chat?id=xxx`）或命理页面（`/destiny`）时，我希望系统自动拦截并跳转至 `/login?redirect=%2Fchat%3Fid%3Dxxx`，以便我在登录后无需手动重新查找该页面。
3. 作为一名未认证访客，当我在登录页点击「使用 QQ 登录」时，我希望正常拉起授权弹窗，并在授权通过后直接以真实登录用户身份进入系统，获得完整的注册体验额度与云端存储权限。
4. 作为一名未认证访客，当我在登录页输入正确的用户名和密码并点击登录时，我希望系统在验证通过后若存在 `redirect` 参数则原路回跳，若无则跳转至 `/home`。
5. 作为一名已登录用户，当我刷新网页或多标签页切换时，我希望系统通过持久化会话与无感 Token 刷新机制毫秒级恢复身份，绝不出现整屏等待 15 秒甚至误判未登录的闪烁跳出。
6. 作为一名已登录用户，当我访问个人中心（`/profile`）时，我希望看到自己账号的完整信息（包括加入时间、邮箱安全绑定），并能正常配置 Agent 自定义工具和查看 Agent Runs 执行流水，不再看到任何“匿名临时账号请转正”的干扰横幅。
7. 作为一名已登录用户，当我的额度耗尽触发提示弹窗时，我希望弹窗统一展示“查看额度 / 前往个人中心”或联系支持的操作按钮，而不再看到针对匿名用户的“使用账号密码登录获得更多额度”这种多余文案。
8. 作为一名已登录用户，当我在顶部栏或菜单中主动点击「退出登录」时，我希望系统彻底注销会话、清除本地凭证并安全重定向至 `/login?logout=1`，且再次打开网站受保护路由时必须重新认证。
9. 作为一名持有历史遗留匿名凭证的用户，当我使用旧浏览器缓存再次访问站点时，我希望服务端的刷新令牌接口自动识别并注销该无效令牌，前端平滑重定向至登录页，确保不产生幽灵会话或接口崩溃。
10. 作为一名系统运维人员，我希望部署与配置中不再包含 `ANONYMOUS_DEVICE_SALT` 等无关环境变量，减小配置负担与运维风险。
11. 作为一名平台管理员，我希望管理端的用户列表中不再被海量一次性设备匿名账号刷屏，所有注册用户均为可溯源、可联系的真实身份账号。

---

## Implementation Decisions

### 1. 认证状态机与客户端生命周期精简
- **引导生命周期**：客户端初始化流程仅负责两件事：
  1. 尝试使用现存会话凭证静默换取最新 Access Token；
  2. 若换取成功，调用用户信息接口拉取最新用户上下文并标记认证成功；
  3. 若无凭证或换取失败，立即结束引导，将状态置为就绪（`status = 'ready'`）且未认证（`isAuthenticated = false`）。
- **彻底去除超时等待**：删除 `AUTH_BOOTSTRAP_TIMEOUT_MS = 15000` 超时竞争 Promise 与捕获重试逻辑，首屏认证决策时间降至网络实际 RTT 级别。
- **清除接口与策略定义**：从客户端状态机中完全剔除 `anonymousSignIn` 操作以及设备凭证策略配置接口。

### 2. 严格路由守卫契约 (StrictAuthGuard & LoginWall)
- **公共白名单定义**：严格收敛为 `UNAUTH_ONLY_PATHS = ['/login', '/register', '/forgot-password', '/reset-password']` 与静态资源路由规则。
- **中间件行为 (`middleware.ts`)**：
  - 未认证访客访问受保护业务路径时，在服务端边缘层直接 302 重定向至 `/login?redirect=${encodeURIComponent(targetPath)}`；
  - 根路径 `/` 默认重定向至 `/login`；若持有合法登录态则重定向至 `/home`；
  - 已登录真实用户访问白名单路径（如 `/login`、`/register`）时，重定向至 `/home`；
  - 废弃 `auth_kind` Cookie 检查，统一基于 `refresh_token` 判定登录凭据存在性。
- **客户端守卫行为 (`AuthGuard` & `useRequireAuth`)**：
  - 监听状态机就绪（`status === 'ready'`）；
  - 一旦确认为未登录（`!isAuthenticated`），立即中止页面渲染并触发重定向；
  - 移除原有的 `isRealUser` / `isAnonymous` 特殊例外放行分支。

### 3. 后端服务与路由彻底下线
- **下线匿名接口**：彻底物理删除 `/api/auth/anonymous` 路由目录、接口实现及配套的 IP 注册频次限流器。
- **令牌刷新安全兜底**：在 `/api/auth/refresh` 接口中，移除所有关于匿名身份的识别与分支，统一对用户有效性进行标准校验；若找不到有效用户则清除 Cookie 并返回 401。
- **API 认证包装层**：API 路由鉴权包装器（`withAuth` / `requireAuth`）返回的用户上下文中，彻底移除 `isAnonymous` 属性，上游服务不再处理匿名权限逻辑。

### 4. 数据库模型清理与数据迁移
- **模型清理**：在 `packages/db/prisma/schema.prisma` 的 `User` 模型定义中物理移除 `isAnonymous` 与 `deviceHash` 字段。
- **迁移原子性脚本**：
  1. 第一阶段：执行数据级联清除，执行 `DELETE FROM "users" WHERE "isAnonymous" = true;`（由于外键关系均配置了 `onDelete: Cascade`，相关的刷新令牌、额度账本明细、历史记录等将一并干净清除）；
  2. 第二阶段：执行数据库表结构变更，物理删除 `isAnonymous` 与 `deviceHash` 列；
  3. 重新生成 Prisma Client，确保类型对齐。

### 5. 业务模块死代码与降级分支拔除
- **个人中心**：移除界面中用于提示匿名账号转正的横幅与逻辑分支；彻底删除 `anonymous-policy.ts`，面向所有合法登录用户（账密、QQ）完整开放修改昵称、头像、查看额度、注销账号、自定义 Webhook 工具与 Agent 运行记录。
- **额度对话框与解盘提示**：统一文案，移除“通过账号密码登录获得更多额度”的游客导向分支，额度耗尽统一提示联系管理员充值或提交反馈。
- **管理后台**：管理员后台用户列表（`/api/admin/users/route.ts`）移除 `includeAnonymous` 与 `isAnonymous` 过滤逻辑，展示干净的真实用户列表。

### 6. 死文件清理与自动化测试夹具重构
- **文件物理删除**：移除 `apps/web/src/app/api/auth/anonymous/route.ts`、`apps/web/src/lib/auth/anonymous-policy.ts`、`apps/web/src/lib/auth/anonymous-policy.test.ts`、`apps/web/src/lib/auth/anonymous-strategy.ts`、`apps/web/src/lib/constants/device.ts` 以及 `scripts/test-anonymous-access.py`；
- **配置与文档更新**：从 `apps/web/.env.example`、`infra/docker/.env.prod.example`、`DEPLOYMENT.md` 中移除 `ANONYMOUS_DEVICE_SALT`；
- **E2E 夹具重构**：废弃 `apps/web/e2e/fixtures.ts` 中基于 `seedFixedDevice` 的设备指纹方案，重构为标准登录夹具；
- **测试用例对齐**：修改 `home.spec.ts`、`auth-store.test.ts`、`use-auth.test.tsx`、`history.test.ts`、`profile-*.test.tsx` 等，删除与匿名相关的测试用例，补齐“未登录强制拦截至登录页”和“登录后意图回跳”的回归测试。

---

## Testing Decisions

### 1. 良好测试的定义原则
- 仅测试外部可见的认证状态转换与路由行为契约，不测试内部私有变量；
- 验证“无会话凭证”时系统能否干净、快速地完成就绪并拦截重定向至登录页；
- 验证生产数据库迁移脚本的幂等性与数据一致性。

### 2. 核心测试接缝 (Testing Seams)
- **接缝 1：服务端边缘路由拦截接缝 (`middleware.ts`)**  
  通过向 NextRequest 发送无凭证请求，验证访问受保护路由（如 `/home`, `/chat`, `/destiny`）时是否返回 302 并在 Location 响应头中携带规范的 `?redirect=...` 参数。
- **接缝 2：客户端认证状态机接缝 (`auth-store.ts` & `use-auth.ts`)**  
  测试在无凭据和凭据过期场景下，状态机初始化后状态准确为 `status = 'ready', isAuthenticated = false`，不触发任何额外的匿名认证网络请求。
- **接缝 3：数据持久化与数据库迁移接缝 (Prisma Migration SQL)**  
  验证在含有存量 `isAnonymous=true` 数据的数据库上应用迁移脚本后，数据是否干净级联删除，字段是否平滑移除，且不影响合法账号的数据完整性。

### 3. 先前测试参考 (Prior Art)
- `apps/web/src/hooks/use-auth.test.tsx`：原有的认证守卫与跳转时机单测，在此基础上剥离匿名用例并增强未登录拦截断言。
- `apps/web/src/app/api/auth/refresh/route.test.ts`：会话刷新测试，验证无有效凭证时 401 契约。

---

## Out of Scope

1. 微信 OAuth 登录的具体配置与接入改造（微信登录维持现有架构不变）；
2. 短信验证码登录/绑定能力（不在本次迭代范围内）；
3. 额度在线支付与充值网关（维持人工/管理员充值现状）。

---

## Further Notes

- 生产部署时，由于包含破坏性数据库变更（删除 `isAnonymous=true` 存量用户及字段移除），必须先使用 `pg_dump` 备份生产数据库，再按标准执行迁移。
- 本特性的真实浏览器端到端验收必须在 macOS 环境下使用 `ego-browser` 弹出真实可见窗口，验证未登录访问拦截、登录跳转以及登录后意图回跳链路。
