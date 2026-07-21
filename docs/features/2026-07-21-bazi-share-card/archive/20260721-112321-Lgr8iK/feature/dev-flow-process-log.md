# dev-flow 过程记录 — 八字分享卡片（2026-07-21-bazi-share-card)

> 用户要求：本次除实现功能外，额外记录 dev-flow 工作流实现功能的过程与遇到的问题。
> 本文同时区分两类问题：**工作流本身的摩擦**（对 dev-flow 的改进输入）与**实现中的技术问题**（对后续开发的提醒）。

## 一、路线与时间线

| 阶段 | 动作 | 结果 |
|---|---|---|
| 分级 | /dev-task → dev-flow：M / local / `security`（敏感信息） | 路由 `risk-minimal-m` |
| 启动 | `start --dry-run` → dirty workspace（需求文档 untracked）→ `--existing-diff unrelated --reason` | `status.md` 创建，approval-pending |
| 风险卡 | `record-risk-evidence security`（隐私白名单设计） | inline 通过 |
| 实现前门禁 | `complete-gate security_review`（light） | 首次被 validator 拒绝，改写后通过 |
| 人工门禁 | `[HUMAN GATE:implementation_approval]` → 用户「继续吧」→ `confirm-human` | approved |
| 实现 | 2 个新依赖 + 5 个源文件 + 2 个测试文件 + shell 接入 | — |
| 静态验证 | vitest 12 例、typecheck、lint | 全绿（1 个 lint warning 顺手清理） |
| 行为验证 | Playwright 关键路径（恢复→入口→预览→导出→移动端） | 发现 3 个真问题并修复 |
| 审查 | code-review（light） | 2 MEDIUM 修复，PASS |
| 收尾 | verification 报告 → `complete-verification` → `feature-check --finish` | — |

## 二、dev-flow 工作流本身的摩擦点

1. **CLI 无裸名 shim**：文档示例写作 `dev-flow-status`，实际脚本只有 `dev-flow-status.mjs`，需 `node <path>` 调用。建议补无扩展名可执行 shim 或统一文档写法。
2. **dirty workspace 拦截合理但示例不足**：需求设计文档（用户事先编写、untracked）被 start 拦下，需 `--existing-diff unrelated --reason` 声明。机制正确（防止把已有业务改动偷渡进 normal 模式），但「需求文档属于输入材料」这一常见情形值得写进文档示例。
3. **security inline evidence 的措辞门槛**：首次 `complete-gate security_review --evidence-inline` 被 validator 拒绝——必须「写明适用鉴权矩阵/分支和验证结果」。本功能是非鉴权类 security（隐私泄露面），第一次措辞未点名矩阵而被拒；改写为「登录/鉴权/SSO 矩阵各分支均不触及 + 实际行为分支 + 验证结果」后通过。校验合理，但对非鉴权场景的推荐措辞可在 risk-gates.md 给个模板。
4. **HUMAN GATE 体验顺畅**：协议硬约束清晰（输出即停、原话留证），一次「继续吧」完成确认，无过度打扰。
5. **risk-minimal-m 量级合适**：M + light + 单风险标签的功能，只要求风险卡、实现前 security light、一次人工审批、code-review、行为验证与 feature-check，没有强制需求说明书/计划审查，流程负担与功能规模匹配。
6. **scaffold 资产命名兼容好**：`scaffold --asset code-review` 生成单日期文件名，与历史双日期兼容，无需手工猜测。

## 三、实现中的技术问题（按发现顺序）

1. **IndexedDB 种子 VersionError**：验证用 Dexie 注入历史记录时指定 `version: 1` 低于现存版本 10。修法：不指定版本打开现有库。*教训：给已存在的数据库写种子时不要假设版本号。*
2. **预览卡片底部裁切**：弹层预览只按宽度缩放，62vh 装不下 667px 卡片。修法：缩放比取 `min(宽比, 高比)`。
3. **测试假象——`wait_for` 自动滚动**：Playwright `waitFor` 会把元素滚动进视口，导致截图顶部裁切，一度误判为布局 bug。修法：测量完成前不渲染卡片（`previewScale` 初始 null)，顺带消除真实用户可见的瞬时溢出。*教训：截图类验证要先排除测试工具自身的滚动副作用。*
4. **最大坑——Radix Portal 挂载时序**：预览测量 `useEffect` 在 `open` 翻转后执行时，`ref` 恒为 null（Radix Portal 容器要第二个渲染周期才挂载），卡片永远卡骨架屏且无报错。用 console.log 埋点定位后改为 **callback ref 测量**。*教训：Portal 内的 DOM 测量不要用 effect+ref，用 callback ref。*
5. **html-to-image 误抓 SVG 内部 url()**：噪点 SVG data-URI 里的 `filter='url(#n)'` 被其 CSS 正则误识别为外部资源，每次导出发起一次 404 请求。修法：放弃 feTurbulence，离线生成 64×64 PNG 噪点（xorshift 确定性随机 + 两轮盒式模糊，52KB→6.8KB 迭代压缩）。*教训：交给 html-to-image 的样式里，任何 `url(...)` 子串都会被当作资源抓取，包括 data-URI 内容物。*
6. **五维区下方空洞**：导出图底部 CTA 与五维块之间留白过大。修法：五维块 `flex-1` 垂直居中 + 进度条 5px→6px。
7. **审查自发现**：两个新依赖静态打包进 destiny 主包（改动态 `import()`)；下载文件名未过滤非法字符（加 `sanitizeShareFileName` + 单测）。

## 四、对工作流的总评

门禁链条（风险卡 → 实现审批 → 静态验证 → 行为验证 → code-review → feature-check）在本功能上**拦到了真问题**：security 标签逼出的隐私白名单设计（数据构建层剥离，而非渲染层自觉）是整个功能最值得保留的决策；行为验证门禁逼出的浏览器实测则抓到了 Portal 时序与 404 两个单测完全覆盖不到的问题。流程成本（约 6 次 CLI 调用 + 一次人工确认）相对于一个 M 级带隐私敏感的功能是合理的。

主要改进期望：CLI 裸名 shim、非鉴权 security 的 inline evidence 措辞模板、dirty workspace 的「输入材料」示例。
