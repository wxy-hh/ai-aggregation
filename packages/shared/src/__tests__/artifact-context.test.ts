import { describe, it, expect } from 'vitest';
import type { Artifact } from '../chat-stream-contract';
import {
  ARTIFACT_MARKDOWN_INJECT_LIMIT,
  ARTIFACT_OTHER_INJECT_LIMIT,
  buildArtifactContextRequest,
  resolveArtifactContext,
} from '../artifact-context';

const art = (over: Partial<Artifact> & { id: string }): Artifact => ({
  type: 'markdown',
  title: `标题-${over.id}`,
  content: '# 文档\n\n## 第一章\n正文\n',
  status: 'complete',
  ...over,
});

/** 构造指定字符数、带标题结构的 Markdown */
const mdOfLength = (n: number) => `# 文档\n\n## 第一章\n${'字'.repeat(n - '# 文档\n\n## 第一章\n'.length)}`;

describe('客户端构造产物上下文请求', () => {
  it('没有完成态的非图片产物时返回 undefined（请求体保持原样）', () => {
    expect(buildArtifactContextRequest({ artifacts: [], activeArtifactId: null, isWorkspaceOpen: true })).toBeUndefined();
    const only = [art({ id: 'a', status: 'error' }), art({ id: 'b', type: 'image' })];
    expect(buildArtifactContextRequest({ artifacts: only, activeArtifactId: 'a', isWorkspaceOpen: true })).toBeUndefined();
  });

  it('工作台关闭时只携带目录，不携带任何产物正文', () => {
    const req = buildArtifactContextRequest({
      artifacts: [art({ id: 'a' }), art({ id: 'b', type: 'code' })],
      activeArtifactId: 'a',
      isWorkspaceOpen: false,
    });
    expect(req).toEqual({
      directory: [
        { id: 'a', type: 'markdown', title: '标题-a' },
        { id: 'b', type: 'code', title: '标题-b' },
      ],
      workspaceOpen: false,
    });
    expect(JSON.stringify(req)).not.toContain('正文');
  });

  it('工作台展开时携带聚焦产物全文；聚焦 id 无效时回退到最后一个产物', () => {
    const artifacts = [art({ id: 'a', content: '甲' }), art({ id: 'b', content: '乙' })];
    expect(
      buildArtifactContextRequest({ artifacts, activeArtifactId: 'a', isWorkspaceOpen: true })?.focus
    ).toMatchObject({ id: 'a', content: '甲' });
    expect(
      buildArtifactContextRequest({ artifacts, activeArtifactId: 'zzz', isWorkspaceOpen: true })?.focus
    ).toMatchObject({ id: 'b', content: '乙' });
  });

  it('聚焦 Markdown 产物带标题目录（标题行原文，跳过围栏内 #）；无标题结构与非 Markdown 不带', () => {
    const md = art({ id: 'm', content: '# 文档\n\n## 第一章\n正文\n\n```sh\n# 注释\n```\n\n## 第二章\n更多\n' });
    const focus = buildArtifactContextRequest({
      artifacts: [md],
      activeArtifactId: 'm',
      isWorkspaceOpen: true,
    })?.focus;
    expect(focus?.outline).toEqual(['# 文档', '## 第一章', '## 第二章']);

    const plain = buildArtifactContextRequest({
      artifacts: [art({ id: 'p', content: '没有标题的短文' })],
      activeArtifactId: 'p',
      isWorkspaceOpen: true,
    })?.focus;
    expect(plain).not.toHaveProperty('outline');
  });
});

