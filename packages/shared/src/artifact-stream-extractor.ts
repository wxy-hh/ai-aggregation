/**
 * artifact-stream-extractor.ts
 *
 * 职责：
 * 纯函数式流式标签抽取器。监听模型流式输出中的 `<artifact ...>...</artifact>` 结构，
 * 将其精准切分为 ChatStreamEvent 序列：
 * - 标签外部普通文本 → `text-delta`
 * - 标签开端 → `artifact_start`
 * - 标签内部正文 → `artifact_delta`
 * - 标签闭合 → `artifact_end`
 *
 * 健壮性保障：
 * - 跨 chunk 切片缓冲（支持开闭标签被任意网络 chunk 切断）；
 * - 普通代码中小于号（如 `a < b`）安全防误杀；
 * - 流中断未闭合标签自愈（flush 自动完结并补发 end 事件）。
 */

import type {
  ChatStreamEvent,
  ArtifactType,
  ArtifactMeta,
} from './chat-stream-contract';

export interface ArtifactStreamExtractor {
  /** 接收新的增量文本片段，返回当前解构出的事件数组 */
  push: (chunk: string) => ChatStreamEvent[];
  /** 流结束时强制清空缓冲区并自愈未闭合状态 */
  flush: () => ChatStreamEvent[];
}

/** 解析开标签中的属性字典 */
function parseTagAttributes(tagContent: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // 匹配 key="value" 或 key='value' 或 key=value
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(tagContent)) !== null) {
    const key = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
}

export function createArtifactStreamExtractor(): ArtifactStreamExtractor {
  let state: 'outside' | 'inside' = 'outside';
  let buffer = '';
  let activeArtifact: ArtifactMeta | null = null;
  let artifactCount = 0;

  const push = (chunk: string): ChatStreamEvent[] => {
    if (!chunk) return [];
    buffer += chunk;
    const events: ChatStreamEvent[] = [];

    // 循环驱动状态机消费 buffer
    let progressed = true;
    while (progressed && buffer.length > 0) {
      progressed = false;

      if (state === 'outside') {
        const tagStartIndex = buffer.indexOf('<artifact');
        if (tagStartIndex === -1) {
          // 没有发现 <artifact，但末尾可能存在截断的前缀，如 "<", "<a", "<art", "<artifact"
          const lastLtIndex = buffer.lastIndexOf('<');
          if (lastLtIndex !== -1 && buffer.length - lastLtIndex < 10) {
            const potentialPrefix = buffer.slice(lastLtIndex);
            if ('<artifact'.startsWith(potentialPrefix)) {
              // 确实是潜在前缀，将前面的确定性文本发出，保留前缀在 buffer
              if (lastLtIndex > 0) {
                const emitText = buffer.slice(0, lastLtIndex);
                events.push({ type: 'text-delta', text: emitText });
                buffer = potentialPrefix;
                progressed = false;
              }
              break;
            }
          }
          // 纯普通文本，全量发出
          events.push({ type: 'text-delta', text: buffer });
          buffer = '';
          break;
        }

        // tagStartIndex !== -1，找到了 "<artifact"
        // 检查前面是否有普通文本需先行发出
        if (tagStartIndex > 0) {
          const textBefore = buffer.slice(0, tagStartIndex);
          events.push({ type: 'text-delta', text: textBefore });
          buffer = buffer.slice(tagStartIndex);
          progressed = true;
          continue;
        }

        // 此时 buffer 以 "<artifact" 开头，寻找开标签闭合字符 ">"
        const tagCloseIndex = buffer.indexOf('>');
        if (tagCloseIndex === -1) {
          // 开标签尚未完整到达，留在 buffer 等待后续 chunk
          break;
        }

        // 提取开标签完整字符串并解析属性
        const fullTag = buffer.slice(0, tagCloseIndex + 1);
        const attrs = parseTagAttributes(fullTag);

        artifactCount++;
        const rawType = (attrs.type ?? 'markdown').toLowerCase();
        const validTypes: ArtifactType[] = ['markdown', 'table', 'code', 'image'];
        const type: ArtifactType = validTypes.includes(rawType as ArtifactType)
          ? (rawType as ArtifactType)
          : 'markdown';

        const id = attrs.identifier || attrs.id || `art_${Date.now()}_${artifactCount}`;
        const title = attrs.title || attrs.name || '交付产物';
        const language = attrs.language || undefined;

        activeArtifact = { id, type, title, ...(language ? { language } : {}) };
        events.push({
          type: 'artifact_start',
          artifact: { ...activeArtifact },
        });

        state = 'inside';
        buffer = buffer.slice(tagCloseIndex + 1);
        progressed = true;

      } else {
        // state === 'inside'
        const closeTagIndex = buffer.indexOf('</artifact>');
        if (closeTagIndex !== -1) {
          // 找到闭标签
          const delta = buffer.slice(0, closeTagIndex);
          if (delta.length > 0 && activeArtifact) {
            events.push({
              type: 'artifact_delta',
              id: activeArtifact.id,
              delta,
            });
          }

          if (activeArtifact) {
            events.push({
              type: 'artifact_end',
              id: activeArtifact.id,
              status: 'complete',
            });
          }

          state = 'outside';
          activeArtifact = null;
          buffer = buffer.slice(closeTagIndex + '</artifact>'.length);
          progressed = true;
          continue;
        }

        // 没有找到完整 </artifact>，检查末尾是否有可能是截断的闭标签前缀
        const lastClosePrefixIndex = buffer.lastIndexOf('</');
        if (lastClosePrefixIndex !== -1 && buffer.length - lastClosePrefixIndex < '</artifact>'.length) {
          const potentialClosePrefix = buffer.slice(lastClosePrefixIndex);
          if ('</artifact>'.startsWith(potentialClosePrefix)) {
            // 是闭标签前缀，将前缀之前的正文作为 delta 发出
            if (lastClosePrefixIndex > 0 && activeArtifact) {
              const delta = buffer.slice(0, lastClosePrefixIndex);
              events.push({
                type: 'artifact_delta',
                id: activeArtifact.id,
                delta,
              });
              buffer = potentialClosePrefix;
            }
            break;
          }
        }

        // 内部正文，全量作为 artifact_delta 发出
        if (buffer.length > 0 && activeArtifact) {
          events.push({
            type: 'artifact_delta',
            id: activeArtifact.id,
            delta: buffer,
          });
          buffer = '';
        }
        break;
      }
    }

    return events;
  };

  const flush = (): ChatStreamEvent[] => {
    const events: ChatStreamEvent[] = [];

    if (state === 'inside') {
      // 未闭合标签自愈
      if (buffer.length > 0 && activeArtifact) {
        events.push({
          type: 'artifact_delta',
          id: activeArtifact.id,
          delta: buffer,
        });
        buffer = '';
      }
      if (activeArtifact) {
        events.push({
          type: 'artifact_end',
          id: activeArtifact.id,
          status: 'complete',
        });
      }
      state = 'outside';
      activeArtifact = null;
    } else {
      // 外部残留普通文本发出
      if (buffer.length > 0) {
        events.push({ type: 'text-delta', text: buffer });
        buffer = '';
      }
    }

    return events;
  };

  return { push, flush };
}
