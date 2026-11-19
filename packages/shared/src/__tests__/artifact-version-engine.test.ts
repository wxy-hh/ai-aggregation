import { describe, it, expect } from 'vitest';
import type { Artifact, ChatStreamEvent } from '../chat-stream-contract';
import {
  applyArtifactEvent,
  beginArtifactTurn,
  deriveArtifactDepositState,
  dropOldestArtifactVersion,
  finalizeStreamingArtifacts,
  getArtifactVersions,
  MAX_ARTIFACT_VERSIONS,
  rollbackArtifact,
  findSectionRange,
} from '../artifact-version-engine';

const ID = 'report';

/** 构造「整篇生成」事件序列：start → 分块 delta → end */
function generate(
  content: string,
  status: 'complete' | 'error' = 'complete',
  id = ID,
  type: 'markdown' | 'code' = 'markdown'
): ChatStreamEvent[] {
  const mid = Math.floor(content.length / 2);
  return [
    { type: 'artifact_start', artifact: { id, type, title: '研报' } },
    { type: 'artifact_delta', id, delta: content.slice(0, mid) },
    { type: 'artifact_delta', id, delta: content.slice(mid) },
    { type: 'artifact_end', id, status },
  ].filter((e) => !(e.type === 'artifact_delta' && !(e as { delta: string }).delta)) as ChatStreamEvent[];
}

function run(events: ChatStreamEvent[], initial: Artifact[] = [], t0 = 1000): Artifact[] {
  let now = t0;
  return events.reduce((acc, e) => applyArtifactEvent(acc, e, now++), initial);
}

/** 连续成功生成 n 个版本，内容为「版本 i」 */
function buildChain(n: number): Artifact[] {
  let state: Artifact[] = [];
  for (let i = 1; i <= n; i++) state = run(generate(`版本 ${i} 的正文`), state, i * 100);
  return state;
}

describe('草稿与正式版分离（TC03）', () => {
  it('流式增量期间为草稿且版本链不变，收到 complete 后转正式版并成为当前版', () => {
    let state = run(generate('旧正文 AAA'));
    expect(getArtifactVersions(state[0])).toHaveLength(1);

    state = run(
      [
        { type: 'artifact_start', artifact: { id: ID, type: 'markdown', title: '研报' } },
        { type: 'artifact_delta', id: ID, delta: '新正文' },
      ],
      state
    );
    expect(state[0].status).toBe('streaming');
    expect(state[0].content).toBe('新正文');
    expect(getArtifactVersions(state[0])).toHaveLength(1);

    state = applyArtifactEvent(state, { type: 'artifact_end', id: ID, status: 'complete' }, 2000);
    expect(state[0].status).toBe('complete');
    const versions = getArtifactVersions(state[0]);
    expect(versions).toHaveLength(2);
    expect(versions[1].content).toBe('新正文');
    expect(state[0].content).toBe('新正文');
  });

  it('已有正式版的产物收到 error 时丢弃草稿，内容与版本链与修改前一致并带未完成提示标记', () => {
    const before = run(generate('旧正文 AAA'));
    const after = run(generate('半截新正文', 'error'), before);
    expect(after[0].status).toBe('complete');
    expect(after[0].content).toBe('旧正文 AAA');
    expect(getArtifactVersions(after[0])).toEqual(getArtifactVersions(before[0]));
    expect(after[0].notice).toBe('draft-discarded');
  });

  it('已有正式版的产物流式中被中止收尾时同样丢弃草稿并保留上一版', () => {
    const before = run(generate('旧正文 AAA'));
    const streaming = run(
      [
        { type: 'artifact_start', artifact: { id: ID, type: 'markdown', title: '研报' } },
        { type: 'artifact_delta', id: ID, delta: '写到一半' },
      ],
      before
    );
    const after = finalizeStreamingArtifacts(streaming);
    expect(after[0].status).toBe('complete');
    expect(after[0].content).toBe('旧正文 AAA');
    expect(getArtifactVersions(after[0])).toHaveLength(1);
    expect(after[0].notice).toBe('draft-discarded');
  });

  it('全新产物被中止时保留已生成内容并标记未完成，半成品不入版本链', () => {
    const streaming = run([
      { type: 'artifact_start', artifact: { id: ID, type: 'markdown', title: '研报' } },
      { type: 'artifact_delta', id: ID, delta: '写了一半的研报' },
    ]);
    const after = finalizeStreamingArtifacts(streaming);
    expect(after[0].content).toBe('写了一半的研报');
    expect(after[0].status).toBe('error');
    expect(getArtifactVersions(after[0])).toHaveLength(0);
  });

  it('没有流式产物时 finalizeStreamingArtifacts 原样返回同一数组', () => {
    const state = run(generate('正文'));
    expect(finalizeStreamingArtifacts(state)).toBe(state);
  });

  it('同一 identifier 再次整篇输出时新版本恰等于新输出，不含旧内容片段', () => {
    const state = run(generate('旧版独有句子：蓝色的天空。'), []);
    const after = run(generate('新版全部重写。'), state, 5000);
    const versions = getArtifactVersions(after[0]);
    expect(versions).toHaveLength(2);
    expect(versions[1].content).toBe('新版全部重写。');
    expect(after[0].content).not.toContain('蓝色的天空');
    expect(after).toHaveLength(1);
  });

  it('对 Markdown 产物输出不带 section 的整篇内容时按整篇替换处理并产生一个新版本', () => {
    const md = '# 标题\n\n## 第一章\n旧\n\n## 第二章\n旧\n';
    const state = run(generate(md));
    const after = run(generate('# 标题\n\n## 全新结构\n新\n'), state, 5000);
    const versions = getArtifactVersions(after[0]);
    expect(versions).toHaveLength(2);
    expect(versions[1].content).toBe('# 标题\n\n## 全新结构\n新\n');
    expect(versions[1].source).toEqual({ kind: 'generated' });
  });
});

