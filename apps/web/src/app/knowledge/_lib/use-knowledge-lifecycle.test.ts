import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useKnowledgeLifecycle,
  type KnowledgeApiClient,
} from './use-knowledge-lifecycle';
import type { KnowledgeBaseItem, DocumentItem } from './knowledge-lifecycle-rules';

describe('useKnowledgeLifecycle (TC02, TC03, TC04)', () => {
  const mockKb1: KnowledgeBaseItem = {
    id: 'kb-1',
    name: '知识库 1',
    description: '描述 1',
    status: 'ready',
    documentCount: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockKb2: KnowledgeBaseItem = {
    id: 'kb-2',
    name: '知识库 2',
    description: '描述 2',
    status: 'ready',
    documentCount: 1,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockKb3: KnowledgeBaseItem = {
    id: 'kb-3',
    name: '知识库 3',
    description: '描述 3',
    status: 'ready',
    documentCount: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockDocReady: DocumentItem = {
    id: 'doc-ready',
    name: '就绪文档.pdf',
    status: 'ready',
    version: 1,
    chunkCount: 10,
    errorMessage: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockDocProcessing: DocumentItem = {
    id: 'doc-processing',
    name: '处理中文档.docx',
    status: 'processing',
    version: 1,
    chunkCount: 0,
    errorMessage: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('TC02: 生命周期 Hook 状态与请求竞态阻断', () => {
    it('挂载时自动获取知识库列表并自愈选中第一项', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1, mockKb2]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      expect(result.current.loading).toBe(true);

      await act(async () => {
        await Promise.resolve();
      });

      expect(client.fetchKnowledgeBases).toHaveBeenCalledTimes(1);
      expect(result.current.loading).toBe(false);
      expect(result.current.selectedKbId).toBe('kb-1');
      expect(result.current.selectedKb).toEqual(mockKb1);
    });

    it('切换知识库时触发新知识库的文档加载', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1, mockKb2]),
        fetchDocuments: vi.fn().mockImplementation((kbId) => {
          if (kbId === 'kb-1') return Promise.resolve([mockDocReady]);
          if (kbId === 'kb-2') return Promise.resolve([mockDocProcessing]);
          return Promise.resolve([]);
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.selectedKbId).toBe('kb-1');
      expect(result.current.documents).toEqual([mockDocReady]);

      await act(async () => {
        result.current.setSelectedKbId('kb-2');
        await Promise.resolve();
      });

      expect(result.current.selectedKbId).toBe('kb-2');
      expect(client.fetchDocuments).toHaveBeenCalledWith('kb-2');
      expect(result.current.documents).toEqual([mockDocProcessing]);
    });

    it('慢速迟到响应被阻断丢弃，杜绝串库覆盖', async () => {
      let resolveKb1Docs!: (docs: DocumentItem[]) => void;
      const kb1DocsPromise = new Promise<DocumentItem[]>((resolve) => {
        resolveKb1Docs = resolve;
      });

      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1, mockKb2]),
        fetchDocuments: vi.fn().mockImplementation((kbId) => {
          if (kbId === 'kb-1') return kb1DocsPromise; // 慢速返回
          if (kbId === 'kb-2') return Promise.resolve([mockDocProcessing]); // 快速返回
          return Promise.resolve([]);
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      // 初次挂载加载 kb-1，此时请求处于 pending
      await act(async () => {
        await Promise.resolve();
      });

      // 用户立即切换到 kb-2
      await act(async () => {
        result.current.setSelectedKbId('kb-2');
        await Promise.resolve();
      });

      // kb-2 已就绪并展示
      expect(result.current.selectedKbId).toBe('kb-2');
      expect(result.current.documents).toEqual([mockDocProcessing]);

      // 此时 kb-1 的慢速响应终于到达
      await act(async () => {
        resolveKb1Docs([mockDocReady]);
        await Promise.resolve();
      });

      // 必须严格阻断：documents 仍然是 kb-2 的数据，不能被 kb-1 覆盖！
      expect(result.current.selectedKbId).toBe('kb-2');
      expect(result.current.documents).toEqual([mockDocProcessing]);
    });

    it('连续快速切换仅最终选中的知识库文档生效', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1, mockKb2, mockKb3]),
        fetchDocuments: vi.fn().mockImplementation((kbId) => {
          return Promise.resolve([{ ...mockDocReady, id: `doc-${kbId}` }]);
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        result.current.setSelectedKbId('kb-1');
        result.current.setSelectedKbId('kb-2');
        result.current.setSelectedKbId('kb-3');
        await Promise.resolve();
      });

      expect(result.current.selectedKbId).toBe('kb-3');
      expect(result.current.documents[0].id).toBe('doc-kb-3');
    });

    it('文档加载异常安全隔离，保持当前选区', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockRejectedValue(new Error('网络超时')),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.selectedKbId).toBe('kb-1');
      expect(result.current.docsLoading).toBe(false);
      expect(result.current.documents).toEqual([]);
    });
  });

  describe('TC03: 生命周期 Hook 定时轮询与受控终止', () => {
    it('存在处理中文档时 3 秒轮询拉取文档', async () => {
      let callCount = 0;
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([mockDocProcessing]);
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(callCount).toBe(1);
      expect(result.current.isPolling).toBe(true);

      // 推进 3000ms
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(callCount).toBe(2);
      expect(result.current.isPolling).toBe(true);
    });

    it('文档进入全终态后自动终止轮询定时器', async () => {
      let callCount = 0;
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve([mockDocProcessing]);
          return Promise.resolve([mockDocReady]); // 第 2 次变为终态
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(callCount).toBe(1);
      expect(result.current.isPolling).toBe(true);

      // 推进 3000ms 触发第 2 次
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(callCount).toBe(2);
      expect(result.current.isPolling).toBe(false);

      // 再次推进 3000ms，轮询已停止，不应发起第 3 次
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(callCount).toBe(2);
    });

    it('离开文档管理 Tab 立即销毁轮询定时器', async () => {
      let callCount = 0;
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([mockDocProcessing]);
        }),
      };

      const { result, rerender } = renderHook(
        ({ activeTab }) => useKnowledgeLifecycle({ activeTab, client }),
        { initialProps: { activeTab: 'documents' } }
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(callCount).toBe(1);
      expect(result.current.isPolling).toBe(true);

      // 切换 Tab 为 debugger
      rerender({ activeTab: 'debugger' });

      expect(result.current.isPolling).toBe(false);

      // 推进时间，不产生新请求
      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(callCount).toBe(1);
    });

    it('切回文档管理 Tab 时按需重新激活轮询', async () => {
      let callCount = 0;
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockImplementation(() => {
          callCount++;
          return Promise.resolve([mockDocProcessing]);
        }),
      };

      const { result, rerender } = renderHook(
        ({ activeTab }) => useKnowledgeLifecycle({ activeTab, client }),
        { initialProps: { activeTab: 'debugger' } }
      );

      await act(async () => {
        await Promise.resolve();
      });

      // 在 debugger Tab 不轮询
      expect(result.current.isPolling).toBe(false);

      // 切回 documents Tab
      rerender({ activeTab: 'documents' });

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);

      await act(async () => {
        vi.advanceTimersByTime(3000);
        await Promise.resolve();
      });

      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('切换到无未完结文档知识库时立即停止轮询', async () => {
      let callCount = 0;
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1, mockKb2]),
        fetchDocuments: vi.fn().mockImplementation((kbId) => {
          callCount++;
          if (kbId === 'kb-1') return Promise.resolve([mockDocProcessing]);
          return Promise.resolve([mockDocReady]);
        }),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(true);

      // 切换到 kb-2（无未完结文档）
      await act(async () => {
        result.current.setSelectedKbId('kb-2');
        await Promise.resolve();
      });

      expect(result.current.isPolling).toBe(false);
    });
  });

  describe('TC04: 操作触发后的定向刷新与局部 Patch', () => {
    it('上传成功触发文档列表与知识库列表双重刷新', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      client.fetchKnowledgeBases = vi.fn().mockResolvedValue([{ ...mockKb1, documentCount: 3 }]);
      client.fetchDocuments = vi.fn().mockResolvedValue([mockDocReady, mockDocProcessing]);

      await act(async () => {
        await result.current.handleFileUploadSuccess();
      });

      expect(client.fetchDocuments).toHaveBeenCalled();
      expect(client.fetchKnowledgeBases).toHaveBeenCalled();
      expect(result.current.selectedKb?.documentCount).toBe(3);
      expect(result.current.documents.length).toBe(2);
    });

    it('网页导入成功触发双重刷新', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      client.fetchKnowledgeBases = vi.fn().mockResolvedValue([{ ...mockKb1, documentCount: 3 }]);
      client.fetchDocuments = vi.fn().mockResolvedValue([mockDocReady, mockDocProcessing]);

      await act(async () => {
        await result.current.handleUrlImportSuccess();
      });

      expect(client.fetchDocuments).toHaveBeenCalled();
      expect(client.fetchKnowledgeBases).toHaveBeenCalled();
    });

    it('元数据修改仅前端局部更新且不发 HTTP 请求', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      const kbCallsBefore = (client.fetchKnowledgeBases as ReturnType<typeof vi.fn>).mock.calls.length;
      const docCallsBefore = (client.fetchDocuments as ReturnType<typeof vi.fn>).mock.calls.length;

      act(() => {
        result.current.handleMetadataSuccess({
          id: 'doc-ready',
          tags: ['新标签', '技术文档'],
        });
      });

      expect((client.fetchKnowledgeBases as ReturnType<typeof vi.fn>).mock.calls.length).toBe(kbCallsBefore);
      expect((client.fetchDocuments as ReturnType<typeof vi.fn>).mock.calls.length).toBe(docCallsBefore);
      expect(result.current.documents[0].tags).toEqual(['新标签', '技术文档']);
    });

    it('新建知识库成功重载列表并自动选中新项', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      const newKb: KnowledgeBaseItem = {
        id: 'new-kb-id',
        name: '新建知识库',
        description: null,
        status: 'ready',
        documentCount: 0,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      };

      client.fetchKnowledgeBases = vi.fn().mockResolvedValue([mockKb1, newKb]);
      client.fetchDocuments = vi.fn().mockResolvedValue([]);

      await act(async () => {
        await result.current.handleCreateKbSuccess('new-kb-id');
      });

      expect(result.current.selectedKbId).toBe('new-kb-id');
      expect(result.current.selectedKb?.name).toBe('新建知识库');
    });

    it('全局刷新重载知识库与选中文档', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      client.fetchKnowledgeBases = vi.fn().mockResolvedValue([mockKb1]);
      client.fetchDocuments = vi.fn().mockResolvedValue([mockDocReady]);

      await act(async () => {
        await result.current.refreshAll();
      });

      expect(client.fetchKnowledgeBases).toHaveBeenCalledTimes(1);
      expect(client.fetchDocuments).toHaveBeenCalledTimes(1);
    });

    it('局部刷新仅重载当前知识库文档', async () => {
      const client: KnowledgeApiClient = {
        fetchKnowledgeBases: vi.fn().mockResolvedValue([mockKb1]),
        fetchDocuments: vi.fn().mockResolvedValue([mockDocReady]),
      };

      const { result } = renderHook(() =>
        useKnowledgeLifecycle({ activeTab: 'documents', client })
      );

      await act(async () => {
        await Promise.resolve();
      });

      const kbCallsBefore = (client.fetchKnowledgeBases as ReturnType<typeof vi.fn>).mock.calls.length;

      await act(async () => {
        await result.current.refreshCurrentDocs();
      });

      expect((client.fetchKnowledgeBases as ReturnType<typeof vi.fn>).mock.calls.length).toBe(kbCallsBefore);
      expect(client.fetchDocuments).toHaveBeenCalledWith('kb-1');
    });
  });
});
