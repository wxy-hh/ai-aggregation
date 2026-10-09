# 真实 QQ 互联 OAuth 2.0 登录接入 规格说明（PRD）

- **日期**：2026-10-09
- **状态**：ready-for-agent
- **决策来源**：2026-10-09 `/grill-with-docs` 架构与领域审问会话
- **适用范围**：`apps/web` 登录交互、QQ OAuth 路由与回调处理、`packages/db` 用户与第三方账户模型
- **关联 ADR**：[ADR-0008: 第三方 OAuth 授权：PC 弹窗与 postMessage 跨窗口通信流](../../adr/0008-oauth-popup-postmessage-flow.md)、[ADR-0007: 认证加固](../../adr/0007-auth-hardening.md)、[ADR-0003: 接口即测试面](../../adr/0003-route-test-finalize-seam.md)

> 议题跟踪说明：本项目按仓库惯例以 `docs/features/` 目录作为功能议题载体，本目录即为「真实 QQ 互联 OAuth 2.0 登录接入」议题，`ready-for-agent` 状态见上。

---

## Problem Statement

作为希望使用 QQ 账号快捷登录平台的用户：
1. **真实 QQ 登录不可用**：当前系统仅有基础的 OAuth 代码原型，环境变量未对齐官方 AppID 与 AppKey，未绑定合法的线上回调地址，导致点击 QQ 登录按钮无法完成真实身份认证。
2. **PC 端授权跳转体验割裂**：PC 端点击登录直接整页跳转到腾讯页面，完成授权后整页重新加载回主站，缺乏现代化桌面端产品的一体化流畅感。
3. **弹窗模式存在被浏览器拦截风险**：常规异步调用 `window.open` 会被 Safari、Chrome 等浏览器的安全策略静默拦截，导致弹窗打不开。
4. **小弹窗嵌套完整页面**：若直接在授权弹窗内使用 HTTP 302 重定向到主页或登录页，会在固定尺寸的授权小窗口内嵌套加载完整主站，主登录窗口无法感知登录态变化。
5. **用户取消或异常时缺少直观反馈**：用户取消授权或授权遭遇异常时，若弹窗内报错或无响应，用户无法直观理解失败原因。

---

## Solution

在现存自研认证架构下，全面打通真实 QQ 互联 OAuth 2.0 登录链路，引入分端自适应授权交互与安全的跨窗口通信机制：

1. **凭证与域名合规接入**：注入真实 `QQ_APP_ID="1903994498"`、对应 `QQ_APP_SECRET`，将回调地址规范为已在 QQ 互联控制台完成白名单登记的 `https://www.chunfen.ink/api/auth/oauth/qq/callback`。
2. **PC 端同步防拦截弹窗授权**：PC 端在用户直接点击手势第一毫秒同步打开 `720×550` 居中授权小窗，保持手势信任链（User Gesture Trust Chain），彻底规避弹窗拦截；移动端自动降级为全页重定向。
3. **HTML + postMessage 跨窗口通信协议**：授权回调接口完成 JWT 签发及 RefreshToken 摘要入库后，返回轻量级安全 HTML 响应，通过 `window.opener.postMessage` 投递凭证完成事件，并调用 `window.close()` 自动关闭弹窗；主窗口平滑进入系统。
4. **统一异常消息回传与友好 Toast**：用户取消授权（`no_code`）、账号被禁用（`account_disabled`）或服务异常（`oauth_failed`）时，弹窗同样向父窗口发送 `QQ_AUTH_ERROR` 消息并秒关，由主登录页给用户呈现精准的 Toast 提示。
5. **零摩擦静默建号（Auto-Provisioning）**：新 QQ 用户首次登录时自动生成内部 `User` 与 `OAuthAccount`，同步 QQ 昵称和高清头像，配发注册赠送 Token 额度，实现一键极速可用。

---

## User Stories

