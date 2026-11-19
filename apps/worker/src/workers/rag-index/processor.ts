/**
 * RAG 文档索引任务核心处理器 (Processor)
 *
 * 核心设计契约：
 * 1. 下载：通过 @repo/storage 下载文档 Buffer；格式派生必须与下载 buffer 同源使用 jobData.storageKey
 * 2. 解析：按 SourceFormat 选择解析器，完成 PDF/MD/TXT 文本提取与 500~800 tokens 语义切块
 * 3. 分词：统一应用层分词 module，索引侧 fail-closed
 * 4. 向量化：统一批量向量化政策（64 条/批、顺序、逐批观测），不扣配额
 * 5. 事务入库：同一事务内原子删除旧版本切片 + 插入新版本切片 + 更新 Document 状态为 ready 与 chunkCount
 * 6. 衍生缓存：仅 DOCX/XLSX/CSV 按共享布局规则额外写入 content.md；MD/TXT/URL 不重复写入
 * 7. 异常控制：区分致命错误（文件损坏、空内容、未知格式、分词不可用直接置 failed 中文原因不重试）与瞬态错误（交由 BullMQ 重试）
 */

import { logger } from '@repo/logger';
import { prisma, replaceDocumentChunksInTransaction } from '@repo/db';
import { createStorageProvider, StorageProvider } from '@repo/storage';
import { embedTexts } from '@repo/text';
import {
  deriveParsedContentKey,
  deriveSourceFormat,
  requiresDerivedContent,
} from '@repo/shared';
import { guardedFetch, SsrfSecurityError } from '@repo/shared/server';
import type { RagIndexJobData } from '@repo/queue';
import { parseDocument, DocumentParseError, ParsedDocumentChunks } from './parser';
import { extractContentFromHtml } from './html-extractor';

export interface ProcessRagIndexDependencies {
  storage?: StorageProvider;
  embedTextsFn?: typeof embedTexts;
  replaceChunksFn?: typeof replaceDocumentChunksInTransaction;
  prismaClient?: typeof prisma;
  guardedFetchFn?: typeof guardedFetch;
  extractContentFn?: typeof extractContentFromHtml;
}

export interface ProcessRagIndexResult {
  success: boolean;
  documentId: string;
  version: number;
  chunkCount: number;
  errorMessage?: string;
  isFatal?: boolean;
}

/**
 * 处理单篇 RAG 文档索引任务的主流管道函数
 */
