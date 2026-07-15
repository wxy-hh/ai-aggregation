# 统一额度计费改造验证报告

## 结论

部分验证通过。代码、数据库结构、定向计费测试、静态检查和生产构建均通过；全量 Vitest 的 100 项中 98 项通过，剩余 2 项是既有命理断言失败。真实供应商调用与 Cloudflare 网关部署尚未进行人工端到端验收，因此不能把外部运行时行为标记为完全验证。

## 验证命令和结果

| 验证项 | 命令或场景 | 结果 |
| --- | --- | --- |
| 新增计费定向测试 | `pnpm --filter @repo/web exec vitest run ...` | 7 个文件、14 项通过：Token、服务端音频时长、视频提示词、RTASR 建会话、锁定、结算与待补账。 |
| Web 类型检查 | `pnpm --filter @repo/web typecheck` | 通过 |
| RTASR Worker 类型检查 | `pnpm --filter @repo/worker-rtasr typecheck` | 通过 |
| 全仓静态检查 | `pnpm lint` | 通过（7 个任务） |
| Web 生产构建 | `pnpm --filter @repo/web build` | 通过 |
| 数据库迁移状态 | `pnpm --filter @repo/db exec prisma migrate status` | 8 份迁移均已应用，数据库最新 |
| 差异格式检查 | `git diff --check` | 通过 |
| 全量 Web 测试 | `pnpm --filter @repo/web test` | 98/100 通过；2 项既有命理测试失败，见下文。 |

## 自动化覆盖的关键行为

- 上传音频仅接受服务端解析的媒体时长，向上取整为 `audio_seconds`。
- 视频提示词优化对普通用户预留并以供应商真实 Token 结算；管理员免扣但保留实际用量。
- 实时语音会话仅在用户认证后创建预留；可用秒数决定网关会话上限。
- 首段实际 PCM 转发后将预留锁定为 `billing_pending`；最终秒数通过统一补账结算，零音频会话释放预留。
- 文字、音频时长、图片任务和视频任务分别汇总；媒体任务不折算进文本/语音额度环图。

## 构建告警

- Web 构建成功，但仍输出已有的 Browserslist 数据过期、Tailwind 类名歧义、ESLint Next.js 插件配置和 IndexedDB 静态生成告警。它们没有阻止编译或生成产物，也不改变本次计费逻辑。

## 未完成的人工验收

完成密钥轮换和部署后，需要实际验证：

1. 匿名用户从 3000、注册用户从 20000 开始，二者对同一模型调用按相同实际 Token / 音频秒数扣除。
2. 实时转写连接、主动结束、断网、达到秒数上限和上游异常时，`QuotaReservation` 与 `QuotaLedgerEntry` 均能正确结算或释放。
3. 讯飞、豆包等文本模型真实 usage 缺失时是否进入 `billing_pending`，后续对账能否完成。
4. 图片与视频生成成功后只增加独立任务次数，`QuotaAccount` 余额和 `settledUnits` 不变。

## 已知无关失败

- `src/app/api/destiny/_lib/bazi-chart.test.ts`：十神条目数断言期望 4、实际 10。
- `src/app/api/destiny/_lib/bazi-section-payload.test.ts`：缺少 `baziBasis` 时的命运报告回退断言失败。

两项失败不涉及额度账户、预留、流水、AI 用量记录或本次新增的 API 路由。