describe('服务端复核与注入文本', () => {
  const focusOf = (content: string, type = 'markdown') => ({
    directory: [{ id: 'rpt', type, title: '研报' }],
    workspaceOpen: true,
    focus: { id: 'rpt', type, title: '研报', content },
  });

  it('展开且有聚焦产物时注入 identifier、标题与全文，并附服务端重新解析的标题目录', () => {
    const r = resolveArtifactContext(focusOf('# 文档\n\n## 第一章\n正文\n\n## 第二章\n更多\n'));
    expect(r?.mode).toBe('full');
    expect(r?.text).toContain('identifier=rpt');
    expect(r?.text).toContain('研报');
    expect(r?.text).toContain('更多');
    expect(r?.text).toContain('## 第一章\n## 第二章');
  });

  it('客户端工作台关闭标记或缺少聚焦时只给目录与「先打开工作台」引导，不含正文', () => {
    const closed = resolveArtifactContext({ ...focusOf('绝密正文内容'), workspaceOpen: false });
    expect(closed?.mode).toBe('directory-only');
    expect(closed?.text).toContain('identifier=rpt');
    expect(closed?.text).toContain('打开右侧工作台');
    expect(closed?.text).not.toContain('绝密正文内容');
    expect(closed?.injectedChars).toBe(0);
  });

  it('有标题的 Markdown 恰好 30,000 字符时注入全文，30,001 字符时只给目录并提示拆分或新建', () => {
    const at = resolveArtifactContext(focusOf(mdOfLength(ARTIFACT_MARKDOWN_INJECT_LIMIT)));
    expect(at?.mode).toBe('full');
    expect(at?.injectedChars).toBe(ARTIFACT_MARKDOWN_INJECT_LIMIT);

    const over = resolveArtifactContext(focusOf(mdOfLength(ARTIFACT_MARKDOWN_INJECT_LIMIT + 1)));
    expect(over?.mode).toBe('oversize');
    expect(over?.text).toContain('拆分');
    expect(over?.text).toContain('新建');
    expect(over?.text).not.toContain('字字字字字字');
  });

  it('代码或表格恰好 6,000 字符时注入全文，6,001 字符时只给目录并禁止修改', () => {
    for (const type of ['code', 'table']) {
      const at = resolveArtifactContext(focusOf('x'.repeat(ARTIFACT_OTHER_INJECT_LIMIT), type));
      expect(at?.mode).toBe('full');
      const over = resolveArtifactContext(focusOf('x'.repeat(ARTIFACT_OTHER_INJECT_LIMIT + 1), type));
      expect(over?.mode).toBe('oversize');
      expect(over?.text).toContain('不得修改');
      expect(over?.text).not.toContain('xxxxxxxx');
    }
  });

  it('客户端声称 Markdown 但实际无标题结构时按其余类型上限处理', () => {
    const noHeading = '没有标题的长文'.repeat(1000); // 7,000 字符
    const r = resolveArtifactContext(focusOf(noHeading));
    expect(r?.mode).toBe('oversize');
    expect(r?.text).toContain(String(ARTIFACT_OTHER_INJECT_LIMIT));
    // 围栏内的 # 不算标题结构
    const fenced = resolveArtifactContext(focusOf('```bash\n# 注释\n```\n' + '文'.repeat(6000)));
    expect(fenced?.mode).toBe('oversize');
  });

  it('非法载荷返回 null；非法聚焦字段被忽略，目录条目被清洗截断', () => {
    expect(resolveArtifactContext(undefined)).toBeNull();
    expect(resolveArtifactContext('x')).toBeNull();
    expect(resolveArtifactContext({ directory: [] })).toBeNull();
    expect(resolveArtifactContext({ directory: [{ id: 1, type: 'markdown', title: 't' }] })).toBeNull();

    const r = resolveArtifactContext({
      directory: [{ id: 'a', type: 'markdown', title: '换行\n标题'.padEnd(500, '长') }],
      workspaceOpen: true,
      focus: { id: 'a', type: 'markdown', title: 't', content: 123 },
    });
    expect(r?.mode).toBe('directory-only');
    expect(r?.text).not.toMatch(/标题=换行\n/);
    expect(r?.text.split('\n').find((l) => l.startsWith('- identifier=a'))!.length).toBeLessThan(200);
  });

  it('聚焦产物不在目录里时补入目录；图片类型条目被丢弃', () => {
    const r = resolveArtifactContext({
      directory: [{ id: 'img', type: 'image', title: '图' }],
      workspaceOpen: true,
      focus: { id: 'rpt', type: 'code', title: '脚本', content: 'const a = 1;' },
    });
    expect(r?.mode).toBe('full');
    expect(r?.text).toContain('identifier=rpt');
    expect(r?.text).not.toContain('identifier=img');
  });
});
