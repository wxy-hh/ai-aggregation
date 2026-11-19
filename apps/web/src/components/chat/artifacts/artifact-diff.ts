import { diffChars, diffLines } from 'diff';

/** 差异行类型：新增、删除、未改（ADR-0037 §7） */
export type DiffLineType = 'added' | 'removed' | 'unchanged';

/** 行内片段：highlight 为 true 表示该片段是本行内真正变化的字符 */
export interface DiffSegment {
  text: string;
  highlight: boolean;
}

export interface DiffLine {
  type: DiffLineType;
  text: string;
  segments: DiffSegment[];
}

/** 行级计算的超时（毫秒），超时则退化为整块删除 + 整块新增 */
const LINE_DIFF_TIMEOUT_MS = 1000;
/** 字符级行内高亮的行长上限与超时，避免超长行拖慢渲染 */
const INLINE_MAX_LENGTH = 2000;
const INLINE_DIFF_TIMEOUT_MS = 200;
/** 两行相似度低于该值时不做行内高亮（整行标记即可，避免满屏碎片） */
const INLINE_MIN_SIMILARITY = 0.4;

/** 把 jsdiff 的块文本拆成行：去掉块尾的一个换行后按换行切分，保留空行 */
function splitLines(value: string): string[] {
  const body = value.endsWith('\n') ? value.slice(0, -1) : value;
  return body.split('\n');
}

function plainSegments(text: string): DiffSegment[] {
  return [{ text, highlight: false }];
}

/**
 * 对一对「被改的旧行 / 新行」做字符级对比，返回各自的片段。
 * 相似度不足、行过长或超时时返回 null，调用方退化为整行标记。
 */
function inlineSegments(oldLine: string, newLine: string): { removed: DiffSegment[]; added: DiffSegment[] } | null {
  if (!oldLine || !newLine) return null;
  if (oldLine.length > INLINE_MAX_LENGTH || newLine.length > INLINE_MAX_LENGTH) return null;
  const parts = diffChars(oldLine, newLine, { timeout: INLINE_DIFF_TIMEOUT_MS });
  if (!parts) return null;

  const removed: DiffSegment[] = [];
  const added: DiffSegment[] = [];
  let commonLength = 0;
  for (const part of parts) {
    if (part.added) {
      added.push({ text: part.value, highlight: true });
    } else if (part.removed) {
      removed.push({ text: part.value, highlight: true });
    } else {
      commonLength += part.value.length;
      removed.push({ text: part.value, highlight: false });
      added.push({ text: part.value, highlight: false });
    }
  }
  const similarity = (commonLength * 2) / (oldLine.length + newLine.length);
  return similarity >= INLINE_MIN_SIMILARITY ? { removed, added } : null;
}

/**
 * 计算两个版本 Markdown 源码的统一视图差异：行级 diff，
 * 相邻的「删除块 + 新增块」按行配对后再做字符级行内高亮。
 */
export function buildUnifiedDiff(oldText: string, newText: string): DiffLine[] {
  const changes = diffLines(oldText, newText, {
    stripTrailingCr: true,
    ignoreNewlineAtEof: true,
    timeout: LINE_DIFF_TIMEOUT_MS,
  });

  // 超时放弃：整块视为删除后新增，宁可粗糙也不卡住界面
  if (!changes) {
    return [
      ...splitLines(oldText).map((text): DiffLine => ({ type: 'removed', text, segments: plainSegments(text) })),
      ...splitLines(newText).map((text): DiffLine => ({ type: 'added', text, segments: plainSegments(text) })),
    ];
  }

  const result: DiffLine[] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const next = changes[i + 1];

    if (!change.added && !change.removed) {
      for (const text of splitLines(change.value)) {
        result.push({ type: 'unchanged', text, segments: plainSegments(text) });
      }
      continue;
    }

    if (change.removed) {
      const removedLines = splitLines(change.value);
      const addedLines = next?.added ? splitLines(next.value) : [];
      const removedOut: DiffLine[] = removedLines.map((text) => ({ type: 'removed', text, segments: plainSegments(text) }));
      const addedOut: DiffLine[] = addedLines.map((text) => ({ type: 'added', text, segments: plainSegments(text) }));
      // 按行序号一一配对做行内高亮
      const pairs = Math.min(removedLines.length, addedLines.length);
      for (let k = 0; k < pairs; k++) {
        const inline = inlineSegments(removedLines[k], addedLines[k]);
        if (inline) {
          removedOut[k].segments = inline.removed;
          addedOut[k].segments = inline.added;
        }
      }
      result.push(...removedOut, ...addedOut);
      if (next?.added) i++;
      continue;
    }

    // 单独的新增块
    for (const text of splitLines(change.value)) {
      result.push({ type: 'added', text, segments: plainSegments(text) });
    }
  }
  return result;
}
