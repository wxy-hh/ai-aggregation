# 0008. 第三方 OAuth 授权：PC 弹窗与 postMessage 跨窗口通信流

* **状态**：已接受
* **日期**：2026-10-09
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web/src/app/api/auth/oauth/**`、`apps/web/src/components/login/static-login-page.tsx`、`apps/web/src/lib/auth/oauth.ts`

---

## 背景

在接入真实 QQ 互联（OAuth 2.0）登录功能时，面临授权交互体验与平台兼容性的权衡：
1. **全页重定向体验割裂**：若直接在当前窗口将用户重定向至腾讯授权页，授权完成后再重定向回主站，PC 端用户体验有明显的跳出感与页面重新加载损耗。
2. **弹窗模式与浏览器防拦截冲突**：若采用异步发起 `window.open`，会被现代浏览器（Safari、Chrome 等）的安全机制静默拦截；且直接使用 HTTP 302 重定向会在固定尺寸的小弹窗内加载完整主页。
3. **跨端表现差异**：移动端屏幕空间狭小，弹窗行为在各类手机浏览器及 WebView（如微信内置浏览器）中极易退化或失效。

---

## 决策

### 1. 分端自适应交互：PC 端居中弹窗，移动端整页重定向
- **PC 端**：在用户点击「QQ 登录」的首行同步执行 `window.open`（尺寸 `720×550`），维持用户手势信任链（User Gesture Trust Chain），彻底规避弹窗拦截；
- **移动端**：自动识别并降级为整页重定向（`window.location.href`）。

### 2. 回调接口采用 HTML + postMessage 跨窗口通信协议
- 服务端完成凭证签发（设置 httpOnly `refreshToken` Cookie）后，不使用 HTTP 302，而是返回轻量级安全 HTML 响应；
- **弹窗分支**：若检测到 `window.opener`，使用 `window.opener.postMessage({ type: 'QQ_AUTH_SUCCESS' }, window.location.origin)` 通信并调用 `window.close()` 自动关闭小窗；
- **兜底分支**：若无 `window.opener`（移动端或直接访问），执行 `window.location.replace('/home')`；
- **异常分支**：授权取消或失败时，同样通过 `QQ_AUTH_ERROR` 消息通知父窗口并关闭弹窗，由主登录页统一呈现 Toast 错误提示，避免在弹窗内残留嵌套错误页。

### 3. 首次授权静默建号（Auto-Provisioning）
- 未关联已有账户的 QQ OpenID 首次登录时，自动实例化内部 `User` 与 `OAuthAccount`，赋予注册赠送额度并生成唯一用户名，保证零摩擦进入。

---

## 备选方案及否决理由

| 备选方案 | 否决理由 |
| --- | --- |
| 全端统一 HTTP 302 重定向 | PC 端交互有强烈的跳出与整页重载感，体验落后于主流 SaaS 产品 |
| 弹窗内直接 302 加载 `/home` | 会在 720×550 的小窗口内嵌套完整应用主页，背景主窗口无法感知登录态变化 |
| 首次登录强制关联已有账号 | 增加了极大的注册与转化门槛，背离第三方登录“一键即用”的核心价值 |
| iframe 内嵌 QQ 登录 | QQ 互联设置了 `X-Frame-Options: SAMEORIGIN`，第三方开发者无法通过 iframe 嵌入 |

---

## 后果

- **安全边界**：`postMessage` 通信必须严格限定目标 `targetOrigin` 为 `window.location.origin`，严禁使用通配符 `'*'`，防止敏感状态被第三方恶意页面窃听。
- **可测试性**：回调路由在单测中需针对 PC 弹窗（返回含有 postMessage 的 HTML）与错误分支分别进行契约断言。
