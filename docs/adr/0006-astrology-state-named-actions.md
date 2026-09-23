# 0006. 星座寰宇工作区数据字段只能经具名 Action 迁移

* **状态**：已接受
* **日期**：2026-09-24
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web` 星座寰宇模块状态层（`apps/web/src/stores/destiny-workspace-store.ts`、`apps/web/src/lib/astrology/`）

---

## 背景

架构审查（候选 9）发现，astrology 工作区的两个**数据字段**（`chartFacts` 真值、`interpretation` 解读层）由 lib 层 8 处裸 `setWorkspaceState('astrology', {...})` patch 字面量写入：

- 状态迁移规则散落在 `chart-request.ts` 各处——分区累计的「拒绝迟到分区」guard、「缺省字段回落」merge 语义以匿名函数式 patch 形式内联在流消费循环里；
- store 对数据字段没有任何具名写入接口，任何代码都可以塞入一个自相矛盾的 `interpretation`（如 `status: 'ready'` 但 `report: null`）；
- 夜幕主题的派生（手动偏好 + 全局明暗 → 昼夜）在 5 个消费点各自重复「订阅两个 store + 调 resolver」样板。

视图层 `useEffect` 偷写历史的问题已由 ADR-0005 同期的候选 6 消除（持久化回到 `astrologySession` 闭环），本次收口的是剩余的写入面。

---

## 决策

### 1. 数据字段只能经具名 Action 迁移

`destiny-workspace-store` 新增 7 个具名 action，收编 `chartFacts` / `interpretation` 的**全部生产写入路径**：

| Action | 语义 |
| --- | --- |
| `beginAstrologySession()` | 全新提交/真值重试：进入仪式态并重置解读为 pending |
| `beginAstrologyInterpretationRetry()` | 解读重试：仅解读层回 pending，真值锚点冻结 |
| `failAstrologySession(error, errorKind)` | 会话失败落档，解读层不动 |
| `applyAstrologyChartFacts(facts)` | 真值送达 |
| `applyAstrologyInterpretationSection(section)` | 分区累计（guard 与 merge 语义内收于 store） |
| `settleAstrologyInterpretation(next)` | 解读结论落定 |
| `restoreAstrologyWorkspace(payload)` | 历史恢复直达结果页 |

约定：此后生产代码不得再用通用 `setWorkspaceState` 写入 `chartFacts` / `interpretation` 两个字段（测试 setup 构造状态除外）；UI 状态字段（`step` / `entryView` / `formStep` / `fieldErrors` / `error`）继续走通用 `setWorkspaceState`。

类型层面不做 `Omit` 强制（泛型涟漪波及四个模块，收益不抵复杂度），靠本约定 + code review 维持。

### 2. 夜幕派生收编为单一 hook

`astrology-night-theme-store.ts` 导出 `useAstrologyNightResolved()` 派生 hook（内部订阅手动偏好 + 全局明暗后调纯函数 resolver），5 处消费样板（ritual / page-client / desktop-nav / mobile-header / mobile-bottom-nav）与 toggle 组件统一改用它。

---

## 后果

- **局部性**：`chartFacts` / `interpretation` 的状态迁移规则只存在于 store 定义处；「已降级后迟到分区不得覆盖结论」这类不变式有单一落脚点和专属测试（`destiny-workspace-store.test.ts`）。
- **接口即测试面**：7 个 action 的契约测试零 mock 直断言状态迁移；`chart-request.ts` 的流消费逻辑不再夹带状态迁移规则。
- **回潮防线**：新增数据字段写入路径时，先在 store 加具名 action，再调通用 patch 即视为违反本 ADR。
- 已知让步：通用 `setWorkspaceState` 在类型上仍能写数据字段（未做 `Omit` 收紧），约定依赖评审维持。
