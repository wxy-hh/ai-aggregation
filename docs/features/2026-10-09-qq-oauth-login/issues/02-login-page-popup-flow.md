# 02: 登录页 PC 弹窗防拦截与跨窗口事件闭环 (Desktop Popup & Cross-Window Lifecycle)

**What to build:**
PC 端登录页面在用户点击「QQ 登录」的首行同步以标准尺寸（720×550）居中弹出独立授权窗口，维持浏览器手势信任链（User Gesture Trust Chain），彻底免疫拦截；登录页注册全局 message 监听器，严格验证 event.origin，根据授权消息分别提示成功或错误 Toast，并平滑进入首页。

**Blocked by:** 01: 回调协议改造与弹窗通信协议支撑

**Status:** closed

- [x] PC 视口同步计算屏幕居中坐标呼出 `720×550` 弹窗
- [x] 挂载同源安全校验的 `message` 事件监听器
- [x] 监听 `QQ_AUTH_SUCCESS` 并自动路由跳转 `/home`
- [x] 监听 `QQ_AUTH_ERROR` 展示友好错误 Toast 并重置加载态
- [x] 组件卸载时自动解除事件监听
