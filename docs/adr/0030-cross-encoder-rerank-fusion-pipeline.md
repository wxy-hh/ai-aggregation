# 0030. Cross-Encoder 二次语义精排管道与全链路弹性容灾架构

* **状态**：已接受
* **日期**：2026-10-27
* **决策者**：AI 聚合平台工程团队
* **范围**：`@repo/providers`（Rerank 模块下沉与多供应方接口标准化）、`@repo/shared`（Rerank 全局配置与安全阈值收敛）、`apps/web`（知识库混合检索管道、多库聚合单次精排、检索调试台全链路可观测、主对话 Agent 检索工具联动）

---

## 背景

在平台现有的 RAG 混合检索架构中，已实现基于余弦相似度（Dense 向量路 Top-20）与 jieba 应用层分词 + PostgreSQL `ts_rank_cd`（Lexical 词法全文路 Top-20）的双路并行召回，并使用倒数排名融合算法（RRF, k=60）对结果进行排名合并。

然而，在真实生产场景中，单纯依赖无监督的 RRF 融合仍面临以下核心痛点：
1. **RRF 本质为无监督的位次倒数加权**：无法精确感知 Query 与切片文本之间的跨词深层语义交互，容易使带有常见关键词但语义弱相关的长尾切片挤入最终上下文；
2. **多库并发检索时跨库分数不可比**：主对话 Agent（`knowledge_search`）最多支持并发检索用户名下的 3 个知识库。若在单库各自做截断拼合，各库之间的粗排得分基准不一致，容易发生优质知识库的切片被低质库稀释；
3. **缺乏长尾噪音安全过滤机制**：当用户提问与知识库完全无关时，粗排仍会强行返回相似度较低的切片注入 Prompt，诱发大模型幻觉与答非所问；
4. **外部模型服务的依赖与可用性挑战**：Cross-Encoder（如硅基流动 `BAAI/bge-reranker-v2-m3`）为外部 HTTP 远程调用，受网络抖动、超时、配额耗尽等因素制约，必须具备零宕机、无感知的弹性降级防线；
5. **模块权责与复用性割裂**：原 Rerank 临时原型散落在 `apps/web` 内部，未下沉至 `@repo/providers`，导致其他 App（如 Worker 或独立服务）无法复用精排能力。

---

## 决策

### 1. 架构模块下沉：在 `@repo/providers` 建立标准化 Rerank 抽象

- **模块迁移与类型统一**：
  将 Rerank 抽象接口与实现从 `apps/web/src/lib/rag/rerank.ts` 下沉至 `@repo/providers/src/rerank.ts`（并由 `index.ts` 导出）：
  - `RerankResult`：携带 `{ index, relevanceScore, document? }`；
  - `RerankProvider`：定义通用的 `rerank(query, documents, topN?): Promise<RerankResult[]>` 契约；
  - `SiliconFlowRerankProvider`：基于硅基流动 `BAAI/bge-reranker-v2-m3` 端点的官方标准实现，集成 `AbortController` 超时保护与结构化日志（标记 `feature: 'rag-rerank'`）。
- **解耦与依赖注入**：支持注入自定义 `fetch`、`endpoint`、`model` 与 `timeoutMs`，保障单元测试 100% 免外部网络执行。

### 2. 检索管道编排：多库粗排召回 + 聚合候选集单次全局 Rerank

- **多库检索聚合时机**：
  在 `knowledge_search` Agent 工具与批量检索场景中：
  1. 并发调用的各知识库仅执行「稠密 + 词法 + RRF 粗排」，各自产出单库候选切片；
  2. 外层将各库候选切片汇总并去重；
  3. **单次统一精排**：仅发起 1 次远程 Rerank 请求对所有候选切片进行跨库综合交叉打分；
  4. 彻底解决跨库得分标尺不一致的难题，并将外部网络 I/O 次数严格收敛为 1 次，大幅降低网络开销与超时概率。

### 3. 候选池规模控制（Candidate Pool Cap）与成本控制

- **规模截断**：
  为避免一次性向 Rerank 模型提交过多切片导致 Payload 过大（Token 暴涨）或推理耗时飙升，在 `@repo/shared` 中设定候选池切片总数硬上限：
  - `maxCandidates = 30`：多库或单库送入 Rerank 的候选切片总数严格截断至粗排前 30 条；
  - 黄金平衡点：既能让足够的长尾候选参与交叉打分，又将单次 Rerank 耗时稳定在 150~300ms 最佳响应区间。

### 4. 相关性最低安全阈值（Score Cutoff）与长尾噪声过滤

