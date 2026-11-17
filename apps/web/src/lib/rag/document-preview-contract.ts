/**
 * 文档预览传输契约（ADR-0053, C7）
 *
 * 本模块只描述 HTTP 200 响应的公开形状与纯类型，不依赖数据库、对象存储、
 * 投影实现或任何服务端运行时模块，供内容路由与 Drawer 共同消费。
 *
 * - sourceFormat 在所有 200 状态返回，驱动格式徽标与原件/PDF 下载语义；
 * - renderMode 只在 ready 返回，只驱动正文渲染方式；
 * - bodySource 仅存在于服务端投影与测试，不属于本契约；
 * - fileType 已删除，不保留兼容别名。
 */

import type { SourceFormat } from '@repo/shared';

/** 当前版本切片的最小预览字段 */
export interface DocumentPreviewChunk {
  chunkIndex: number;
  content: string;
  headingPath: string | null;
  pageNumber: number | null;
}

/** 正文渲染方式：只区分 PDF 切片与原版 Markdown 正文，不包含 unknown */
export type DocumentRenderMode = 'pdf-chunks' | 'markdown';

/** 内容路由与 Drawer 共享的预览 DTO；字段与 HTTP 响应一一对应 */
export interface DocumentPreviewData {
  id: string;
  name: string;
  version: number;
  /** ready 为当前版本实际切片数；非 ready 为 null */
  chunkCount: number | null;
  status: string;
  errorMessage: string | null;
  /** 所有 200 状态返回 */
  sourceFormat: SourceFormat;
  /** 仅 ready 返回 */
  renderMode?: DocumentRenderMode;
  /** 连续正文；bodySource=chunks（含 PDF）及非 ready 时为空字符串 */
  content: string;
  /** ready 为当前版本切片；非 ready 为空数组 */
  chunks: DocumentPreviewChunk[];
  /** 对象存储源资产签名地址；与 sourceUrl 不互换 */
  originalUrl: string | null;
  sourceType: string;
  /** 外部网页地址；仅 URL 文档提供 */
  sourceUrl: string | null;
}
