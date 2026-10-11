# 0003: SSR 应用的水合假死与就绪锚点判定

在 Next.js / React 19 应用中，DOM 结构出现并不代表 JavaScript 事件监听器已挂载完毕。必须通过具体的业务元素交互就绪态作为锚点，严禁依赖 networkidle。

## Status
active

## Evidence
Next.js 开发环境下存在持续的 HMR（热模块替换）长轮询和 SSE 流式连接，导致网络层永远不会达到真正的 idle 状态。若设置 networkidle，测试脚本将无休止超时。若水合尚未完成就盲目执行点击，会导致点击事件静默失效，引发虚假报警。

## Implications
- 页面加载等待必须使用具体的语义元素（如 `[data-testid="chat-input"]` 或非禁用的按钮）。
- 结合 AuthGuard 的加载闸门状态，确保客户端挂载完成后再触发用户操作。
