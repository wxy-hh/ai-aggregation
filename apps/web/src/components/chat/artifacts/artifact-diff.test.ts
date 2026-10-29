import { describe, it, expect } from 'vitest';
import { buildUnifiedDiff } from './artifact-diff';

describe('buildUnifiedDiff 统一视图差异计算 (ADR-0037 §7 / TC09)', () => {
  it('[TC09-2] 区分新增行、删除行与未改行，未改行不带标记，删除在前新增在后', () => {
    const oldText = '# 标题\n第一段\n第二段\n';
    const newText = '# 标题\n第一段\n第二段改\n第三段\n';
    const lines = buildUnifiedDiff(oldText, newText);

    expect(lines.map((l) => [l.type, l.text])).toEqual([
      ['unchanged', '# 标题'],
      ['unchanged', '第一段'],
      ['removed', '第二段'],
      ['added', '第二段改'],
      ['added', '第三段'],
    ]);
  });

  it('[TC09-3] 同一行只改少数字符时，仅变化字符被行内高亮，未变化字符不在高亮片段内', () => {
    const lines = buildUnifiedDiff('本季度营收同比增长 12%，利润稳定。', '本季度营收同比增长 15%，利润稳定。');
    const removed = lines.find((l) => l.type === 'removed')!;
    const added = lines.find((l) => l.type === 'added')!;

    expect(removed.segments.filter((s) => s.highlight).map((s) => s.text)).toEqual(['2']);
    expect(added.segments.filter((s) => s.highlight).map((s) => s.text)).toEqual(['5']);
    // 片段拼回即原行文本，未变化部分不含高亮
    expect(added.segments.map((s) => s.text).join('')).toBe('本季度营收同比增长 15%，利润稳定。');
    expect(added.segments.filter((s) => !s.highlight).map((s) => s.text).join('')).toBe('本季度营收同比增长 1%，利润稳定。');
  });

  it('两行几乎完全不同时不做行内高亮（整行标记即可，避免满屏碎片）', () => {
    const lines = buildUnifiedDiff('苹果香蕉橘子\n', '完全不同的另一句话\n');
    const changed = lines.filter((l) => l.type !== 'unchanged');
    expect(changed).toHaveLength(2);
    for (const line of changed) {
      expect(line.segments).toEqual([{ text: line.text, highlight: false }]);
    }
  });

  it('内容完全相同时全部为未改行', () => {
    const lines = buildUnifiedDiff('a\nb\n', 'a\nb\n');
    expect(lines.every((l) => l.type === 'unchanged')).toBe(true);
    expect(lines).toHaveLength(2);
  });

  it('保留空行：新增空行显示为一条空的新增行', () => {
    const lines = buildUnifiedDiff('a\nb\n', 'a\n\nb\n');
    expect(lines.map((l) => [l.type, l.text])).toEqual([
      ['unchanged', 'a'],
      ['added', ''],
      ['unchanged', 'b'],
    ]);
  });
});