1. 作为 PC 端访客，我希望点击 QQ 登录图标时弹出一个精致的独立小窗口，以便我不必离开当前的登录页面。
2. 作为移动端访客，我希望点击 QQ 登录图标时直接整页跳转到手机 QQ 授权页，以便适应移动端窄屏交互。
3. 作为 PC 端访客，我希望点击 QQ 登录时浏览器不会弹出“已拦截弹窗”的警告，以便我顺畅完成后续流程。
4. 作为 PC 端访客，我希望在小窗口内确认授权或扫码后，小窗口能自动关闭，以便主页面直接无刷新进入平台首页。
5. 作为首次使用 QQ 登录的用户，我希望授权完成后无需繁琐地填写密码或额外资料即可直接创建账号，以便以最低摩擦开始使用产品。
6. 作为首次使用 QQ 登录的用户，我希望系统自动同步我的 QQ 昵称和头像，以便我的个人资料保持一致性。
7. 作为首次使用 QQ 登录的用户，我希望我的新账号自动获得注册赠送的初始 AI Token 额度，以便我能立即体验平台各项 AI 功能。
8. 作为已使用 QQ 登录过的老用户，我希望再次点击 QQ 登录时能直接识别并登录到我原有的账号，以便保留我的历史记录和剩余额度。
9. 作为被管理员禁用的 QQ 用户，我希望在尝试 QQ 登录时被明确拒绝并收到封禁提示，以便系统安全策略得到彻底执行。
10. 作为在 QQ 授权页面点击了“取消”的用户，我希望授权小窗口自动消失，且主登录页提示“已取消授权”，以便我清楚当前操作结果。
11. 作为遭遇网络抖动或服务异常的用户，我希望小窗口自动关闭，且主登录页提示具体的错误信息，以便我知道需要稍后重试。
12. 作为注重安全的用户，我希望我的 QQ 登录凭证使用安全的 httpOnly Cookie 进行持久化，以便防止 XSS 攻击窃取令牌。
13. 作为注重安全的用户，我希望跨窗口通信严格限定目标域名为本站域名，以便其他恶意网页无法窃听我的授权状态。
14. 作为运维与开发者，我希望 QQ 相关的 AppID、AppKey、Redirect URI 完全由环境变量配置，以便敏感信息不硬编码在代码库中。
15. 作为开发者，我希望 QQ 登录的回调流程具备高阶路由契约单测保护，以便未来的代码迭代不会破坏认证逻辑。

---

## Implementation Decisions

### 1. 认证模块配置与环境变量规范
- 环境变量键名统一收敛为：`QQ_APP_ID`、`QQ_APP_SECRET`、`QQ_REDIRECT_URI`；
- 配置检测接口 `GET /api/auth/oauth/config` 依据上述三个环境变量的存在性返回 `{ qq: boolean }`。

### 2. 前端登录页交互协议（PC 弹窗与通信监听）
- PC 端点击 QQ 登录按钮时，在点击事件处理函数的第一行同步调用：
  ```ts
  const popup = window.open(
    '/api/auth/oauth/qq',
    'QQAuthPopup',
    `width=720,height=550,top=${top},left=${left},menubar=no,toolbar=no,status=no`
  );
  ```
- 登录页面挂载全局 `message` 事件监听器：
  - 严格校验 `event.origin === window.location.origin`；
  - 收到 `{ type: 'QQ_AUTH_SUCCESS' }` 时，弹出成功提示并路由跳转至 `/home`；
  - 收到 `{ type: 'QQ_AUTH_ERROR', code }` 时，根据 `code` 显示对应的友好 Toast 错误，并重置加载状态；
- 移动端视口下（或检测到移动设备），直接执行 `window.location.href = '/api/auth/oauth/qq'`。

### 3. 服务端回调接口协议与响应契约 (`GET /api/auth/oauth/qq/callback`)
- **凭证交换与会话签发**：
  - 校验 `state` 防 CSRF 攻击；
  - 携带 `code` 向 QQ 互联接口换取 `access_token`；
  - 调用 `graph.qq.com/oauth2.0/me` 获取 `openid`；
  - 调用 `graph.qq.com/user/get_user_info` 获取昵称与高清头像（`figureurl_qq_2`）；
  - 查库或静默建号（`User` + `OAuthAccount`），写入 `RefreshToken` 摘要并设置 httpOnly Cookie；
