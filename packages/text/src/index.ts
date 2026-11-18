/**
 * 服务端文本预处理入口（仅服务端使用）
 *
 * - Tokenizer：索引/查询同构的应用层分词与失败策略。
 * - EmbeddingBatch：统一的向量化分批、顺序与观测政策。
 */
export {
  SegmentationUnavailableError,
  segmentForIndex,
  segmentForQuery,
} from './tokenizer';
export { embedText, embedTexts, type EmbedTextsOptions } from './embedding';
