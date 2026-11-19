import { describe, it, expect } from 'vitest';
import {
  RAG_FILE_CONFIG,
  RAG_CAPACITY_LIMITS,
  RAG_CAPACITY_ERROR_MESSAGES,
  validateRagDocument,
} from '../rag-config';

describe('RAG 配置与校验工具', () => {
  it('正确导出文件大小与格式限制配置', () => {
    expect(RAG_FILE_CONFIG.maxFileSize).toBe(20 * 1024 * 1024);
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.pdf');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.md');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.markdown');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.txt');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.docx');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.xlsx');
    expect(RAG_FILE_CONFIG.allowedExtensions).toContain('.csv');
  });

  it('正确导出容量配额与中文提示文案', () => {
    expect(RAG_CAPACITY_LIMITS.maxKnowledgeBasesPerUser).toBe(5);
    expect(RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase).toBe(50);
    expect(RAG_CAPACITY_LIMITS.maxChunksPerUser).toBe(20000);

    expect(RAG_CAPACITY_ERROR_MESSAGES.maxKnowledgeBases).toContain('知识库数量已达上限（最多 5 个）');
    expect(RAG_CAPACITY_ERROR_MESSAGES.maxDocuments).toContain('知识库文档数量已达上限（最多 50 个）');
    expect(RAG_CAPACITY_ERROR_MESSAGES.maxChunks).toContain('切片总数已达上限（最多 20000 个）');
  });

  describe('validateRagDocument', () => {
    it('合法 PDF 文件校验通过并返回安全文件名', () => {
      const result = validateRagDocument({
        name: '技术架构设计方案.pdf',
        size: 1024 * 1024,
        type: 'application/pdf',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.safeName).toBe('技术架构设计方案.pdf');
      }
    });

    it('合法 Markdown 文件校验通过', () => {
      const mdResult = validateRagDocument({
        name: 'README.md',
        size: 500,
        type: 'text/markdown',
      });
      expect(mdResult.valid).toBe(true);

      const markdownResult = validateRagDocument({
        name: 'guide.markdown',
        size: 500,
        type: 'text/plain',
      });
      expect(markdownResult.valid).toBe(true);
    });

    it('合法 TXT 文本文件校验通过', () => {
      const result = validateRagDocument({
        name: 'notes.txt',
        size: 1024,
        type: 'text/plain',
      });
      expect(result.valid).toBe(true);
    });

    it('合法 Word (.docx) 与表格 (.xlsx / .csv) 文件校验通过', () => {
      const docxResult = validateRagDocument({
        name: '劳动合同范本.docx',
        size: 1024 * 50,
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      expect(docxResult.valid).toBe(true);
      if (docxResult.valid) {
        expect(docxResult.safeName).toBe('劳动合同范本.docx');
        expect(docxResult.extension).toBe('.docx');
      }

      const xlsxResult = validateRagDocument({
        name: '财务报表2024.xlsx',
        size: 1024 * 100,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      expect(xlsxResult.valid).toBe(true);
      if (xlsxResult.valid) {
        expect(xlsxResult.safeName).toBe('财务报表2024.xlsx');
        expect(xlsxResult.extension).toBe('.xlsx');
      }

      const csvResult = validateRagDocument({
        name: '花名册.csv',
        size: 1024 * 10,
        type: 'text/csv',
      });
      expect(csvResult.valid).toBe(true);
      if (csvResult.valid) {
        expect(csvResult.safeName).toBe('花名册.csv');
        expect(csvResult.extension).toBe('.csv');
      }
    });

    it('老旧 .doc 与 .xls 格式拦截并给出转存友好提示', () => {
      const docResult = validateRagDocument({
        name: 'old-contract.doc',
        size: 1024,
        type: 'application/msword',
      });
      expect(docResult.valid).toBe(false);
      if (!docResult.valid) {
        expect(docResult.error).toContain('暂不支持老旧的 .doc/.xls 格式，请在 Office 或 WPS 中另存为 .docx/.xlsx 后重新上传');
      }

      const xlsResult = validateRagDocument({
        name: 'old-report.xls',
        size: 1024,
        type: 'application/vnd.ms-excel',
      });
      expect(xlsResult.valid).toBe(false);
      if (!xlsResult.valid) {
        expect(xlsResult.error).toContain('暂不支持老旧的 .doc/.xls 格式，请在 Office 或 WPS 中另存为 .docx/.xlsx 后重新上传');
      }
    });

    it('非法扩展名拒绝并返回明确中文提示', () => {
      const exeResult = validateRagDocument({
        name: 'malicious.exe',
        size: 1024,
        type: 'application/octet-stream',
      });
      expect(exeResult.valid).toBe(false);
      if (!exeResult.valid) {
        expect(exeResult.error).toContain('仅支持 PDF、Markdown、TXT、Word 与表格');
      }

      const pngResult = validateRagDocument({
        name: 'photo.png',
        size: 1024,
        type: 'image/png',
      });
      expect(pngResult.valid).toBe(false);
    });

    it('文件超过 20MB 大小限制拒绝并返回中文错误', () => {
      const result = validateRagDocument({
        name: 'large-manual.pdf',
        size: 21 * 1024 * 1024,
        type: 'application/pdf',
      });
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('文件大小超过限制');
      }
    });

    it('空文件名或危险路径名进行安全清洗', () => {
      const result = validateRagDocument({
        name: '../../../etc/passwd.txt',
        size: 100,
        type: 'text/plain',
      });
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.safeName).not.toContain('/');
        expect(result.safeName).not.toContain('\\');
      }
    });
  });
});
