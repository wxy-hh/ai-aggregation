# 统一额度计费最终代码审查报告

## 结论

通过。未发现 Critical 或 Important 级计费缺口；此前发现的请求重放扣费绕过、待补账无真实数据入口、遗留请求次数配额和前端旧错误码均已修复。

## 输入资产

- 需求与计划：`docs/features/2026-07-14-unified-billing/初步实现计划.md`
- 状态台账：`docs/features/2026-07-14-unified-billing/status.md`
- 回撤清单：`docs/features/2026-07-14-unified-billing/rollback-units.md`
- 基线：`c58c259838f7d8a0d55ef6e9d49751d1bf330cb9`
- 审查范围：统一账本、全部 Web/Worker AI 调用入口、个人中心用量汇总、数据库迁移与内部对账接口。
- 审查规则：项目 `code-review` 引用的 `.Codex/skills/requesting-code-review/SKILL.md` 不存在，已按同项目 `.agents/skills/requesting-code-review` 的同等规则执行。

## 严重问题（Critical）

无。

## 重要问题（Important）

无。

## 次要问题（Minor）

### 1. 重建后的默认测试用户需要显式设置种子密码

位置：`packages/db/src/seed.ts`

本地数据库已按用户授权从零重建；`pnpm db:seed` 因未配置 `SEED_ADMIN_PASSWORD` 未创建默认管理员和测试用户。匿名登录仍会自行创建匿名账户，不影响计费链路。若需要预置管理员，部署或本地运行 seed 前应提供该环境变量。

## 需求覆盖

- 匿名用户初始 10000、注册用户初始 20000：已覆盖。开户路径创建对应 `QuotaAccount`，`isAnonymous` 未参与预留、结算、释放或补账判断。
- 管理员无限且免扣：已覆盖。管理员跳过额度预留，但仍保存文本、音频和媒体用量统计。
- 文本、命理、简历和语音翻译按实际 Token：已覆盖。供应商 usage 直接结算；缺 usage 不用字符估算扣费，而是保留为待补账。
- 语音转写按真实计费单位：已覆盖。上传转写用服务端解析音频秒数；实时会话由网关实际转发秒数结算。
- 图片和视频只按成功任务次数：已覆盖。媒体任务写入 `image_task` / `video_task`，`quotaUnits` 为 0，不进入文本/语音余额。
- 对话过程中额度耗尽：已覆盖。请求先预留输入和允许的输出上限；供应商实际值超过预留时不静默超扣，转入待补账。
- 重复和并发请求：已覆盖。预留的执行权通过条件更新原子领取；重复请求返回处理中或已处理冲突，供应商不会被再次调用。
- 待补账闭环：已覆盖。Worker 自动结算已保存真实用量；受内部密钥保护的回填接口可登记无法自动取得的供应商真实用量与凭据。
- 迁移可重放：已覆盖。已在空库重放全部 11 条迁移并通过 `prisma migrate status`。

## 验证证据

- `pnpm db:generate`：通过。
- `prisma migrate reset --force --skip-seed`：全部 11 条迁移从零重放成功。
- `prisma migrate deploy`、`prisma migrate status`：通过，数据库 Schema 已同步。
- `pnpm --filter @repo/web typecheck`：通过。
- `pnpm --filter @repo/worker typecheck`：通过。
- `pnpm lint`：通过。
- `pnpm --filter @repo/web exec vitest run`：106/108 通过；2 个失败均在既有命理测试，非本次计费范围。
- 计费聚焦 Vitest：8 个文件、21 项全部通过，覆盖执行权领取、重放拒绝、回填、过期处理和前端错误码。
- 真实 PostgreSQL 账本演练：通过并已清理临时用户；并发预留只成功一笔、并发领取只成功一笔，待补账结算后账户为 `available=52`、`reserved=0`、`settled=48`。
- `git diff --check`：通过。

## 回撤完整性

当前工作区尚未创建提交；可按 `rollback-units.md` 中的基线 SHA 与任务文件范围生成反向 patch。数据库已按用户明确授权采用最新 Schema 重建，因此不提供旧字段兼容或旧数据回填路径。