- **响应体协议**：
  - 不返回 HTTP 302，改为返回 `Content-Type: text/html; charset=utf-8` 的轻量 HTML；
  - HTML 内嵌安全 JavaScript 脚本：
    ```html
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          (function() {
            var payload = { type: 'QQ_AUTH_SUCCESS' };
            if (window.opener && window.opener !== window) {
              window.opener.postMessage(payload, window.location.origin);
              window.close();
            } else {
              window.location.replace('/home');
            }
          })();
        </script>
      </body>
    </html>
    ```
- **异常处理响应体**：
  - 发生任何错误（如 state 不匹配、用户取消、账号禁用、上游网络报错）时，同样返回轻量 HTML：
    ```html
    <!DOCTYPE html>
    <html>
      <body>
        <script>
          (function() {
            var payload = { type: 'QQ_AUTH_ERROR', code: '{{ERROR_CODE}}' };
            if (window.opener && window.opener !== window) {
              window.opener.postMessage(payload, window.location.origin);
              window.close();
            } else {
              window.location.replace('/login?error={{ERROR_CODE}}');
            }
          })();
        </script>
      </body>
    </html>
    ```

### 4. 账号模型与额度映射
- 沿用 Prisma `User` 与 `OAuthAccount` 模型，无须数据库结构迁移（No Schema Migration）；
- 新用户注册额度严格遵循常量 `REGISTERED_FREE_TOKENS`；
- 用户名生成复用 `generateOAuthUsername('qq', nickname)`。

---

## Testing Decisions

### 什么是好的测试（契约驱动与行为断言）
- 遵循 ADR-0003 与 ADR-0007「接口即测试面」原则，测试仅断言外部可见行为（HTTP 响应状态码、返回的 HTML 脚本内容、设置的 Cookie），不耦合内部具体实现。

### 测试接缝规划 (Testing Seams)

1. **核心服务端测试接缝（API Route Handler Seam）**：
   - 对应文件：`apps/web/src/app/api/auth/oauth/qq/callback/route.test.ts`
   - 测试范围：
     - 正向用例：使用合法的 `code` 和匹配的 `oauth_state` Cookie，模拟 QQ 互联接口返回，断言返回状态码 200、响应体为包含 `QQ_AUTH_SUCCESS` postMessage 的 HTML、正确写入 httpOnly `refreshToken` 摘要 Cookie 与 `auth_kind` Cookie，并正确创建/更新数据库记录。
     - 异常用例 1（State 不匹配）：断言返回包含 `oauth_state_mismatch` 错误通知的 HTML 响应。
     - 异常用例 2（无 Code 取消）：断言返回包含 `no_code` 错误通知的 HTML 响应。
     - 异常用例 3（账号已禁用）：已绑定的账号状态为 `disabled` 时，断言返回包含 `account_disabled` 错误通知的 HTML 响应，且不签发新会话。
     - 异常用例 4（上游接口异常）：QQ 接口故障抛错时，断言返回包含 `oauth_failed` 错误通知的 HTML 响应。

2. **前端交互测试接缝（Component Interaction Seam）**：
   - 测试范围：桌面端点击时调用 `window.open` 的参数契约，以及接收到合规 `postMessage` 事件时的路由跳转与 Toast 触发逻辑。

### 既有参考（Prior Art）
- 参照 `apps/web/src/app/api/auth/oauth/qq/callback/route.test.ts` 中的 Vitest 路由测试模式，扩展测试断言与 mock。

---

## Out of Scope

1. **QQ 账号解绑与绑定其他第三方平台**：已有正式账号在个人中心绑定/解绑 QQ 的交互在后续版本迭代，本期聚焦登录与一键静默建号主链路。
2. **QQ 互联 UnionID 跨应用体系打通**：暂不申请腾讯开发者主体多应用打通，采用单一 AppID 下的 OpenID 体系。
3. **微信公众号/微信移动端 OAuth 改造**：本期仅针对 QQ 互联链路落地，微信登录保持现状。

---

## Further Notes

- 生产环境发布时，需在云端运行环境（如 Vercel、Docker 或生产部署脚本）同步注入 `QQ_APP_ID`、`QQ_APP_SECRET` 及 `QQ_REDIRECT_URI` 环境变量。
- 生产环境部署完毕后，应在 PC 端（Chrome、Safari、Edge）及手机移动端分别使用真实 QQ 扫码或快捷授权完成人工全链路冒烟测试。
