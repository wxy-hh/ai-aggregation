# 0004. 提供方客户端异常统一收敛（ProviderClientError 接缝隔离）

* **状态**：已接受
* **日期**：2026-09-23
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` chat 路由 ports & adapters（`apps/web/src/app/api/chat/_lib/`）

---

## 背景

`apps/web/src/app/api/chat/_lib/` 采用 ports & adapters（六边形）架构：
- `chat-handler.ts`：通用控制器，负责鉴权、限流、配额管理与统一错误映射；
- `adapters/{doubao,xunfei,generic}.ts`：厂商适配器，负责将具体厂商的输入输出及协议转化为统一格式；
- `types.ts`：定义 `ChatProviderAdapter` 端口接口与上下文类型。

重构前，`chat-handler.ts` 直接通过 `import { DoubaoFileNotReadyError, DoubaoApiError } from './adapters/doubao'` 引入了豆包适配器的两个私有异常类，并在 `handleError` 中以专门的 `instanceof` 分支映射 HTTP 响应。

这种做法破坏了 ports & adapters 的接缝隔离边界：厂商专有异常穿透了接缝，使得通用控制器与具体厂商适配器产生紧耦合。每接入一个新厂商或厂商适配器调整异常细节，都必须修改通用控制器，违背了开闭原则（OCP）。

---

## 决策

在 `apps/web/src/app/api/chat/_lib/types.ts` 中定义统一异常类型 `ProviderClientError`，作为适配器向 `chat-handler` 传递客户端错误的唯一标准异常契约：

```ts
/**
 * 提供方客户端错误 — 适配器 → handler 的唯一异常类型。
 * 各适配器必须把厂商私有错误翻译为此类型（status 为透传给客户端的 HTTP 状态码，
 * message 为用户可读中文文案）；handler 只认此类型，不 import 任何厂商私有异常。
 */
export class ProviderClientError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ProviderClientError';
  }
}
```

配套改动与规范如下：

1. **统一异常职责**：
   - `status`：由适配器明确指定的 HTTP 状态码，`chat-handler` 直接透传给客户端；
   - `message`：用户可读的中文错误文案；
2. **适配器负责翻译**：各适配器内部必须将底层或厂商私有异常统一转换为 `ProviderClientError`，禁止向外抛出厂商私有异常类型；
3. **豆包适配器收敛**：
   - 文件未就绪：抛出 `new ProviderClientError(400, '文件正在处理中，请稍后重试。大文件需要更长的处理时间。')`；
   - 上游 API 返回错误：抛出 `new ProviderClientError(response.status, friendlyError)`；
   - 上游响应体为空：抛出 `new ProviderClientError(500, '上游未返回响应体')`；
   - 彻底删除 `DoubaoFileNotReadyError` 与 `DoubaoApiError` 两个私有异常类定义；
4. **控制器收口映射**：
   - `chat-handler.ts` 移除豆包私有异常的 import，仅引入 `ProviderClientError`；
   - `handleError` 中原有豆包异常分支合并为单个 `ProviderClientError` 分支：
     ```ts
     // 提供方客户端错误（适配器已翻译为统一异常，status 直透客户端）
     if (error instanceof ProviderClientError) {
       return jsonResponse({ error: error.message, errorId }, error.status);
     }
     ```
   - 保持在计费错误之后、通用 Error 之前的匹配优先级。

---

## 备选方案及否决理由

1. **方案 A：保留私有类并在 handler 中不断追加分支**：
   - *否决理由*：每新增一个模型厂商或异常类型，都需要在通用控制器增加 import 和 `instanceof` 分支，接缝泄漏依旧存在，持续破坏开闭原则。
2. **方案 B：在 `@repo/providers` 跨端 SDK 层定义统一异常**：
   - *否决理由*：`@repo/providers` 是无 HTTP 语义的底层通用 SDK 封装，不应感知 Web 层的 HTTP 状态码与路由控制器生命周期；该异常契约严格属于 Web 层 chat 路由 ports 边界，定义在 `_lib/types.ts` 最契合其职责范围。

---

## 后果

### 正面收益

- **接缝彻底干净**：`chat-handler.ts` 完全解耦具体厂商异常，不再 import 任何厂商私有类；
- **符合开闭原则**：新增或调整厂商适配器的错误处理时，改动严格闭环在适配器内部；
- **行为完全等价**：HTTP 状态码与用户可读错误提示逐条保持一致，不改变现有接口行为。

### 已知遗留与后续规划

- `xunfei.ts` 与 `generic.ts` 适配器流前错误目前仍抛出通用 `Error`，依赖 `chat-handler.ts` 的消息嗅探分支（`Missing` → 500、`timeout` → 504、`fetch` → 503）兜底；
- 本次重构遵循行为等价与渐进演进原则，未改动其他适配器；后续可逐步将讯飞与通用适配器的流前异常收敛至 `ProviderClientError`，进一步精简 handler 内部的字符串嗅探逻辑。
