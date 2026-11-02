import * as React from 'react';
import { fetchWithAuth } from '@/lib/api/client';
import {
  resolveSelectedKbId,
  shouldPollDocuments,
  resolveRefreshScope,
  type KnowledgeBaseItem,
  type DocumentItem,
  type RefreshScopePlan,
} from './knowledge-lifecycle-rules';

export interface KnowledgeApiClient {
  fetchKnowledgeBases: () => Promise<KnowledgeBaseItem[]>;
  fetchDocuments: (kbId: string) => Promise<DocumentItem[]>;
}

const defaultApiClient: KnowledgeApiClient = {
  fetchKnowledgeBases: async () => {
    const res = await fetchWithAuth('/api/knowledge-bases');
    const json = await res.json();
    if (res.ok && json.success) {
      return json.data?.knowledgeBases || [];
    }
    throw new Error(json.error || json.message || '加载知识库列表失败');
  },
  fetchDocuments: async (kbId: string) => {
    const res = await fetchWithAuth(`/api/knowledge-bases/${kbId}/documents`);
    const json = await res.json();
    if (res.ok && json.success) {
      return json.data?.documents || [];
    }
    throw new Error(json.error || json.message || '加载文档列表失败');
  },
};

export interface UseKnowledgeLifecycleOptions {
  activeTab: string;
  pollingIntervalMs?: number;
  client?: KnowledgeApiClient;
}

export interface UseKnowledgeLifecycleResult {
  knowledgeBases: KnowledgeBaseItem[];
  selectedKbId: string | null;
  selectedKb: KnowledgeBaseItem | undefined;
  documents: DocumentItem[];
  loading: boolean;
  docsLoading: boolean;
  isPolling: boolean;

  setSelectedKbId: (id: string | null) => void;
  refreshAll: () => Promise<void>;
  refreshCurrentDocs: () => Promise<void>;
  handleFileUploadSuccess: () => Promise<void>;
  handleUrlImportSuccess: () => Promise<void>;
  handleMetadataSuccess: (patch: { id: string; tags: string[] }) => void;
  handleCreateKbSuccess: (newKbId: string) => Promise<void>;
}

