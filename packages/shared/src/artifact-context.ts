/**
 * artifact-context.ts
 *
 * 职责（ADR-0037 §4 产物上下文注入）：
 * - 客户端：由产物池 + 工作台状态构造请求体里的 `artifactContext`（仅工作台展开且有聚焦产物时携带全文）；
 * - 服务端：不信任客户端，重新校验字段、重新计算标题目录与长度上限，产出注入系统提示词的文本。
 *
 * 注入只作用于当次请求的系统提示词，不进入消息历史，下一轮按当时状态重新决定。
 */

import type { Artifact, ArtifactType } from './chat-stream-contract';
import { parseMarkdownHeadings } from './artifact-version-engine';

/** 有标题结构的 Markdown 走章节补丁（输出只有被改章节），全文注入上限 */
export const ARTIFACT_MARKDOWN_INJECT_LIMIT = 30_000;
/** 其余类型（代码、表格、无标题 Markdown）走整篇替换，受单次输出上限约束，全文注入上限 */
export const ARTIFACT_OTHER_INJECT_LIMIT = 6_000;

/** 目录条目数与单字段长度上限：目录只是引导信息，防止客户端灌入超长内容 */
const MAX_DIRECTORY_ENTRIES = 20;
const MAX_FIELD_LENGTH = 120;

const CONTEXT_TYPES: readonly ArtifactType[] = ['markdown', 'table', 'code'];

/** 目录条目（标识、类型、标题） */
export interface ArtifactContextEntry {
  id: string;
  type: ArtifactType;
  title: string;
}

/** 聚焦产物（含当前版全文） */
export interface ArtifactContextFocus extends ArtifactContextEntry {
  content: string;
  /** 标题目录（仅有标题结构的 Markdown）：标题行原文列表，仅供请求体自描述，服务端不信任、会按全文重算 */
  outline?: string[];
}

/** 请求体里的产物上下文：目录 + 工作台展开标记 + 可选的聚焦产物 */
export interface ArtifactContextRequest {
  directory: ArtifactContextEntry[];
  /** 工作台是否展开；仅展开且有聚焦产物时才允许注入全文 */
  workspaceOpen: boolean;
  focus?: ArtifactContextFocus;
}

/** 服务端复核结果 */
export interface ArtifactContextResolution {
  /** 注入系统提示词的文本 */
  text: string;
  /** full=注入全文；directory-only=仅目录（工作台关闭）；oversize=聚焦产物超限，仅目录并提示拆分 */
  mode: 'full' | 'directory-only' | 'oversize';
  /** 注入的聚焦产物全文字符数（非 full 时为 0） */
  injectedChars: number;
}

/**
 * 客户端：构造请求体里的产物上下文。
 * 没有可编辑产物（无完成态的非图片产物）时返回 undefined，请求体与改造前逐字节一致。
 */
export function buildArtifactContextRequest(params: {
  artifacts: Artifact[];
  activeArtifactId: string | null;
  isWorkspaceOpen: boolean;
}): ArtifactContextRequest | undefined {
  const editable = params.artifacts.filter((a) => a.status === 'complete' && a.type !== 'image');
  if (editable.length === 0) return undefined;

  const directory = editable.map((a) => ({ id: a.id, type: a.type, title: a.title }));
  if (!params.isWorkspaceOpen) return { directory, workspaceOpen: false };

  // 与工作台一致：聚焦 id 无效时回退到最后一个产物
  const focused =
    editable.find((a) => a.id === params.activeArtifactId) ?? editable[editable.length - 1];
  const outline =
    focused.type === 'markdown'
      ? parseMarkdownHeadings(focused.content).map((h) => h.line)
      : [];
  return {
    directory,
    workspaceOpen: true,
    focus: {
      id: focused.id,
      type: focused.type,
      title: focused.title,
      content: focused.content,
      ...(outline.length > 0 ? { outline } : {}),
    },
  };
}

