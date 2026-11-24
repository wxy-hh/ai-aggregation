# 0063. 真实模型端到端 Eval 评测基准与消融观测看板架构

* **状态**：已接受
* **日期**：2026-11-23
* **范围**：`tooling/eval/`、`packages/shared/src/eval/`、`packages/db/prisma/schema.prisma`、`apps/web/src/app/admin/eval/`
* **相关**：`docs/prd/03-prd-agent-eval-benchmark-dashboard.md`、ADR-0037、ADR-0039、ADR-0041、`GLOSSARY.md`「评测基准与观测」章节

---

## 背景与问题

根据 `docs/prd/03-prd-agent-eval-benchmark-dashboard.md`（Stage 3），平台亟需建立真实的 Agent & RAG 端到端评测基准与消融观测看板。现状核查表明：
- `tooling/scripts/eval-rag.mts` 中检索层（Embedding / PGVector / BM25 / RRF / Rerank）为真实调用，但生成层（如引用准确率、拒答率、注入拦截率）存在由模板字符串构造并模拟计算的问题，缺少模型端到端生成的客观检验；
- `apps/web/src/eval/agent-baseline.eval.test.ts` 则对 Vercel AI SDK 进行了 `vi.mock` 网络劫持；
- 缺乏基于真实概率系统的标准评测集与数据驱动的消融对比看板（Ablation Study）。

在架构落地时，需厘清执行调度、裁决机制、数据隔离、批次对照及运行分级等核心边界。2026-11-23 经 `/grill-with-docs` 拷问达成全量架构共识，特制定本决策。

---

## 决策

### 1. 采用 CLI 驱动落盘 + Web 后台只读分析看板架构

- **CLI 评测执行中枢**：评测引擎作为独立的 Node/CLI 脚本（`tooling/eval/`，由终端或 CI 驱动 `pnpm eval:agent`），具备独立的进程生命周期，不受 Next.js App Router 的 HTTP 超时（如 Vercel 15s~60s 限制、网关断连）约束；执行完成后将数据结构化持久化至数据库（`AgentEvalRun` / `AgentEvalCaseResult`），并自动生成包含 commit hash 与配置的 Markdown 报告。
- **后台纯分析看板**：`/admin/eval` 专注于**只读呈现**历史趋势折线、多模型横评矩阵、消融实验对比及失败用例的完整 Trace 链路下钻；后台不提供长链接阻塞式运行，但提供 CLI 命令一键复制与最新运行指引。
- **取代的设想**：取消在 Next.js API 路由中通过裸 Promise 跑后台长任务的脆弱设计；在本阶段暂不引入复杂的 BullMQ 外部 Worker 依赖，最大化降低架构复杂度与运维成本。
- **代价**：管理员无法直接在浏览器点击即刻完成 40 题全量跑批，必须在开发终端或 CI 运行 CLI。

### 2. 确定性断言（DeterministicGrading）主导，LLM-as-a-Judge 解耦为可选插件

- **客观硬断言为第一公民**：
  - **A 规划组 (10题)**：断言产出合法的 `AgentPlan` 结构、检查点状态机推进与终态交付；
  - **B 工具组 (10题)**：断言工具名称精确命中、输入入参通过 Zod Schema 校验、无参跳过；
  - **C 安全组 (10题)**：断言触发敏感写操作审批拦截（生成合规 `ApprovalToken`）、SSRF 出站阻止或安全拒答；
  - **D 检索组 (10题)**：断言金标切片召回命中、`[^n]` 引用锚点存在性与有效性、无关问题命中合规拒答口径。
- **裁决机制收益与边界**：
  - 确定性裁决保证**在给定相同 Agent 执行轨迹时判分逻辑绝对一致**。裁决逻辑本身只执行静态代码校验，不发起额外的二次裁判模型调用，裁决计算开销极低；
  - 但真实模型在端到端调用时由于温度采样、检索召回波动与外部网络状态，结果仍存在自然概率波动，不将其误述为端到端输出完全静态；仅在 `--dry-run` 模拟回放下承诺端到端全量结果完全复现。
- **LLM-as-a-Judge 解耦**：默认评测模式不发起裁判模型调用，通过率由客观断言产出；仅当显式指定 `--judge-model=<model>` 时，才在收尾阶段对长文本回答的相关度与忠实度进行主观打分，避免单一裁判模型（如 `deepseek-chat`）对同门模型产生偏好偏差（Self-Preference Bias）。

### 3. 测试集自包含（SelfContainedBenchmark）与沙箱评测切片