export async function processRagIndexJob(
  jobData: RagIndexJobData,
  deps: ProcessRagIndexDependencies = {}
): Promise<ProcessRagIndexResult> {
  const { documentId, knowledgeBaseId, userId, version, storageKey, fileName } = jobData;
  const db = deps.prismaClient || prisma;
  const storage = deps.storage || createStorageProvider();
  const embedAll = deps.embedTextsFn || embedTexts;
  const replaceChunks = deps.replaceChunksFn || replaceDocumentChunksInTransaction;

  logger.info('开始处理 RAG 文档索引任务', {
    documentId,
    knowledgeBaseId,
    userId,
    version,
    fileName,
  });

  // 1. 查询并校验文档存在性（已软删除文档终止索引）
  const doc = await db.document.findUnique({
    where: { id: documentId },
  });

  if (!doc || doc.deletedAt !== null) {
    logger.warn('RAG 文档不存在或已被软删除，跳过索引', { documentId });
    return {
      success: false,
      documentId,
      version,
      chunkCount: 0,
      errorMessage: '文档不存在或已删除',
    };
  }

  // 2. 派生源格式：Document.sourceType 优先，jobData.sourceType 兼容旧任务回退，最后按 file-like 处理。
  //    必须使用任务自带的 storageKey（与实际下载 buffer 同源），不得使用可能已指向重传新版本的 document.storageKey。
  const sourceType = doc.sourceType || jobData.sourceType || 'file';
  const sourceFormat = deriveSourceFormat({ sourceType, storageKey });

  // 3. 将文档状态标记为处理中 (processing)
  await db.document.update({
    where: { id: documentId },
    data: {
      status: 'processing',
      errorMessage: null,
    },
  });

  let parsedChunks: ParsedDocumentChunks;
  try {
    let fileBuffer: Buffer;
    const isUrlDoc = sourceType === 'url' && Boolean(jobData.sourceUrl || doc.sourceUrl);
    const targetUrl = jobData.sourceUrl || doc.sourceUrl || '';

    if (isUrlDoc) {
      const fetchFn = deps.guardedFetchFn || guardedFetch;
      const extractFn = deps.extractContentFn || extractContentFromHtml;

      let htmlResponse;
      try {
        htmlResponse = await fetchFn(targetUrl);
      } catch (err) {
        if (err instanceof SsrfSecurityError) {
          logger.error('RAG 外链抓取触发 SSRF 防御拦截', err, { documentId, targetUrl });
          await db.document.update({
            where: { id: documentId },
            data: {
              status: 'failed',
              errorMessage: `安全拦截: ${err.message}`,
            },
          });
          return {
            success: false,
            documentId,
            version,
            chunkCount: 0,
            errorMessage: err.message,
            isFatal: true,
          };
        }
        throw err;
      }

      if (htmlResponse.status >= 400) {
        const isFatalStatus = htmlResponse.status === 404 || htmlResponse.status === 403 || htmlResponse.status === 410;
        const errorMsg = `抓取目标页面失败（HTTP ${htmlResponse.status}）`;
        logger.error(errorMsg, undefined, { documentId, targetUrl, status: htmlResponse.status });
        await db.document.update({
          where: { id: documentId },
          data: {
            status: 'failed',
            errorMessage: errorMsg,
          },
        });
        return {
          success: false,
          documentId,
          version,
          chunkCount: 0,
          errorMessage: errorMsg,
          isFatal: isFatalStatus,
        };
      }

      const extracted = extractFn(htmlResponse.text, targetUrl);
      // URL 源资产固定为归一化 Markdown，真实标题只用于文档名称与上下文，不再为解析合成后缀
      fileBuffer = Buffer.from(extracted.markdown, 'utf8');

      // 存储提纯后的 Markdown，保持存储与切片体系一致
      await storage.upload(storageKey, fileBuffer, 'text/markdown');

      // 更新真实文档标题
      await db.document.update({
        where: { id: documentId },
        data: { name: extracted.title },
      });
    } else {
      // 4. 从对象存储下载任务指定版本的文件
      fileBuffer = await storage.download(storageKey);
    }

    // 5. 按显式 SourceFormat 解析文档并执行语义切块与中文分词
    const parseResult = await parseDocument(fileBuffer, fileName, sourceFormat);
    parsedChunks = parseResult;

    // 6. 仅 DOCX/XLSX/CSV 通过共享布局规则写入衍生 Markdown 缓存；
    //    MD/TXT 的 fullMarkdown 只用于解析与大纲，URL 只保留自身源资产 (ADR-0053)
    if (requiresDerivedContent(sourceFormat) && parseResult.fullMarkdown) {
      const parsedContentKey = deriveParsedContentKey(storageKey);
      try {
        await storage.upload(
          parsedContentKey,
          Buffer.from(parseResult.fullMarkdown, 'utf8'),
          'text/markdown'
        );
      } catch (uploadErr) {
        logger.warn('提纯 Markdown 缓存写入对象存储失败（不阻断主索引流程）', {
          documentId,
          error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr),
        });
      }
    }
  } catch (error) {
    if (error instanceof DocumentParseError && error.isFatal) {
      // 永久性致命格式错误（损坏 PDF、空文件、不支持类型）：立即置 failed 并记录中文原因，不向外抛错以避免死循环重试
      logger.error('RAG 文档解析失败（致命错误，终止重试）', error, {
        documentId,
        fileName,
      });

      await db.document.update({
        where: { id: documentId },
        data: {
          status: 'failed',
          errorMessage: error.message,
        },
      });

      return {
        success: false,
        documentId,
        version,
        chunkCount: 0,
        errorMessage: error.message,
        isFatal: true,
      };
    }

    // 下载失败或其他未知异常：记录状态并向外抛出交由 BullMQ 重试
    const errorMsg = error instanceof Error ? error.message : '文档下载或解析异常';
    logger.error('RAG 文档处理阶段出现异常', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `处理异常: ${errorMsg}`,
      },
    });

    throw error;
  }

  // 7. 批量向量化（统一分批政策：64 条/批、顺序保持、逐批观测）
  let allEmbeddings: number[][];

  try {
    allEmbeddings = await embedAll(
      parsedChunks.map((chunk) => chunk.content),
      {
        feature: 'rag-index',
        context: { documentId, userId },
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Embedding 接口调用失败';
    logger.error('RAG 文档向量化失败', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `向量化失败: ${errorMsg}`,
      },
    });

    throw error;
  }

  // 8. 准备入库切片数据；切片元数据不再由 processor 拼装，
  //    改传文档继承事实，由共享构造规则在 chunk-store 层统一构造 (C1 / ADR-0032 修订)
  const rawDocMetadata =
    doc.metadata && typeof doc.metadata === 'object' && !Array.isArray(doc.metadata)
      ? (doc.metadata as Record<string, unknown>)
      : {};
  // 显式解构剔除历史旧 outline，确保 Document 主表 metadata 干净且更新时不会残留过期大纲 (P-W7 / ADR-0036)
  const { outline: _oldOutline, ...cleanDocMetadata } = rawDocMetadata;

  const updatedDocMetadata: Record<string, unknown> = {
    ...cleanDocMetadata,
  };
  if (parsedChunks.outline) {
    updatedDocMetadata.outline = parsedChunks.outline;
  }

  const chunksToInsert = parsedChunks.map((chunk, idx) => ({
    documentId,
    knowledgeBaseId,
    userId,
    documentVersion: version,
    chunkIndex: chunk.chunkIndex,
    content: chunk.content,
    contentSegmented: chunk.contentSegmented,
    headingPath: chunk.headingPath,
    pageNumber: chunk.pageNumber,
    tokenCount: chunk.tokenCount,
    embedding: allEmbeddings[idx],
  }));

  // 9. 事务内原子删旧版本切片 + 插入新切片 + 更新 Document 状态为 ready 与 chunkCount，并持久化大纲元数据 (ADR-0036)
  try {
    await replaceChunks({
      documentId,
      version,
      chunks: chunksToInsert,
      metadata: updatedDocMetadata,
      inheritance: {
        sourceType,
        name: fileName,
        storageKey,
        tags: (doc as { tags?: string[] }).tags || [],
        metadata: cleanDocMetadata,
      },
    });

    logger.info('RAG 文档索引成功入库', {
      documentId,
      version,
      chunkCount: chunksToInsert.length,
    });

    return {
      success: true,
      documentId,
      version,
      chunkCount: chunksToInsert.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '数据库事务提交失败';
    logger.error('RAG 文档切片事务落库失败', error as Error, { documentId });

    await db.document.update({
      where: { id: documentId },
      data: {
        status: 'failed',
        errorMessage: `切片落库失败: ${errorMsg}`,
      },
    });

    throw error;
  }
}