export function useKnowledgeLifecycle(
  options: UseKnowledgeLifecycleOptions
): UseKnowledgeLifecycleResult {
  const { activeTab, pollingIntervalMs = 3000, client = defaultApiClient } = options;

  const [knowledgeBases, setKnowledgeBases] = React.useState<KnowledgeBaseItem[]>([]);
  const [selectedKbId, setSelectedKbIdState] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [documents, setDocuments] = React.useState<DocumentItem[]>([]);
  const [docsLoading, setDocsLoading] = React.useState(false);

  // 竞态保护与同步引用
  const selectedKbIdRef = React.useRef<string | null>(selectedKbId);
  selectedKbIdRef.current = selectedKbId;

  const docRequestIdRef = React.useRef(0);

  // 安全切换选中知识库
  const setSelectedKbId = React.useCallback((id: string | null) => {
    selectedKbIdRef.current = id;
    setSelectedKbIdState(id);
  }, []);

  // 加载文档列表（具备请求序号与竞态阻断）
  const loadDocuments = React.useCallback(
    async (kbId: string, options?: { silent?: boolean }) => {
      const requestId = ++docRequestIdRef.current;
      if (!options?.silent) {
        setDocsLoading(true);
      }
      try {
        const docs = await client.fetchDocuments(kbId);
        // 竞态检查：若当前请求并非最新请求，或知识库已切换，静默丢弃
        if (docRequestIdRef.current !== requestId || selectedKbIdRef.current !== kbId) {
          return;
        }
        setDocuments(docs);
      } catch (err) {
        if (docRequestIdRef.current !== requestId || selectedKbIdRef.current !== kbId) {
          return;
        }
        console.error('[knowledge-lifecycle] 加载文档列表失败:', err);
      } finally {
        if (docRequestIdRef.current === requestId && selectedKbIdRef.current === kbId) {
          if (!options?.silent) {
            setDocsLoading(false);
          }
        }
      }
    },
    [client]
  );

  // 加载知识库列表并自愈选择
  const loadKnowledgeBases = React.useCallback(
    async (preferredSelectId?: string) => {
      try {
        setLoading(true);
        const list = await client.fetchKnowledgeBases();
        setKnowledgeBases(list);

        // 自愈裁决当前选区
        const nextSelectedId = resolveSelectedKbId(
          preferredSelectId ?? selectedKbIdRef.current,
          list
        );
        setSelectedKbId(nextSelectedId);
      } catch (err) {
        console.error('[knowledge-lifecycle] 加载知识库列表失败:', err);
      } finally {
        setLoading(false);
      }
    },
    [client, setSelectedKbId]
  );

  // 首屏自动加载知识库列表
  React.useEffect(() => {
    loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  // 当选中知识库或活跃 Tab 变化时加载文档
  React.useEffect(() => {
    if (selectedKbId && activeTab === 'documents') {
      loadDocuments(selectedKbId);
    } else if (!selectedKbId) {
      setDocuments([]);
    }
  }, [selectedKbId, activeTab, loadDocuments]);

  // 受控轻量轮询判定与调度
  const isPolling = shouldPollDocuments({
    selectedKbId,
    activeTab,
    documents,
  });

  React.useEffect(() => {
    if (!isPolling || !selectedKbId) return;

    const currentKbId = selectedKbId;
    const timer = setInterval(() => {
      loadDocuments(currentKbId, { silent: true });
    }, pollingIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }, [isPolling, selectedKbId, pollingIntervalMs, loadDocuments]);

  // 统一由纯规则规划器 (KnowledgeRefreshScope) 驱动定向刷新执行
  const applyRefreshPlan = React.useCallback(
    async (plan: RefreshScopePlan) => {
      const promises: Promise<unknown>[] = [];
      const targetId = plan.targetKbId ?? selectedKbIdRef.current;

      if (plan.reloadKnowledgeBases) {
        promises.push(loadKnowledgeBases(targetId ?? undefined));
      }
      if (plan.reloadDocuments && targetId) {
        promises.push(loadDocuments(targetId));
      }
      if (plan.patchLocalDocument) {
        const { id, tags } = plan.patchLocalDocument;
        if (tags) {
          setDocuments((prev) =>
            prev.map((d) => (d.id === id ? { ...d, tags } : d))
          );
        }
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }
    },
    [loadKnowledgeBases, loadDocuments]
  );

  // 定向刷新动作
  const handleFileUploadSuccess = React.useCallback(async () => {
    const plan = resolveRefreshScope('file_upload_success', {
      currentSelectedKbId: selectedKbIdRef.current,
    });
    await applyRefreshPlan(plan);
  }, [applyRefreshPlan]);

  const handleUrlImportSuccess = React.useCallback(async () => {
    const plan = resolveRefreshScope('url_import_success', {
      currentSelectedKbId: selectedKbIdRef.current,
    });
    await applyRefreshPlan(plan);
  }, [applyRefreshPlan]);

  const handleMetadataSuccess = React.useCallback(
    (patch: { id: string; tags: string[] }) => {
      const plan = resolveRefreshScope('metadata_update_success', {
        currentSelectedKbId: selectedKbIdRef.current,
        metadataPatch: patch,
      });
      applyRefreshPlan(plan);
    },
    [applyRefreshPlan]
  );

  const handleCreateKbSuccess = React.useCallback(
    async (newKbId: string) => {
      const plan = resolveRefreshScope('kb_create_success', {
        currentSelectedKbId: selectedKbIdRef.current,
        newKbId,
      });
      await applyRefreshPlan(plan);
    },
    [applyRefreshPlan]
  );

  const refreshAll = React.useCallback(async () => {
    const plan = resolveRefreshScope('top_refresh_click', {
      currentSelectedKbId: selectedKbIdRef.current,
    });
    await applyRefreshPlan(plan);
  }, [applyRefreshPlan]);

  const refreshCurrentDocs = React.useCallback(async () => {
    const plan = resolveRefreshScope('tab_doc_refresh_click', {
      currentSelectedKbId: selectedKbIdRef.current,
    });
    await applyRefreshPlan(plan);
  }, [applyRefreshPlan]);

  const selectedKb = React.useMemo(() => {
    return knowledgeBases.find((kb) => kb.id === selectedKbId);
  }, [knowledgeBases, selectedKbId]);

  return {
    knowledgeBases,
    selectedKbId,
    selectedKb,
    documents,
    loading,
    docsLoading,
    isPolling,

    setSelectedKbId,
    refreshAll,
    refreshCurrentDocs,
    handleFileUploadSuccess,
    handleUrlImportSuccess,
    handleMetadataSuccess,
    handleCreateKbSuccess,
  };
}