- **自包含测试集**：测试集全量收敛于 `packages/shared/src/eval/datasets/`，包含 40 道标准题用例定义及一套微型的标准评测语料切片（覆盖 D 组 10 道题目）。
- **专用评测租户与沙箱知识库**：评测引擎启动时通过隔离的评测系统账号（专用测试租户）幂等执行种子数据脚本（Seed），导入标识为 `EVAL_BENCHMARK_KB` 的专用沙箱知识库切片与向量；`runAgent` 的 RAG 工具在租户隔离边界下检索该沙箱知识库，评测结束后提供幂等复用或安全清理机制。彻底杜绝旧脚本中硬编码本地 UUID（如 `cmvko6gtv0001zik7ablohyi4`）的隐患。
- **收益**：任何开发者 clone 本代码库，或在 CI 无状态容器中，均可一键拉起并顺利跑通，评测语料基准严格可控。

### 4. 引入 `suiteId` 批次与消融对照严格约束

在 Prisma `AgentEvalRun` 模型中显式扩展实验批次聚合字段：
- `suiteId String? @map("suite_id")`：实验套件批次唯一标识，同一次消融实验或横评共享同一 `suiteId`；
- `runType String @default("standalone") @map("run_type")`：运行类型（`"standalone"` 独立单次 / `"ablation"` 消融实验 / `"cross_model"` 多模型横评）；
- `experimentLabel String? @map("experiment_label")`：实验组可读标签（如 `"基准全量组"`、`"混合检索无Rerank"`、`"无 Evaluator 质检"`）；
- `commitHash String? @map("commit_hash")`：记录触发评测时的 Git commit sha，确保历史可追溯。

**消融对照有效性约束**：
同一次消融实验套件（同一 `suiteId`）必须严格锁定：
1. 测试集版本与语料版本指纹完全一致；
2. 被测模型（`modelProvider`、`modelId`）必须完全一致；
3. 超时时间与公共系统环境完全一致；
4. 仅允许单向切换消融变量（如 `rerankEnabled: false` 或 `evaluatorEnabled: false`，对照组为：基准全量组 vs 混合检索无 Rerank 组 vs 无质检反思组），严禁跨模型混合对比伪造消融结论。

### 5. 三档运行模式分级（`--dry-run`、`--smoke`、`--full`）

为消除评测的高昂摩擦力，评测运行器提供三档模式：
1. `--dry-run`：使用内置的固定模拟样本与干跑数据流，不消耗真实 API Key 与网络，毫秒级完成，专门用于 CI 自动化流水线、单元测试与断言/持久化逻辑回归。在此模式下保证 100% 确定性与可复现性。
2. `--smoke`：真实调用模型 API，但仅跑 4 道精选代表题（A/B/C/D 各 1 题），约 20~30 秒，用于快速验证 API Key 连通性与 Agent 编排闭环。
3. `--full`（默认）：全量执行 40 题标准基准库（消融为 40 题 × 3 组），需显式携带确认标志（防意外扣费），产出最终持久化大盘数据与 Markdown 报告。

### 6. 整合复用既有资产，收敛为单一事实源评测中枢

- **复用既有成熟内核**：评测引擎统一收敛于 `tooling/eval/`（数据层收敛于 `packages/shared/src/eval/`），直接复用 `runAgent` 真实智能体执行流、`collectChatEvents` SSE 流式解析管道，以及既有的 MRR / Hit@K 检索指标计算算法。
- **吸纳真实检索样本并消灭模板假数据**：将 `tooling/scripts/eval-rag.mts` 中的高质量检索测试用例提纯并吸纳合并进标准 40 题的 D 组（RAG 组），用真实的端到端模型输出全面替代原脚本中的模板字符串模拟计算；
- **旧脚本退役与统一入口**：将原 `tooling/scripts/eval-rag.mts` 标记为废弃（Deprecated）或平滑重定向至新 CLI 入口 `pnpm eval:agent`，杜绝产生第三套平行评测体系，确立代码库中统一、权威的 Agent 质量基准。

---

## 明确不做

1. 不在 Web 后台提供直接拉起耗时数分钟的在线评测任务，避免长请求超时与未捕获的内存泄漏。
2. 默认模式下不强制发起针对文本回答的 LLM 主观裁判二次调用。
3. 不依赖任何现存本地开发数据库中的特定知识库或用户历史数据。
4. 不在仓库内长期保留结论互斥的两套平行 RAG 评测入口。
