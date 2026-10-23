/**
 * RAG Rerank 二次精排深模块 (Pluggable Rerank Stage)
 *
 * 核心设计契约：
 * 1. 通用 RerankProvider 接口：
 *    - 契约方法：rerank(query: string, documents: string[], topN?: number): Promise<RerankResult[]>
 *    - 输出：按 relevanceScore 降序排列的精排切片位次与得分。
 * 2. 硅基流动 Provider 实现 (SiliconFlowRerankProvider)：
 *    - 模型：BAAI/bge-reranker-v2-m3
 *    - 端点：https://api.siliconflow.cn/v1/rerank
 *    - 密钥：复用 process.env.SILICONFLOW_API_KEY，支持依赖注入。
 * 3. 用量与成本观测：
 *    - 结构化日志打点：feature='rag-rerank'，记录候选数、耗时、模型及 Token 用量，不扣除用户额度。
 * 4. 健壮性与超时控制：
 *    - 支持 AbortController 超时熔断与网络异常防护，为上层混合检索平滑降级奠定基础。
 */

import { logger } from '@repo/logger';
import { RAG_RERANK_CONFIG } from '@repo/shared';

/**
 * 单条精排打分结果
 */
export interface RerankResult {
  /** 对应传入 documents 数组的下标索引 (0-based) */
  index: number;
  /** 相关性得分（越高越相关） */
  relevanceScore: number;
  /** 切片原始文本（可选） */
  document?: string;
}

/**
 * Rerank Provider 通用抽象接口
 */
export interface RerankProvider {
  readonly name: string;
  readonly model: string;

  /**
   * 对候选切片文本进行相关性重排打分
   *
   * @param query 检索查询词
   * @param documents 候选切片文本数组
   * @param topN 最多返回的精排数量（缺省为全部候选数量）
   * @returns 按 relevanceScore 从高到低排序的结果列表
   */
  rerank(query: string, documents: string[], topN?: number): Promise<RerankResult[]>;
}

/**
 * 硅基流动 Rerank Provider 配置选项
 */
export interface SiliconFlowRerankOptions {
  /** 接口调用密钥（默认读取环境变量 SILICONFLOW_API_KEY） */
  apiKey?: string;
  /** 接口端点（默认使用官方端点） */
  endpoint?: string;
  /** 使用的模型标识符 */
  model?: string;
  /** 超时毫秒数 */
  timeoutMs?: number;
  /** 自定义 fetch 实现（便于单测注入与 Mock） */
  fetchFn?: typeof fetch;
}

/**
 * 硅基流动原生 API 响应类型定义
 */
interface SiliconFlowRerankApiResponse {
  id?: string;
  results?: Array<{
    index: number;
    relevance_score: number;
    document?: { text?: string } | string;
  }>;
  usage?: {
    total_tokens?: number;
    prompt_tokens?: number;
  };
  message?: string;
  error?: string | { message?: string };
}

/**
 * 硅基流动 Rerank Provider 实现
 * 调用 BAAI/bge-reranker-v2-m3 模型
 */
export class SiliconFlowRerankProvider implements RerankProvider {
  public readonly name = 'siliconflow';
  public readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options: SiliconFlowRerankOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SILICONFLOW_API_KEY ?? '';
    this.endpoint = options.endpoint ?? RAG_RERANK_CONFIG.endpoint;
    this.model = options.model ?? RAG_RERANK_CONFIG.model;
    this.timeoutMs = options.timeoutMs ?? RAG_RERANK_CONFIG.timeoutMs;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async rerank(
    query: string,
    documents: string[],
    topN?: number
  ): Promise<RerankResult[]> {
    // 1. 空输入短路处理：无候选文本时直接返回空，避免无效网络 I/O
    if (!documents || documents.length === 0) {
      return [];
    }

    if (!query || !query.trim()) {
      return documents.map((_, index) => ({
        index,
        relevanceScore: 0,
      }));
    }

    // 2. 检查密钥配置
    if (!this.apiKey || !this.apiKey.trim()) {
      throw new Error('未配置 SILICONFLOW_API_KEY，无法调用硅基流动 Rerank 服务');
    }

    const actualTopN = topN !== undefined && topN > 0 ? Math.min(topN, documents.length) : documents.length;
    const startTime = performance.now();

    // 3. 构建超时控制器
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          query: query.trim(),
          documents,
          top_n: actualTopN,
          return_documents: false,
        }),
        signal: controller.signal,
      });

      const durationMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          errorBody = '无法读取响应文本';
        }
        throw new Error(
          `硅基流动 Rerank 接口返回错误 (${response.status}): ${errorBody}`
        );
      }

      const json = (await response.json()) as SiliconFlowRerankApiResponse;
      const rawResults = json.results ?? [];

      // 4. 解析结果并做降序重排（确保高分在前）
      const sortedResults: RerankResult[] = rawResults
        .map((r) => ({
          index: r.index,
          relevanceScore: typeof r.relevance_score === 'number' ? r.relevance_score : 0,
        }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, actualTopN);

      // 5. 记录用量与成本观测结构化日志（标记 feature: 'rag-rerank'，不扣减用户配额）
      logger.info('Rerank 二次精排执行完成', {
        feature: 'rag-rerank',
        model: this.model,
        candidateCount: documents.length,
        topN: actualTopN,
        durationMs,
        tokens: json.usage?.total_tokens ?? 0,
        promptTokens: json.usage?.prompt_tokens,
      });

      return sortedResults;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - startTime);

      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(
          `硅基流动 Rerank 请求超时 (${this.timeoutMs}ms 超时中断)`
        );
      }

      logger.warn('硅基流动 Rerank 请求异常', {
        feature: 'rag-rerank',
        model: this.model,
        candidateCount: documents.length,
        durationMs,
        error: err instanceof Error ? err.message : String(err),
      });

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