describe('版本链、追加式回滚与淘汰（TC04）', () => {
  it('连续成功生成 3 次后版本按序号 1、2、3 排列并可读取任一版本内容', () => {
    const state = buildChain(3);
    const versions = getArtifactVersions(state[0]);
    expect(versions.map((v) => v.seq)).toEqual([1, 2, 3]);
    expect(versions.map((v) => v.content)).toEqual(['版本 1 的正文', '版本 2 的正文', '版本 3 的正文']);
  });

  it('回滚到 v1 后追加内容等于 v1 的新末尾版本并标注回滚自 v1，原有版本均保留', () => {
    const state = buildChain(3);
    const rolled = rollbackArtifact(state[0], 1, 9000);
    const versions = getArtifactVersions(rolled);
    expect(versions.map((v) => v.seq)).toEqual([1, 2, 3, 4]);
    expect(versions[3].content).toBe(versions[0].content);
    expect(versions[3].source).toEqual({ kind: 'rollback', fromSeq: 1 });
    expect(rolled.content).toBe('版本 1 的正文');
    expect(rolled.status).toBe('complete');
  });

  it('对回滚产生的版本再次回滚到 v3 得到回滚自 v3 的新末尾版本且未淘汰时不删除任何版本', () => {
    const state = buildChain(3);
    const once = rollbackArtifact(state[0], 1, 9000);
    const twice = rollbackArtifact(once, 3, 9001);
    const versions = getArtifactVersions(twice);
    expect(versions.map((v) => v.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(versions[4].source).toEqual({ kind: 'rollback', fromSeq: 3 });
    expect(versions[4].content).toBe('版本 3 的正文');
  });

  it('回滚到当前版或不存在的版本时原样返回，不占用版本名额', () => {
    const state = buildChain(3);
    expect(rollbackArtifact(state[0], 3, 9000)).toBe(state[0]);
    expect(rollbackArtifact(state[0], 99, 9000)).toBe(state[0]);
  });

  it('版本数达到 6 时淘汰最旧的中间版本，链长恒为 5，首版与当前版均保留', () => {
    const state = buildChain(6);
    const versions = getArtifactVersions(state[0]);
    expect(MAX_ARTIFACT_VERSIONS).toBe(5);
    expect(versions).toHaveLength(5);
    expect(versions.map((v) => v.seq)).toEqual([1, 3, 4, 5, 6]);
    expect(state[0].content).toBe('版本 6 的正文');
  });

  it('连续回滚 5 次后首版仍保留且当前版内容正确', () => {
    let artifact = buildChain(5)[0];
    for (let i = 0; i < 5; i++) {
      artifact = rollbackArtifact(artifact, 1, 9000 + i);
    }
    const versions = getArtifactVersions(artifact);
    expect(versions).toHaveLength(5);
    expect(versions[0].seq).toBe(1);
    expect(versions[0].content).toBe('版本 1 的正文');
    expect(versions[4].content).toBe('版本 1 的正文');
    expect(versions[4].source).toEqual({ kind: 'rollback', fromSeq: 1 });
  });

  it('淘汰后版本序号不重新编号复用，已淘汰序号不会指向新版本', () => {
    const state = buildChain(6);
    const after = run(generate('版本 7 的正文'), state, 7000);
    const versions = getArtifactVersions(after[0]);
    expect(versions.some((v) => v.seq === 2)).toBe(false);
    expect(versions[versions.length - 1].seq).toBe(7);
    expect(new Set(versions.map((v) => v.seq)).size).toBe(versions.length);
  });
});

describe('入库版本派生与旧数据兼容（TC05）', () => {
  it('入库版本等于当前版时派生为已入库且最新', () => {
    const [artifact] = buildChain(2);
    const deposited: Artifact = {
      ...artifact,
      kbDeposit: { deposited: true, versionId: 'v2' },
    };
    expect(deriveArtifactDepositState(deposited)).toEqual({ status: 'latest', depositedSeq: 2 });
  });

  it('入库版本不是当前版时派生出已入库版本序号、当前版本序号与可沉淀最新版标记', () => {
    const [artifact] = buildChain(3);
    const deposited: Artifact = {
      ...artifact,
      kbDeposit: { deposited: true, versionId: 'v1' },
    };
    expect(deriveArtifactDepositState(deposited)).toEqual({
      status: 'stale',
      depositedSeq: 1,
      currentSeq: 3,
      canDepositLatest: true,
    });
  });

  it('老数据没有版本链字段时视为只有 1 个版本，当前版内容等于原 content', () => {
    const legacy: Artifact = {
      id: 'old',
      type: 'markdown',
      title: '旧产物',
      content: '老正文',
      status: 'complete',
      createdAt: 123,
    };
    const versions = getArtifactVersions(legacy);
    expect(versions).toHaveLength(1);
    expect(versions[0].content).toBe('老正文');
    expect(versions[0].seq).toBe(1);
    expect(deriveArtifactDepositState(legacy)).toEqual({ status: 'none' });
  });

  it('老数据入库信息没有 versionId 时按入库于首版处理，仅 1 个版本时为最新，追加新版本后提示有新版本', () => {
    const legacy: Artifact = {
      id: 'old',
      type: 'markdown',
      title: '旧产物',
      content: '老正文',
      status: 'complete',
      kbDeposit: { deposited: true, knowledgeBaseId: 'kb1' },
    };
    expect(deriveArtifactDepositState(legacy)).toEqual({ status: 'latest', depositedSeq: 1 });

    const next = run(generate('老正文被改写', 'complete', 'old'), [legacy], 3000);
    const state = deriveArtifactDepositState(next[0]);
    expect(state).toEqual({ status: 'stale', depositedSeq: 1, currentSeq: 2, canDepositLatest: true });
    expect(next[0].kbDeposit?.knowledgeBaseId).toBe('kb1');
  });

  it('被淘汰的版本曾是入库版本时仍可派生已入库 vN 且当前有新版本，不抛异常', () => {
    const [artifact] = buildChain(6);
    expect(getArtifactVersions(artifact).some((v) => v.seq === 2)).toBe(false);
    const deposited: Artifact = {
      ...artifact,
      kbDeposit: { deposited: true, versionId: 'v2' },
    };
    expect(deriveArtifactDepositState(deposited)).toEqual({
      status: 'stale',
      depositedSeq: 2,
      currentSeq: 6,
      canDepositLatest: true,
    });
  });

  it('未入库的产物派生为 none', () => {
    const [artifact] = buildChain(2);
    expect(deriveArtifactDepositState(artifact)).toEqual({ status: 'none' });
  });
});

describe('存储超配额降级的版本淘汰（TC07 配套）', () => {
  it('淘汰最旧的中间版本并保留首版与当前版', () => {
    const [artifact] = buildChain(5);
    const dropped = dropOldestArtifactVersion(artifact);
    expect(dropped).not.toBeNull();
    expect(getArtifactVersions(dropped!).map((v) => v.seq)).toEqual([1, 3, 4, 5]);
    expect(dropped!.content).toBe(artifact.content);
  });

  it('仅剩首版与当前版（或更少）时无可淘汰，返回 null', () => {
    expect(dropOldestArtifactVersion(buildChain(2)[0])).toBeNull();
    expect(dropOldestArtifactVersion(buildChain(1)[0])).toBeNull();
    const legacy: Artifact = { id: 'o', type: 'markdown', title: 't', content: 'c', status: 'complete' };
    expect(dropOldestArtifactVersion(legacy)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 章节补丁（TC01 / TC02）
// ---------------------------------------------------------------------------

const DOC = [
  '# 研报',
  '',
  '## 第一章 背景',
  '背景正文',
  '',
  '## 第二章 方案',
  '方案正文',
  '### 2.1 细节',
  '细节正文',
  '',
  '## 第三章 结论',
  '结论正文',
  '',
].join('\n');

/** 构造一个章节补丁事件序列：start(section) → delta → end */
function patch(
  section: string,
  body: string,
  status: 'complete' | 'error' = 'complete',
  id = ID
): ChatStreamEvent[] {
  return [
    { type: 'artifact_start', artifact: { id, type: 'markdown', title: '研报', section } },
    { type: 'artifact_delta', id, delta: body },
    { type: 'artifact_end', id, status },
  ];
}

/** 以 DOC 为 v1 的初始状态 */
function baseState(doc = DOC): Artifact[] {
  return run(generate(doc));
}

describe('章节补丁精确定位与应用（TC01）', () => {
  it('替换第二章后第一章与第三章字节级不变，第二章内容为补丁正文，产生一个补丁来源的新版本', () => {
    const before = DOC.slice(0, DOC.indexOf('## 第二章'));
    const after = DOC.slice(DOC.indexOf('## 第三章'));
    const state = run(patch('## 第二章 方案', '\n## 第二章 方案\n新的方案正文\n'), baseState(), 5000);
    const art = state[0];
    expect(art.status).toBe('complete');
    expect(art.content).toBe(`${before}## 第二章 方案\n新的方案正文\n\n${after}`);
    expect(art.content.startsWith(before)).toBe(true);
    expect(art.content.endsWith(after)).toBe(true);
    const versions = getArtifactVersions(art);
    expect(versions).toHaveLength(2);
    expect(versions[1].source).toEqual({ kind: 'patch' });
    expect(versions[0].content).toBe(DOC);
    expect(art.patchReport).toEqual([{ section: '## 第二章 方案', status: 'applied' }]);
  });

  it('被替换章节含子章节时子章节随之整体替换，下一个同级标题之后的内容不受影响', () => {
    const state = run(patch('## 第二章 方案', '## 第二章 方案\n精简版\n'), baseState());
    expect(state[0].content).not.toContain('细节正文');
    expect(state[0].content).not.toContain('### 2.1 细节');
    expect(state[0].content).toContain('## 第三章 结论\n结论正文\n');
    expect(state[0].content).toContain('## 第一章 背景\n背景正文\n');
  });

  it('补丁只替换到下一个同级或更高级标题之前：替换子章节时同级与上级内容保持不变', () => {
    const state = run(patch('### 2.1 细节', '### 2.1 细节\n新细节\n'), baseState());
    expect(state[0].content).toContain('## 第二章 方案\n方案正文\n### 2.1 细节\n新细节\n\n## 第三章 结论');
    expect(state[0].content).not.toContain('细节正文');
  });

  it('section 与目录标题仅在首尾空白或连续空格上不同时仍能命中', () => {
    const state = run(patch('  ##  第二章   方案  ', '## 第二章 方案\n新内容\n'), baseState());
    expect(state[0].content).toContain('新内容');
    expect(state[0].patchReport).toEqual([{ section: '  ##  第二章   方案  ', status: 'applied' }]);
  });

  it('全角标点与半角标点不同的标题判失败，不做模糊匹配，当前版保持不变', () => {
    const doc = '# 文档\n\n## 第二章：概述\n正文\n';
    const initial = baseState(doc);
    const state = run(patch('## 第二章:概述', '## 第二章:概述\n新内容\n'), initial);
    expect(state[0].content).toBe(doc);
    expect(getArtifactVersions(state[0])).toHaveLength(1);
    expect(state[0].patchReport).toEqual([
      { section: '## 第二章:概述', status: 'failed', reason: 'not-found' },
    ]);
  });

  it('代码围栏内以 # 开头的行不计入标题目录，对其定位判找不到；围栏内的 # 也不截断所在章节', () => {
    const doc = ['# 文档', '', '## 脚本', '```bash', '# 注释行', '## 伪标题', '```', '尾巴', '', '## 结尾', '结尾正文', ''].join('\n');
    const initial = baseState(doc);
    const missed = run(patch('# 注释行', '# 注释行\n新\n'), initial);
    expect(missed[0].content).toBe(doc);
    expect(missed[0].patchReport?.[0]).toEqual({ section: '# 注释行', status: 'failed', reason: 'not-found' });

    const fenced = run(patch('## 伪标题', '## 伪标题\n新\n'), initial);
    expect(fenced[0].patchReport?.[0]).toMatchObject({ status: 'failed', reason: 'not-found' });

    // 整章替换时围栏及其内部的伪标题一并被替换，不会残留
    const replaced = run(patch('## 脚本', '## 脚本\n无代码\n'), initial);
    expect(replaced[0].content).toBe(['# 文档', '', '## 脚本', '无代码', '', '## 结尾', '结尾正文', ''].join('\n'));
  });

  it('找不到标题、标题重复、补丁正文不以标题行开头三种失败原因可区分，且当前版与版本链不变', () => {
    const dupDoc = '# 文档\n\n## 总结\n甲\n\n## 其他\n乙\n\n## 总结\n丙\n';
    const dup = run(patch('## 总结', '## 总结\n新\n'), baseState(dupDoc));
    expect(dup[0].content).toBe(dupDoc);
    expect(dup[0].patchReport).toEqual([{ section: '## 总结', status: 'failed', reason: 'duplicate' }]);

    const missing = run(patch('## 第九章 不存在', '## 第九章 不存在\n新\n'), baseState());
    expect(missing[0].content).toBe(DOC);
    expect(missing[0].patchReport).toEqual([
      { section: '## 第九章 不存在', status: 'failed', reason: 'not-found' },
    ]);

    const noHeading = run(patch('## 第二章 方案', '只有正文，没有标题行\n'), baseState());
    expect(noHeading[0].content).toBe(DOC);
    expect(noHeading[0].patchReport).toEqual([
      { section: '## 第二章 方案', status: 'failed', reason: 'not-heading-start' },
    ]);

    // 补丁以另一个标题行开头也算没有以目标标题开头
    const otherHeading = run(patch('## 第二章 方案', '## 第三章 结论\n新\n'), baseState());
    expect(otherHeading[0].patchReport?.[0]).toMatchObject({ status: 'failed', reason: 'not-heading-start' });

    for (const state of [dup, missing, noHeading, otherHeading]) {
      expect(state[0].status).toBe('complete');
      expect(getArtifactVersions(state[0])).toHaveLength(1);
    }
  });

  it('非 Markdown 类型收到带 section 的补丁时退回整篇替换，不抛异常', () => {
    const codeEvents = (body: string): ChatStreamEvent[] => [
      { type: 'artifact_start', artifact: { id: 'code', type: 'code', title: '脚本', language: 'ts', section: '## x' } },
      { type: 'artifact_delta', id: 'code', delta: body },
      { type: 'artifact_end', id: 'code', status: 'complete' },
    ];
    let state = run(generate('const a = 1;', 'complete', 'code', 'code'));
    expect(() => {
      state = run(codeEvents('const b = 2;'), state);
    }).not.toThrow();
    expect(state[0].content).toBe('const b = 2;');
    expect(getArtifactVersions(state[0])).toHaveLength(2);
    expect(getArtifactVersions(state[0])[1].source).toEqual({ kind: 'generated' });
  });

  it('无任何标题的短 Markdown 收到带 section 的补丁时退回整篇替换', () => {
    const initial = baseState('只是一小段没有标题的文字');
    const state = run(patch('## 任意', '整篇改写后的文字'), initial);
    expect(state[0].content).toBe('整篇改写后的文字');
    expect(getArtifactVersions(state[0])).toHaveLength(2);
    expect(state[0].patchReport).toBeUndefined();
  });

  it('补丁流式期间正文保持当前版，增量只进入补丁草稿；error 收尾丢弃草稿并保留当前版', () => {
    let state = baseState();
    state = run(
      [
        { type: 'artifact_start', artifact: { id: ID, type: 'markdown', title: '研报', section: '## 第二章 方案' } },
        { type: 'artifact_delta', id: ID, delta: '## 第二章 方案\n写了一半' },
      ],
      state
    );
    expect(state[0].status).toBe('streaming');
    expect(state[0].content).toBe(DOC);
    expect(state[0].patchDraft).toEqual({ section: '## 第二章 方案', content: '## 第二章 方案\n写了一半' });

    const aborted = finalizeStreamingArtifacts(state);
    expect(aborted[0].status).toBe('complete');
    expect(aborted[0].content).toBe(DOC);
    expect(aborted[0].patchDraft).toBeUndefined();
    expect(aborted[0].notice).toBe('draft-discarded');
    expect(getArtifactVersions(aborted[0])).toHaveLength(1);

    const errored = applyArtifactEvent(state, { type: 'artifact_end', id: ID, status: 'error' }, 9000);
    expect(errored[0].content).toBe(DOC);
    expect(errored[0].patchDraft).toBeUndefined();
    expect(errored[0].notice).toBe('draft-discarded');
  });
});

describe('多补丁合并与部分失败独立（TC02）', () => {
  const ch1 = patch('## 第一章 背景', '## 第一章 背景\n背景改写一\n');
  const ch2 = patch('## 第二章 方案', '## 第二章 方案\n方案改写二，内容比原来长很多很多很多很多很多\n');
  const ch3 = patch('## 第三章 结论', '## 第三章 结论\n结论改写三\n');

  it('同一轮三个成功补丁只产生一个新版本，来源为补丁合并', () => {
    const state = run([...ch1, ...ch2, ...ch3], baseState());
    const versions = getArtifactVersions(state[0]);
    expect(versions).toHaveLength(2);
    expect(versions[1].source).toEqual({ kind: 'patch' });
    expect(state[0].content).toBe(versions[1].content);
    expect(state[0].content).toContain('背景改写一');
    expect(state[0].content).toContain('方案改写二');
    expect(state[0].content).toContain('结论改写三');
    expect(state[0].patchReport).toHaveLength(3);
    expect(state[0].patchReport?.every((r) => r.status === 'applied')).toBe(true);
  });

  it('前一个补丁改变章节长度后，后一个补丁仍按标题行重新查找并命中正确章节', () => {
    const state = run([...ch2, ...ch3, ...ch1], baseState());
    expect(state[0].content).toBe(
      [
        '# 研报',
        '',
        '## 第一章 背景',
        '背景改写一',
        '',
        '## 第二章 方案',
        '方案改写二，内容比原来长很多很多很多很多很多',
        '',
        '## 第三章 结论',
        '结论改写三',
        '',
      ].join('\n')
    );
  });

  it('中间补丁标题抄错时其余补丁生效，结果逐个给出成败与原因，合并版本不含失败补丁内容', () => {
    const bad = patch('## 第二章 方桉', '## 第二章 方桉\n错误补丁内容\n');
    const state = run([...ch1, ...bad, ...ch3], baseState());
    expect(state[0].patchReport).toEqual([
      { section: '## 第一章 背景', status: 'applied' },
      { section: '## 第二章 方桉', status: 'failed', reason: 'not-found' },
      { section: '## 第三章 结论', status: 'applied' },
    ]);
    expect(state[0].content).toContain('背景改写一');
    expect(state[0].content).toContain('结论改写三');
    expect(state[0].content).toContain('方案正文');
    expect(state[0].content).not.toContain('错误补丁内容');
    expect(getArtifactVersions(state[0])).toHaveLength(2);
  });

  it('三个补丁全部失败时不产生新版本，当前版不变', () => {
    const bads = [
      ...patch('## 不存在甲', '## 不存在甲\n甲\n'),
      ...patch('## 不存在乙', '## 不存在乙\n乙\n'),
      ...patch('## 第二章 方案', '没有标题的正文'),
    ];
    const state = run(bads, baseState());
    expect(state[0].content).toBe(DOC);
    expect(getArtifactVersions(state[0])).toHaveLength(1);
    expect(state[0].patchReport?.map((r) => r.status)).toEqual(['failed', 'failed', 'failed']);
  });

  it('两个补丁指向同一章节时后者覆盖前者，两项均成功且只产生一个新版本', () => {
    const first = patch('## 第二章 方案', '## 第二章 方案\n先写的\n');
    const second = patch('## 第二章 方案', '## 第二章 方案\n后写的\n');
    const state = run([...first, ...second], baseState());
    expect(state[0].content).toContain('后写的');
    expect(state[0].content).not.toContain('先写的');
    expect(state[0].patchReport?.map((r) => r.status)).toEqual(['applied', 'applied']);
    expect(getArtifactVersions(state[0])).toHaveLength(2);
  });

  it('新一轮开始后的补丁产生新的版本而不是并入上一轮，且上一轮的结果报告被清除', () => {
    let state = run(ch1, baseState());
    expect(getArtifactVersions(state[0])).toHaveLength(2);
    state = beginArtifactTurn(state);
    expect(state[0].patchReport).toBeUndefined();
    state = run(ch3, state);
    const versions = getArtifactVersions(state[0]);
    expect(versions).toHaveLength(3);
    expect(versions[1].content).toContain('背景改写一');
    expect(versions[1].content).not.toContain('结论改写三');
    expect(versions[2].content).toContain('结论改写三');
  });

  it('没有补丁状态可清理时 beginArtifactTurn 原样返回同一数组', () => {
    const state = baseState();
    expect(beginArtifactTurn(state)).toBe(state);
  });
});

describe('章节区间定位 findSectionRange（就地预览与改动高亮，工单 07）', () => {
  const doc = '# 研报\n\n## 第一章\n一\n### 1.1 小节\n小\n\n## 第二章\n二\n\n```md\n## 第二章\n```\n';

  it('返回标题行至下一个同级或更高级标题之间的区间（含子章节）', () => {
    const range = findSectionRange(doc, '## 第一章');
    expect(range).not.toBeNull();
    const text = doc.slice(range!.start, range!.end);
    expect(text.startsWith('## 第一章')).toBe(true);
    expect(text).toContain('### 1.1 小节');
    expect(text).not.toContain('## 第二章');
  });

  it('仅忽略首尾空白与连续空格；找不到时返回 null', () => {
    expect(findSectionRange(doc, '  ##  第一章 ')).not.toBeNull();
    expect(findSectionRange(doc, '## 第九章')).toBeNull();
  });

  it('代码围栏内的同名标题不计入，故「第二章」唯一可定位；真正重复的标题返回 null', () => {
    expect(findSectionRange(doc, '## 第二章')).not.toBeNull();
    expect(findSectionRange('## A\n1\n## A\n2\n', '## A')).toBeNull();
  });
});
