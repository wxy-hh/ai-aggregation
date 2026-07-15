# 回撤单元 — 跨模态单引用接力（标准 L）

> Feature：`2026-07-14-cross-modal-reference-relay`
> 依据：`初步实现计划.md`（T1–T13，2026-07-15 plan-review 修订版）
> 原则：每个单元可独立回撤、回撤后系统回到可用状态；纯新增文件直接删除，修改既有文件用 `git checkout -- <file>` 还原。

## 单元划分

### RU-01 共享引用协议类型（T1）
- **改动**：新增 `packages/shared/src/types/relay.ts`；`packages/shared/src/types/index.ts` 追加 `export * from './relay'`。
- **回撤步骤**：
  1. 删除 `packages/shared/src/types/relay.ts`
  2. `git checkout -- packages/shared/src/types/index.ts`
  3. `pnpm typecheck` 确认无引用残留
- **回撤后验证**：`pnpm typecheck` 全绿。
- **影响面**：无下游依赖时零影响。

### RU-02 接力持久化 Store（T2）
- **改动**：新增 `apps/web/src/stores/relay-store.ts`；`apps/web/src/stores/index.ts` 追加导出。
- **回撤步骤**：
  1. 删除 `apps/web/src/stores/relay-store.ts`
  2. `git checkout -- apps/web/src/stores/index.ts`
  3. `pnpm typecheck` 确认无引用残留
- **回撤后验证**：`pnpm typecheck` 全绿。
- **影响面**：RU-03/RU-04/RU-05 未接入前无引用方；若已接入，需先回撤依赖方。

### RU-03 目标能力注册 + 适配器 + 命理能力（T3/T4）
- **改动**：新增目录 `apps/web/src/lib/relay/`（`target-registry.ts`、`adapters.ts`、`types.ts`、`destiny-capabilities.ts`）。
- **回撤步骤**：删除 `apps/web/src/lib/relay/` 目录；`pnpm test` 确认对应单测随目录一并移除。
- **回撤后验证**：`pnpm typecheck` + `pnpm test` 全绿。
- **影响面**：无引用方时零影响。

### RU-04 共享接力 UI 组件（T5）
- **改动**：新增目录 `apps/web/src/components/relay/`（5 个组件，无 barrel）。
- **回撤步骤**：删除 `apps/web/src/components/relay/` 目录。
- **回撤后验证**：`pnpm typecheck` 全绿（确认无模块已 import）。
- **影响面**：RU-05 各模块接入前无引用方。

### RU-05 各业务模块接入（T6–T10，每模块独立单元）
| 单元 | 模块 | 改动文件 | 回撤步骤 |
|------|------|----------|----------|
| RU-05a | 对话（T6） | `components/chat/message-item.tsx`、`components/chat/comparison/focus-answer-pane.tsx`、`components/chat/comparison/comparison-input.tsx`、`app/chat/page.tsx`、`components/chat/chat-input.tsx`、`apps/web/src/stores/chat-store.ts` | `git checkout -- <6 个文件>`；`pnpm typecheck` + 手动打开 `/chat` 确认单聊/对比正常 |
| RU-05b | 图像（T7） | `app/image/page.tsx` | `git checkout -- app/image/page.tsx`；手动打开 `/image` 确认生成正常 |
| RU-05c | 语音（T8） | `components/voice/transcription-result.tsx`、`app/voice/page.tsx` | `git checkout -- <2 个文件>`；手动确认实时/上传转写正常 |
| RU-05d | 视频（T9） | `app/video/_components/preview-canvas.tsx`、`video-editor.tsx`、`config-panel.tsx`、`use-video-generation.ts` | `git checkout -- <4 个文件>`；手动确认视频生成正常。**注意**：`use-video-generation.ts` 与 RU-06 共享，若 RU-06 已合入，回撤 RU-05d 需一并回撤 RU-06 对该文件的改动 |
| RU-05e | 命理（T10） | `app/destiny/page.tsx`、`destiny-page-client.tsx`、`bazi-workspace.tsx`、`ziwei-workspace.tsx`、`qimen-workspace.tsx`、`qimen-input-form.tsx`、`reports/report-right-rail.tsx`、`chat/ai-copilot-conversation.tsx`、新增 `relay-method-picker.tsx` | `git checkout -- <8 个既有文件>` + 删除 `relay-method-picker.tsx`；手动确认三术数流程正常、AI 顾问快捷问题（queuedQuestion）行为未变 |

### RU-06 历史追溯（T11）
- **改动**：`apps/web/src/types/history.ts`、`apps/web/src/stores/history-store.ts`、`lib/utils/history-helpers.ts`、`app/video/_components/use-video-generation.ts`（视频落历史）、`components/history/*`、`app/history/page.tsx`。
- **回撤步骤**：`git checkout -- <上述文件>`；Dexie 中已写入的 video 类型历史项保留（`HistoryType` 还原后 video 项不再展示，但数据不损坏；如需清理可在 DevTools 删 `ai-history-db`）。
- **回撤后验证**：`pnpm typecheck` + 手动打开 `/history` 确认筛选/统计正常。
- **影响面**：`use-video-generation.ts` 与 RU-05d 共享，回撤顺序见下。

### RU-07 移动端/无障碍打磨（T12）
- **改动**：跨 `components/relay/*` 与各接入点的样式收尾。
- **回撤步骤**：随所属组件/模块单元一并回撤，不单独回撤。

### RU-08 验证资产（T13）
- **改动**：`docs/reviews/*manual-test.md`、`*verification.md`。
- **回撤步骤**：不适用（文档资产，无需回撤）。

## 回撤顺序约束

1. **共享文件 `use-video-generation.ts`** 被 RU-05d（视频接入）与 RU-06（历史落库）共同修改：
   - 只回撤 RU-06 → `git checkout` 会把 RU-05d 的接力预填一并还原 → **必须先回撤 RU-05d，或接受一并回撤**。
   - 推荐顺序：RU-06 → RU-05d（先撤历史落库，再撤接力接入），或两者同时回撤。
2. **组件/Store 依赖方向**：RU-05*（模块接入）依赖 RU-04（组件）依赖 RU-02/RU-03（Store/注册表）。回撤时按依赖反序：先 RU-05*，再 RU-04，最后 RU-02/RU-03/RU-01。
3. **数据残留**：`ai-relay-db`（Dexie）中的接力包在回撤代码后成为孤儿数据，不影响系统运行；如需清理，DevTools → Application → IndexedDB → 删除 `ai-relay-db`。

## 全量回撤（核选项）

```bash
git checkout -- packages/shared/src/types/index.ts apps/web/src/stores apps/web/src/lib apps/web/src/components/chat apps/web/src/components/voice apps/web/src/app apps/web/src/types apps/web/src/lib/utils
rm -rf packages/shared/src/types/relay.ts apps/web/src/components/relay apps/web/src/lib/relay
pnpm typecheck && pnpm test
```

仅在放弃整个特性时使用；正常按单元回撤即可。
