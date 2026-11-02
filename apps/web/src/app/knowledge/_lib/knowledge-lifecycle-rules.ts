/**
 * 知识库工作区生命周期纯函数规则集 (KnowledgeLifecycleRules)
 * 对应 ARCH-CK-06 / TC01
 */

export type DocumentProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface DocumentStatusLike {
  id: string;
  status: DocumentProcessingStatus;
}

export interface KnowledgeBaseLike {
  id: string;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string | null;
  status: string;
  documentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  status: DocumentProcessingStatus;
  version: number;
  chunkCount: number;
  errorMessage: string | null;
  sourceType?: 'file' | 'url' | 'chat_artifact' | string;
  sourceUrl?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 知识库选择自愈裁决 (KnowledgeSelectionPruning)
 * 1. 若 list 为空，返回 null；
 * 2. 若当前 selectedId 仍在 list 中，保持不变；
 * 3. 若 selectedId 为空或不在 list 中，自愈回退为 list[0].id。
 */
export function resolveSelectedKbId(
  currentSelectedId: string | null,
  list: KnowledgeBaseLike[]
): string | null {
  if (!list || list.length === 0) {
    return null;
  }
  if (currentSelectedId && list.some((item) => item.id === currentSelectedId)) {
    return currentSelectedId;
  }
  return list[0].id;
}

/**
 * 文档终态判定 (isAllDocumentsTerminal)
 * 文档列表中所有项均为 ready 或 failed 时返回 true；空列表视为终态。
 */
export function isAllDocumentsTerminal(documents: DocumentStatusLike[]): boolean {
  if (!documents || documents.length === 0) {
    return true;
  }
  return documents.every(
    (doc) => doc.status === 'ready' || doc.status === 'failed'
  );
}

/**
 * 文档轮询激活判定 (DocumentPollingPolicy)
 * 当且仅当：
 * - 存在有效选中的知识库 (selectedKbId != null)
 * - 当前处于文档管理 Tab (activeTab === 'documents')
 * - 文档列表中存在未进入终态的项 (!isAllDocumentsTerminal)
 */
export function shouldPollDocuments(params: {
  selectedKbId: string | null;
  activeTab: string;
  documents: DocumentStatusLike[];
}): boolean {
  const { selectedKbId, activeTab, documents } = params;
  if (!selectedKbId) return false;
  if (activeTab !== 'documents') return false;
  return !isAllDocumentsTerminal(documents);
}

/**
 * 定向刷新规划 (KnowledgeRefreshScope)
 */
export type RefreshActionType =
  | 'file_upload_success'
  | 'url_import_success'
  | 'metadata_update_success'
  | 'kb_create_success'
  | 'top_refresh_click'
  | 'tab_doc_refresh_click';

export interface RefreshScopePlan {
  reloadKnowledgeBases: boolean;
  reloadDocuments: boolean;
  targetKbId?: string;
  patchLocalDocument?: { id: string; tags?: string[] };
}

export function resolveRefreshScope(
  action: RefreshActionType,
  context: {
    currentSelectedKbId: string | null;
    newKbId?: string;
    metadataPatch?: { id: string; tags: string[] };
  }
): RefreshScopePlan {
  switch (action) {
    case 'file_upload_success':
    case 'url_import_success':
      return {
        reloadKnowledgeBases: true,
        reloadDocuments: true,
      };

    case 'metadata_update_success':
      return {
        reloadKnowledgeBases: false,
        reloadDocuments: false,
        patchLocalDocument: context.metadataPatch,
      };

    case 'kb_create_success':
      return {
        reloadKnowledgeBases: true,
        reloadDocuments: false,
        targetKbId: context.newKbId,
      };

    case 'top_refresh_click':
      return {
        reloadKnowledgeBases: true,
        reloadDocuments: true,
      };

    case 'tab_doc_refresh_click':
      return {
        reloadKnowledgeBases: false,
        reloadDocuments: true,
      };

    default:
      return {
        reloadKnowledgeBases: false,
        reloadDocuments: false,
      };
  }
}
