import { describe, it, expect } from 'vitest';
import {
  resolveSelectedKbId,
  isAllDocumentsTerminal,
  shouldPollDocuments,
  resolveRefreshScope,
  type DocumentStatusLike,
  type KnowledgeBaseLike,
} from './knowledge-lifecycle-rules';

describe('knowledge-lifecycle-rules (TC01)', () => {
  describe('resolveSelectedKbId', () => {
    const kbs: KnowledgeBaseLike[] = [
      { id: 'kb-1' },
      { id: 'kb-2' },
    ];

    it('保持当前选中的有效知识库', () => {
      const selected = resolveSelectedKbId('kb-2', kbs);
      expect(selected).toBe('kb-2');
    });

    it('当前选择不在列表中时回退选中首项', () => {
      const selected = resolveSelectedKbId('kb-999', kbs);
      expect(selected).toBe('kb-1');
    });

    it('当前选择为空时回退选中首项', () => {
      const selected = resolveSelectedKbId(null, [{ id: 'kb-1' }]);
      expect(selected).toBe('kb-1');
    });

    it('列表为空时返回 null', () => {
      const selected = resolveSelectedKbId('kb-1', []);
      expect(selected).toBeNull();
    });
  });

  describe('isAllDocumentsTerminal', () => {
    it('包含 ready 与 failed 时判定为终态', () => {
      const docs: DocumentStatusLike[] = [
        { id: 'd-1', status: 'ready' },
        { id: 'd-2', status: 'failed' },
      ];
      expect(isAllDocumentsTerminal(docs)).toBe(true);
    });

    it('包含 pending 或 processing 时判定为非终态', () => {
      const withPending: DocumentStatusLike[] = [
        { id: 'd-1', status: 'ready' },
        { id: 'd-2', status: 'pending' },
      ];
      const withProcessing: DocumentStatusLike[] = [
        { id: 'd-1', status: 'ready' },
        { id: 'd-2', status: 'processing' },
      ];
      expect(isAllDocumentsTerminal(withPending)).toBe(false);
      expect(isAllDocumentsTerminal(withProcessing)).toBe(false);
    });

    it('空列表判定为终态', () => {
      expect(isAllDocumentsTerminal([])).toBe(true);
    });
  });

  describe('shouldPollDocuments', () => {
    const processingDocs: DocumentStatusLike[] = [
      { id: 'd-1', status: 'ready' },
      { id: 'd-2', status: 'processing' },
    ];
    const readyDocs: DocumentStatusLike[] = [
      { id: 'd-1', status: 'ready' },
      { id: 'd-2', status: 'failed' },
    ];

    it('文档管理 Tab 且有处理中文档时激活轮询', () => {
      const shouldPoll = shouldPollDocuments({
        selectedKbId: 'kb-1',
        activeTab: 'documents',
        documents: processingDocs,
      });
      expect(shouldPoll).toBe(true);
    });

    it('检索调试或 FAQ Tab 时禁止轮询', () => {
      expect(
        shouldPollDocuments({
          selectedKbId: 'kb-1',
          activeTab: 'debugger',
          documents: processingDocs,
        })
      ).toBe(false);

      expect(
        shouldPollDocuments({
          selectedKbId: 'kb-1',
          activeTab: 'faqs',
          documents: processingDocs,
        })
      ).toBe(false);
    });

    it('文档全终态时禁止轮询', () => {
      const shouldPoll = shouldPollDocuments({
        selectedKbId: 'kb-1',
        activeTab: 'documents',
        documents: readyDocs,
      });
      expect(shouldPoll).toBe(false);
    });

    it('无有效选中知识库时禁止轮询', () => {
      const shouldPoll = shouldPollDocuments({
        selectedKbId: null,
        activeTab: 'documents',
        documents: processingDocs,
      });
      expect(shouldPoll).toBe(false);
    });
  });

  describe('resolveRefreshScope', () => {
    it('文件上传或网页导入规划双端重载', () => {
      const uploadPlan = resolveRefreshScope('file_upload_success', {
        currentSelectedKbId: 'kb-1',
      });
      expect(uploadPlan).toEqual({
        reloadKnowledgeBases: true,
        reloadDocuments: true,
      });

      const importPlan = resolveRefreshScope('url_import_success', {
        currentSelectedKbId: 'kb-1',
      });
      expect(importPlan).toEqual({
        reloadKnowledgeBases: true,
        reloadDocuments: true,
      });
    });

    it('元数据更新规划局部内存 patch', () => {
      const plan = resolveRefreshScope('metadata_update_success', {
        currentSelectedKbId: 'kb-1',
        metadataPatch: { id: 'doc-1', tags: ['tag1'] },
      });
      expect(plan).toEqual({
        reloadKnowledgeBases: false,
        reloadDocuments: false,
        patchLocalDocument: { id: 'doc-1', tags: ['tag1'] },
      });
    });

    it('新建知识库规划列表重载与选中切换', () => {
      const plan = resolveRefreshScope('kb_create_success', {
        currentSelectedKbId: 'kb-1',
        newKbId: 'new-kb-1',
      });
      expect(plan).toEqual({
        reloadKnowledgeBases: true,
        reloadDocuments: false,
        targetKbId: 'new-kb-1',
      });
    });

    it('顶部全局刷新与文档局部刷新范围规划', () => {
      const topRefreshPlan = resolveRefreshScope('top_refresh_click', {
        currentSelectedKbId: 'kb-1',
      });
      expect(topRefreshPlan).toEqual({
        reloadKnowledgeBases: true,
        reloadDocuments: true,
      });

      const docRefreshPlan = resolveRefreshScope('tab_doc_refresh_click', {
        currentSelectedKbId: 'kb-1',
      });
      expect(docRefreshPlan).toEqual({
        reloadKnowledgeBases: false,
        reloadDocuments: true,
      });
    });
  });
});
