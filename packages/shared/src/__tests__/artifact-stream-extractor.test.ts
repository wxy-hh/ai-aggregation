import { describe, it, expect } from 'vitest';
import { createArtifactStreamExtractor } from '../artifact-stream-extractor';
import { parseChatStreamEvent, encodeChatStreamEvent, ChatStreamEvent } from '../chat-stream-contract';

describe('chat-stream-contract artifact events', () => {
  it('正确编码与解析 artifact_start 事件', () => {
    const event: ChatStreamEvent = {
      type: 'artifact_start',
      artifact: {
        id: 'art-1',
        type: 'markdown',
        title: '深度调研报告',
        language: 'markdown',
      },
    };
    const encoded = encodeChatStreamEvent(event);
    const parsed = parseChatStreamEvent(JSON.parse(encoded.replace(/^data: /, '').trim()));
    expect(parsed).toEqual(event);
  });

  it('正确编码与解析 artifact_delta 事件', () => {
    const event: ChatStreamEvent = {
      type: 'artifact_delta',
      id: 'art-1',
      delta: '# 标题增量',
    };
    const encoded = encodeChatStreamEvent(event);
    const parsed = parseChatStreamEvent(JSON.parse(encoded.replace(/^data: /, '').trim()));
    expect(parsed).toEqual(event);
  });

  it('正确编码与解析 artifact_end 事件', () => {
    const event: ChatStreamEvent = {
      type: 'artifact_end',
      id: 'art-1',
      status: 'complete',
    };
    const encoded = encodeChatStreamEvent(event);
    const parsed = parseChatStreamEvent(JSON.parse(encoded.replace(/^data: /, '').trim()));
    expect(parsed).toEqual(event);
  });

  it('防范非法 artifact 事件 payload', () => {
    // 缺少 id
    expect(parseChatStreamEvent({ type: 'artifact_start', artifact: { type: 'markdown', title: '测试' } })).toBeNull();
    // 非法类型
    expect(parseChatStreamEvent({ type: 'artifact_start', artifact: { id: '1', type: 'unknown', title: '测试' } })).toBeNull();
    // delta 为空或非 string
    expect(parseChatStreamEvent({ type: 'artifact_delta', id: '1', delta: '' })).toBeNull();
    // end 非法 status
    expect(parseChatStreamEvent({ type: 'artifact_end', id: '1', status: 'other' })).toBeNull();
  });
});

describe('createArtifactStreamExtractor 流式标签抽取器', () => {
  it('纯文本流应原样直通为 text-delta', () => {
    const extractor = createArtifactStreamExtractor();
    const ev1 = extractor.push('你好，这是');
    const ev2 = extractor.push('普通的回答文本。');
    const ev3 = extractor.flush();

    const texts = [...ev1, ...ev2, ...ev3]
      .filter((e): e is { type: 'text-delta'; text: string } => e.type === 'text-delta')
      .map((e) => e.text)
      .join('');

    expect(texts).toBe('你好，这是普通的回答文本。');
  });

  it('单 chunk 完整抽取 artifact 标签', () => {
    const extractor = createArtifactStreamExtractor();
    const input = '报告已就绪：<artifact identifier="rep-1" type="markdown" title="AI发展报告"># 报告正文\n内容</artifact>请查阅。';
    const events = [...extractor.push(input), ...extractor.flush()];

    // 检查是否有 artifact_start
    const startEv = events.find((e) => e.type === 'artifact_start');
    expect(startEv).toBeDefined();
    if (startEv && startEv.type === 'artifact_start') {
      expect(startEv.artifact).toEqual({
        id: 'rep-1',
        type: 'markdown',
        title: 'AI发展报告',
      });
    }

    // 检查 artifact_delta 内容
    const deltas = events
      .filter((e): e is { type: 'artifact_delta'; id: string; delta: string } => e.type === 'artifact_delta')
      .map((e) => e.delta)
      .join('');
    expect(deltas).toBe('# 报告正文\n内容');

    // 检查 artifact_end
    const endEv = events.find((e) => e.type === 'artifact_end');
    expect(endEv).toEqual({ type: 'artifact_end', id: 'rep-1', status: 'complete' });

    // 检查普通 text-delta
    const texts = events
      .filter((e): e is { type: 'text-delta'; text: string } => e.type === 'text-delta')
      .map((e) => e.text)
      .join('');
    expect(texts).toBe('报告已就绪：请查阅。');
  });

  it('支持开标签与闭标签跨 chunk 截断切片', () => {
    const extractor = createArtifactStreamExtractor();
    const chunks = [
      '导读：<arti',
      'fact identifier="c-1" type="code" title="计数器" language="typescript">',
      'const count = ',
      '1;',
      '</art',
      'ifact>',
      '，以上为源码。',
    ];

    const allEvents: ChatStreamEvent[] = [];
    for (const chunk of chunks) {
      allEvents.push(...extractor.push(chunk));
    }
    allEvents.push(...extractor.flush());

    const startEv = allEvents.find((e) => e.type === 'artifact_start');
    expect(startEv).toBeDefined();
    if (startEv && startEv.type === 'artifact_start') {
      expect(startEv.artifact).toEqual({
        id: 'c-1',
        type: 'code',
        title: '计数器',
        language: 'typescript',
      });
    }

    const deltas = allEvents
      .filter((e): e is { type: 'artifact_delta'; id: string; delta: string } => e.type === 'artifact_delta')
      .map((e) => e.delta)
      .join('');
    expect(deltas).toBe('const count = 1;');

    const endEv = allEvents.find((e) => e.type === 'artifact_end');
    expect(endEv).toEqual({ type: 'artifact_end', id: 'c-1', status: 'complete' });

    const texts = allEvents
      .filter((e): e is { type: 'text-delta'; text: string } => e.type === 'text-delta')
      .map((e) => e.text)
      .join('');
    expect(texts).toBe('导读：，以上为源码。');
  });

  it('普通代码中的小于号不被误杀为非法标签', () => {
    const extractor = createArtifactStreamExtractor();
    const input = '比较大小：if (a < b && c > d) { return true; }';
    const events = [...extractor.push(input), ...extractor.flush()];

    const texts = events
      .filter((e): e is { type: 'text-delta'; text: string } => e.type === 'text-delta')
      .map((e) => e.text)
      .join('');
    expect(texts).toBe(input);
    expect(events.some((e) => e.type.startsWith('artifact_'))).toBe(false);
  });

  it('流异常结束时未闭合标签自愈（flush 时补齐 artifact_end）', () => {
    const extractor = createArtifactStreamExtractor();
    const events = [
      ...extractor.push('<artifact identifier="broken-1" type="markdown" title="未完成研报">前半部分正文'),
      ...extractor.flush(),
    ];

    const start = events.find((e) => e.type === 'artifact_start');
    const delta = events.find((e) => e.type === 'artifact_delta');
    const end = events.find((e) => e.type === 'artifact_end');

    expect(start).toBeDefined();
    expect(delta).toBeDefined();
    expect(end).toEqual({ type: 'artifact_end', id: 'broken-1', status: 'complete' });
  });
});
