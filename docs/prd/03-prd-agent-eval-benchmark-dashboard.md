# 03 · PRD：真实模型端到端 Eval 评测基准与观测看板 (Real-model E2E Eval Benchmark & Dashboard)

> **实现阶段**：Stage 3（数据飞轮与质量底线：建立真实 Benchmark 与消融看板）  
> **文档版本**：v1.0 | **创建日期**：2026-11-18 | **规划状态**：待实现 (Ready for Dev)  
> **关联模块**：`tooling/eval/`、`apps/web/src/app/admin/eval/`、`packages/shared/src/eval/`、`packages/db/prisma/schema.prisma`

---

## 1. 业务痛点与底层思考

### 1.1 现状与痛点
- **“伪造的确定性”**：当前仓库中 `tooling/scripts/eval-rag.mts` 里的结论（如“引用准确率 100% / 注入防御 100%”）存在写死断言；`agent-baseline.eval.test.ts` 则对 Vercel AI SDK 进行了 `vi.mock`。
- **面试最大破绽**：大厂技术负责人看候选人项目，最敏锐的一点就是**模型评测是否真实**。LLM 本质是概率系统，不存在全场景 100% 成功。宣称 100% 会被认定为不懂工业级系统，而拿出一份**真实的、带有 88% 成功率与消融对比（Ablation Study）的评测报告**，是建立高级工程师信任感的最强证据。
- **缺乏观测看板**：每次改动 Prompt、升级切片算法或调整多步 Agent 循环参数时，没有数字反馈，无法形成“修改 → 度量 → 调优”的数据飞轮。

### 1.2 设计原则（张一鸣思维操作系统）
1. **数据高于直觉**：Prompt 好不好、Rerank 该不该开，不要靠“我感觉效果更好”，要靠 40 个标准用例的胜率和成本曲线说话。
2. **坦诚面对负结果**：在真实测试集上，混合检索在某些短查询下召回未提升、甚至增加 200ms 延迟，这类真实的负结果和瓶颈分析，比造假的高分更有工程价值。
3. **消除评测摩擦力**：评测必须能一键执行（CLI 命令与后台 UI 按钮一键跑），结果自动落盘结构化数据库并在界面可视化。

---

## 2. 核心功能与产品形态

### 2.1 交互表现与界面架构

在系统管理后台新增 `/admin/eval`（或开发调试入口 `/eval`）：

```
+-----------------------------------------------------------------------------------------+
|  [Agent & RAG 评测中枢 (Eval Benchmark)]                     [ 立即触发评测 (Run Eval) ] |
+-----------------------------------------------------------------------------------------+
|  总测试用例: 40 个  |  总体通过率: 87.5%  |  单任务平均耗时: 3.42s  |  单任务平均 Token: 1,842   |
+-----------------------------------------------------------------------------------------+
| [模型横向横评对比]                                                                       |
|  模型名称           | 任务完成率  | 工具调用精准度 | 恶意注入拦截率 | 平均耗时 | 单任务成本 (¥)   |
|  DeepSeek-Flash    |    92.5%    |     95.0%      |     100.0%     |  2.8s    |    ¥0.0042      |
|  Doubao-Pro        |    85.0%    |     90.0%      |      95.0%     |  3.1s    |    ¥0.0078      |
|  Xunfei-Spark      |    77.5%    |     82.5%      |      90.0%     |  4.5s    |    ¥0.0065      |
+-----------------------------------------------------------------------------------------+
| [消融实验分析 (Ablation Matrix)]                                                        |
|  实验组别           | 召回 MRR@5  | 引用契约合规率 | 幻觉率 (Hallucination) | 判定与思考       |
|  全量混合检索+Rerank |    0.84     |     96.0%      |         2.1%           | 质量最优，适合长文 |
|  纯向量检索 (HNSW)   |    0.72     |     88.0%      |         5.4%           | 时延低 180ms    |
|  未带反思节点 (No-Eval)| 75.0%通过率 |     80.0%      |        12.0%           | 动作变形率高     |
+-----------------------------------------------------------------------------------------+
| [失败用例下钻详情 (Case Inspector)]                                                      |
|  用例 #014 [越权文件读取测试]  -> 状态: PASS (HMAC 成功拦截)                             |
|  用例 #027 [多跳长文推理检索]  -> 状态: FAIL (切片检索遗漏第 3 段核心约束)                  |
|  --> 点击展开完整 Trace: [User Prompt] -> [Planner DAG] -> [RRF Top5] -> [Model Output] |
+-----------------------------------------------------------------------------------------+
```

1. **多模型矩阵对比**：一键切换或多选模型（DeepSeek、豆包、星火），同一测试集同台竞技。
2. **消融实验看板**：对比“开/关 Rerank”、“开/关 反思节点”、“开/关 计划拆解”的边际效益。
3. **Trace 链路下钻**：任何失败用例均可一键展开其执行细节（输入、中间规划、召回的 chunk 片段、工具入参与错误回显）。
4. **一键生成评测报告**：支持导出带时间戳与 commit hash 的标准 Markdown / PDF 报告。

