/**
 * 引用预览的通用锚点类型。
 *
 * 同时服务于对话引用聚合与知识库文档预览抽屉，避免知识库组件反向依赖对话域。
 */

/** 匹配到的文档切片锚点 */
export interface MatchedCitationAnchor {
  chunkIndex: number;
  headingPath?: string | null;
  pageNumber?: number | null;
  score?: number;
}

/** 预览抽屉当前聚焦的锚点 */
export type FocusedCitationAnchor = Pick<
  MatchedCitationAnchor,
  'chunkIndex' | 'headingPath' | 'pageNumber'
>;