/** 清洗单行字段：去换行、截断，避免目录条目破坏提示词结构 */
function cleanField(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_LENGTH);
}

function parseEntry(raw: unknown): ArtifactContextEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { id, type, title } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  if (!CONTEXT_TYPES.includes(type as ArtifactType)) return null;
  const cleanId = cleanField(id);
  if (!cleanId) return null;
  return { id: cleanId, type: type as ArtifactType, title: cleanField(title) || '未命名产物' };
}

function formatDirectory(directory: ArtifactContextEntry[]): string {
  return directory.map((e) => `- identifier=${e.id} | 类型=${e.type} | 标题=${e.title}`).join('\n');
}

/**
 * 服务端：复核请求体里的产物上下文并生成注入文本。
 * 字段非法或没有任何目录条目时返回 null（不注入、不影响请求）。
 */
export function resolveArtifactContext(raw: unknown): ArtifactContextResolution | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const ctx = raw as Record<string, unknown>;

  const directory = (Array.isArray(ctx.directory) ? ctx.directory : [])
    .slice(0, MAX_DIRECTORY_ENTRIES)
    .map(parseEntry)
    .filter((e): e is ArtifactContextEntry => e !== null);

  // 聚焦产物：仅当工作台展开标记严格为 true 且字段合法时才认
  let focus: ArtifactContextFocus | null = null;
  if (ctx.workspaceOpen === true && typeof ctx.focus === 'object' && ctx.focus !== null) {
    const entry = parseEntry(ctx.focus);
    const content = (ctx.focus as Record<string, unknown>).content;
    if (entry && typeof content === 'string' && content.length > 0) focus = { ...entry, content };
  }
  if (focus && !directory.some((e) => e.id === focus.id)) {
    directory.push({ id: focus.id, type: focus.type, title: focus.title });
  }
  if (directory.length === 0) return null;

  const header = `【当前产物上下文】\n本会话已有的产物目录：\n${formatDirectory(directory)}`;

  if (!focus) {
    return {
      mode: 'directory-only',
      injectedChars: 0,
      text: `${header}\n\n工作台当前未展开，你看不到任何产物的正文：不得凭空重写、猜测或编造已有产物的内容；若用户要求修改已有产物，请提示用户先打开右侧工作台并聚焦该产物后再提出修改。`,
    };
  }

  // 长度上限由服务端按真实内容复核：声称 Markdown 但无标题结构时按「其余类型」处理
  const headings = focus.type === 'markdown' ? parseMarkdownHeadings(focus.content) : [];
  const hasHeadings = headings.length > 0;
  const limit = hasHeadings ? ARTIFACT_MARKDOWN_INJECT_LIMIT : ARTIFACT_OTHER_INJECT_LIMIT;

  if (focus.content.length > limit) {
    return {
      mode: 'oversize',
      injectedChars: 0,
      text: `${header}\n\n用户当前聚焦的产物是 identifier=${focus.id}（标题「${focus.title}」），但其内容共 ${focus.content.length} 字符，超过可修改上限 ${limit} 字符，未提供全文：不得修改或重写该产物；请告知用户将其拆分为多个较短的产物，或新建一份产物后再继续。`,
    };
  }

  const outline = hasHeadings
    ? `\n标题目录（章节补丁的 section 必须原样抄写其中一行）：\n${headings.map((h) => h.line).join('\n')}\n`
    : '\n该产物没有章节标题结构，修改时请沿用同一 identifier 整篇输出（不使用 section）。\n';
  return {
    mode: 'full',
    injectedChars: focus.content.length,
    text: `${header}\n\n用户当前聚焦的产物（工作台已展开）：identifier=${focus.id}，类型=${focus.type}，标题「${focus.title}」。${outline}\n当前版全文（仅供修改参考，不要在回答里原样复述）：\n<<<ARTIFACT_CONTENT\n${focus.content}\nARTIFACT_CONTENT>>>`,
  };
}
