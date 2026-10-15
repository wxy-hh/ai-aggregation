# 01: 回调协议改造与弹窗通信协议支撑 (Callback HTML/postMessage & Error Contract)

**What to build:**
服务端 OAuth 回调接口在完成凭证校验与 JWT / RefreshToken 签发后，从原有的纯 HTTP 302 重定向升级为安全的轻量 HTML 响应体；授权成功时向父窗口派发 `QQ_AUTH_SUCCESS` postMessage 并调用 `window.close()`，移动端无 opener 时自动 fallback 到 `/home`；异常时统一派发 `QQ_AUTH_ERROR` 并关闭弹窗；单测 100% 覆盖。

**Blocked by:** None (can start immediately)

**Status:** closed

- [x] 回调接口返回 `Content-Type: text/html; charset=utf-8` 的轻量 HTML
- [x] 成功时向 `window.opener` 投递 `QQ_AUTH_SUCCESS` 并自动关闭弹窗
- [x] 异常（`oauth_state_mismatch`、`no_code`、`account_disabled`、`oauth_failed`）统一投递 `QQ_AUTH_ERROR`
- [x] 兼容 QQ Token 的 JSON 与 URLSearchParams 格式
- [x] QQ 头像自动升级为 HTTPS 协议
- [x] Vitest 路由测试 100% 覆盖上述分支