---

## 3. 技术方案与测试集体系

### 3.1 标准基准测试集设计（40 题标准库）

测试集存放在 `packages/shared/src/eval/datasets/agent-benchmark-v1.json`：

| 分类 | 题量 | 考察能力与边界 | 评估方法 (Grading) |
| :--- | :--- | :--- | :--- |
| **A. 规划与多步拆解** | 10 | 复杂任务拆解（如跨文档信息提炼、格式化输出） | 步骤完整度、终态产物结构检查 (Deterministic Schema Check) |
| **B. 工具调用精准度** | 10 | 正确选择内置工具/参数格式约束/无参跳过 | 工具命中率 (Tool Precision) + 参数 Zod 校验通过率 |
| **C. 安全与权限拦截** | 10 | Prompt 越权注入、SSRF 恶意 URL、敏感写操作审批拦截 | 是否成功触发拒答 / 是否成功生成 HMAC 待审批状态 (Security Guard) |
| **D. RAG 检索与拒答** | 10 | 专有知识召回、无关问题拒答、知识冲突溯源 | 引用锚点 `[^n]` 存在性、事实核查一致性 (LLM-as-a-Judge + 断言) |

### 3.2 评测引擎执行流（`tooling/eval/runner.ts`）

1. **真实调用**：直接调用配置了真实 API Key 的模型客户端，取消所有网络 Mock。
2. **双重裁决机制**：
   - **硬断言 (Rule-based)**：状态码是否匹配、JSON Schema 是否合规、工具调用名是否精准、敏感 URL 是否被阻止（耗时为 0，成本为 0）。
   - **模型评判 (LLM-as-a-Judge)**：针对长文本生成与总结回答，由指定裁判模型（如 `deepseek-chat`）根据评分准则（Rubric）打出 1~5 分，评判忠实度（Faithfulness）与回答相关度（Relevance）。
3. **成本与耗时精确统计**：记录每次测试的输入/输出 Token、Prompt 缓存命中情况、端到端耗时与估算金钱成本。

### 3.3 数据持久化模型（`packages/db/prisma/schema.prisma`）

```prisma
model AgentEvalRun {
  id              String            @id @default(uuid())
  datasetVersion  String            @map("dataset_version") // 如 "agent-benchmark-v1"
  modelProvider   String            @map("model_provider")  // "deepseek" | "doubao"
  modelId         String            @map("model_id")
  configSnapshot  Json              @map("config_snapshot") // 记录 Rerank 开关、MaxSteps 等参数
  totalCases      Int               @map("total_cases")
  passedCases     Int               @map("passed_cases")
  passRate        Float             @map("pass_rate")
  avgLatencyMs    Float             @map("avg_latency_ms")
  totalCostRmb    Float             @map("total_cost_rmb")
  caseResults     AgentEvalCaseResult[]
  createdAt       DateTime          @default(now()) @map("created_at")

  @@map("agent_eval_runs")
}

model AgentEvalCaseResult {
  id          String       @id @default(uuid())
  evalRunId   String       @map("eval_run_id")
  caseId      String       @map("case_id")
  category    String       // "planning" | "tools" | "security" | "rag"
  passed      Boolean
  score       Float        @default(0)
  latencyMs   Int          @map("latency_ms")
  tokensUsed  Int          @map("tokens_used")
  errorDetail String?      @map("error_detail")
  traceData   Json?        @map("trace_data")

  evalRun     AgentEvalRun @relation(fields: [evalRunId], references: [id], onDelete: Cascade)

  @@index([evalRunId, category])
  @@map("agent_eval_case_results")
}
```

---

## 4. 接口与执行命令

1. **CLI 命令行执行**（支持 CI/本地终端）：
   ```bash
   # 全量运行基准测试
   pnpm eval:agent --model=deepseek-flash
   # 对比消融实验
   pnpm eval:agent:ablation
   ```
2. **API 接口**：
   - `POST /api/admin/eval/run`：触发异步评测任务，返回 `evalRunId`。
   - `GET /api/admin/eval/reports`：获取历史评测趋势折线数据。
   - `GET /api/admin/eval/reports/:id`：获取单次详细矩阵与失败用例。

---

## 5. 验收标准与求职转化口径

| 检查项 | 验证方式 | 预期目标 |
| :--- | :--- | :--- |
| **真实无 Mock** | 运行 `pnpm eval:agent` 时断网，测试应报网络异常而非绿灯 | 证明使用的是真实外部模型调用，而非假脚本 |
| **负结果可分析** | 查看导出的评测报告 | 清晰呈现失败 case 的原因（例如：短查询时 Rerank 导致检索截断），并附带修复建议 |
| **可视化看板交互** | 访问 `/admin/eval` | 页面流畅渲染多模型指标柱状图、耗时分布与下钻 Trace，支持筛选失败类别 |
| **面试回答赋能** | 面试官问“你做过哪些 Agent 质量保障？” | 掏出该看板截图与消融数据，讲解 40 题设计准则与消融结论 |
