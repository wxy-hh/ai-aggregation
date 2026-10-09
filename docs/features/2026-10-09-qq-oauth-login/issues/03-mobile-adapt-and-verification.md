# 03: 移动端自适应重定向与端到端回归验收 (Mobile Adapt & E2E Smoke Verification)

**What to build:**
移动端视口（或触屏设备）下点击 QQ 登录自动降级为全页重定向（`window.location.href`），回调页在检测到无 `window.opener` 时自动平滑替换到目标页，确保移动端窄屏交互丝滑；校验环境变量规范与配置检测接口；完成全量类型检查与单测套件验证。

**Blocked by:** 02: 登录页 PC 弹窗防拦截与跨窗口事件闭环

**Status:** closed

- [x] 移动端视口自动降级全页重定向（`window.location.href`）
- [x] 回调页无 opener 兜底直接 `window.location.replace`
- [x] `.env.local` 与 `.env.example` 规范为 `QQ_APP_ID` / `QQ_APP_SECRET` / `QQ_REDIRECT_URI`
- [x] 全局 TypeScript 类型检查 100% 通过（`tsc --noEmit` 零报错）
- [x] Web 端 114 个测试套件（903 个测试用例）全部绿色通过