- **安全过滤线**：
  在 `@repo/shared` 的 `RAG_RERANK_CONFIG` 中定义 `minRelevanceScore = 0.20`：
  - 经 Rerank 打分后，相关性得分低于 0.20 的候选切片直接物理剔除，避免将无关内容注入上下文；
  - **全员低分兜底**：若所有切片得分均低于 0.20，判定为“知识库未命中有效上下文”，向大模型返回明确未命中提示，杜绝大模型在无关切片上编造答案。

### 5. 生产默认开启与静默弹性容灾降级（Fail-open 回退）

- **默认开关策略**：
  将 `packages/shared/src/rag-config.ts` 中的 `RAG_RERANK_ENABLED` 默认值调整为 `true`，在配置有 `SILICONFLOW_API_KEY` 时全量生效；可通过环境变量 `RAG_RERANK_ENABLED=false` 随时一键旁路。
- **Fail-open 弹性容灾**：
  当 Rerank 服务发生网络超时（默认 8000ms）、HTTP 5xx、配额不足或无法访问时：
  1. 捕获错误并记录结构化告警日志（`level: 'warn', feature: 'rag-rerank', degradation: 'rrf-fallback'`）；
  2. 检索管道自动无缝降级回退至原 RRF 排名结果并按 topK 截取；
  3. 绝对不抛错阻断用户对话或检索流程，保障 RAG 主链路 99.99% 高可用。

### 6. 前端调试台全链路可观测与数据契约扩展

- **前端透明展示**：
  知识库工作台「检索调试台」（`RetrievalDebugger`）与 API 路由升级：
  - 卡片主分数显示 Rerank 相关性分（如 `0.923`），并标注原始 RRF 分与两路原始排名（Dense #1, Lexical #3）；
  - 耗时面板正式常态化展示 Rerank 阶段耗时；
  - 若触发弹性降级，以醒目黄色状态徽章提示 `[Rerank 降级为 RRF]`；
  - 标注低相关性过滤切片数量（如 `5 条切片通过重排（已过滤 2 条低相关切片）`）。

---

## 影响与收益 (Consequences)

### 正向收益
1. **语义精度大幅拉升**：Cross-Encoder 的端到端注意力打分解决了 RRF 无法感知专业术语精细交叉关系的缺陷，长尾无关切片被彻底压制；
2. **单次网络开销最佳**：多库聚合统一单次 Rerank 方案，将网络调用次数减少至原来的 1/3，网络延迟更可预测；
3. **架构整洁与单测解耦**：`@repo/providers` 正式收敛 Rerank 能力，单测可通过纯内存 Mock 独立运行；
4. **生产高可用防线完备**：Fail-open 降级机制确保外部 API 抖动不影响平台核心对话功能。

### 权衡与取舍 (Trade-offs)
- **外部 API 延迟增加**：开启 Rerank 后，知识库端到端检索耗时将增加约 150~300ms，但相较于大模型后续首字生成（TTFT 500~1500ms），此耗时增量完全在可接受区间；
- **API 成本**：增加了 Rerank 模型的 Token 消耗，但通过候选池截取 30 条与 `BAAI/bge-reranker-v2-m3` 的极低单价，成本增量微乎其微。

---

## 补充小节：精排政策收拢与模型响应防御 (ARCH-CK-01 补充)

* **日期**：2026-10-31
* **决策依据**：消除单库检索与 Agent 跨库检索双重维护导致的政策漂移，修补模型越界响应防御漏洞。

### 1. 政策统一收拢至 Deep Module
- 新增 `apps/web/src/lib/rag/rerank-policy.ts`，作为 CrossEncoderRerank 政策的单一事实源深模块：
  - 单库混合检索（`hybridRetrieval`）与 Agent 多库检索工具（`knowledge_search`）均委托 `applyCrossEncoderRerank` 执行精排；
  - 候选池截断（`maxCandidates: 30`）、相关性安全过滤（`minRelevanceScore: 0.20`）、降级标记与结构化日志（`feature: 'rag-rerank', degradation: 'rrf-fallback'`）由该模块统一处理。

### 2. 模型响应合法性防御拦截（防数据错配与越界）
- 严禁信任外部模型返回的数组下标。执行严格防御校验：
  - 若模型返回下标小于 0、大于等于候选池长度、非整数或包含重复下标，整份响应判定为不可信；
  - 废除旧代码中 `candidateList[res.index] ?? candidateList[0]` 静默使用首个切片替代的错误实现；
  - 判定为不可信响应后，触发标准 `RerankFallback` 降级，返回原 RRF 排名结果并标记 `isDegraded: true`。

### 3. RAG 传输契约与接口瘦身
- 数据传输模型统一下沉至 `@repo/shared/src/rag-retrieval.ts`，剥离底层数据库私有字段；
- `HybridRetrievalDeps` 与 `KnowledgeSearchDeps` 移除无生产实现的 `isRerankEnabledFn`（字段数 7 → 6），测试统一通过 `vi.stubEnv` 驱动。
