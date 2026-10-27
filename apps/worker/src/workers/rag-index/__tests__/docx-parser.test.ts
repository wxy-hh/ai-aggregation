import { describe, it, expect, vi } from 'vitest';
import { parseDocxBuffer } from '../docx-parser';
import { DocumentParseError } from '../parser';
import mammoth from 'mammoth';

describe('Word (.docx) 语义提纯与大纲解析器 (docx-parser)', () => {
  it('正确解析包含多级标题大纲、段落与粗体的 Word 内容，提取 headingPath', async () => {
    // 模拟 mammoth 从 docx 中提取出的语义 HTML
    const fakeHtml = `
      <h1>第一章 总则</h1>
      <p>本规范旨在统一<strong>AI聚合平台</strong>的代码质量与工程规范。</p>
      <h2>第一条 适用范围</h2>
      <p>适用于所有参与平台研发的工程师及自动化智能体。</p>
    `;

    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValueOnce({
      value: fakeHtml,
      messages: [],
    });

    const fakeBuffer = Buffer.from('mock-docx-data');
    const result = await parseDocxBuffer(fakeBuffer, '研发工程规范.docx');

    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.fullMarkdown).toContain('# 第一章 总则');
    expect(result.fullMarkdown).toContain('**AI聚合平台**');
    expect(result.fullMarkdown).toContain('## 第一条 适用范围');

    // 检查切片的 headingPath 标题栈
    const section1 = result.chunks.find((c) => c.content.includes('代码质量'));
    expect(section1).toBeDefined();
    expect(section1!.headingPath).toBe('第一章 总则');

    const section2 = result.chunks.find((c) => c.content.includes('参与平台研发'));
    expect(section2).toBeDefined();
    expect(section2!.headingPath).toBe('第一章 总则 > 第一条 适用范围');

    vi.restoreAllMocks();
  });

  it('Word 内嵌表格与有序/无序列表被准确转换为 GFM Markdown', async () => {
    const fakeHtml = `
      <h2>第二条 审核流程</h2>
      <p>审核步骤如下：</p>
      <ol>
        <li>提交代码审查工单</li>
        <li>运行自动化流水线</li>
      </ol>
      <table>
        <tr><th>审核阶段</th><th>责任人</th></tr>
        <tr><td>阶段1</td><td>架构师</td></tr>
      </table>
    `;

    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValueOnce({
      value: fakeHtml,
      messages: [],
    });

    const fakeBuffer = Buffer.from('mock-docx-data');
    const result = await parseDocxBuffer(fakeBuffer, '审核流程.docx');

    expect(result.fullMarkdown).toContain('提交代码审查工单');
    expect(result.fullMarkdown).toContain('运行自动化流水线');
    expect(result.fullMarkdown).toMatch(/1\.\s+提交代码审查工单/);
    expect(result.fullMarkdown).toContain('| 审核阶段 | 责任人 |');
    expect(result.fullMarkdown).toContain('| 阶段1 | 架构师 |');

    vi.restoreAllMocks();
  });

  it('Word 内嵌插图被安全过滤剥离，不污染切片与 Token 计数', async () => {
    const fakeHtml = `
      <h1>架构图示</h1>
      <p>系统架构概览如下图：</p>
      <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="架构插图" />
      <p>底层基于容器化集群部署。</p>
    `;

    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValueOnce({
      value: fakeHtml,
      messages: [],
    });

    const fakeBuffer = Buffer.from('mock-docx-data');
    const result = await parseDocxBuffer(fakeBuffer, '系统架构.docx');

    // 验证不包含巨型 base64 字符串
    expect(result.fullMarkdown).not.toContain('base64');
    expect(result.fullMarkdown).toContain('底层基于容器化集群部署');

    vi.restoreAllMocks();
  });

  it('空 Word 文档或内容过短时抛出明确致命中文异常', async () => {
    vi.spyOn(mammoth, 'convertToHtml').mockResolvedValueOnce({
      value: '<p></p>',
      messages: [],
    });

    const fakeBuffer = Buffer.from('mock-docx-data');
    await expect(parseDocxBuffer(fakeBuffer, '空白文件.docx')).rejects.toThrow(
      DocumentParseError
    );

    vi.restoreAllMocks();
  });

  it('文件严重损坏或非合规 docx 抛出格式损坏中文异常', async () => {
    vi.spyOn(mammoth, 'convertToHtml').mockRejectedValueOnce(
      new Error('Could not find file in options')
    );

    const fakeBuffer = Buffer.from('corrupted-data');
    await expect(parseDocxBuffer(fakeBuffer, '损坏.docx')).rejects.toThrow(
      'Word 文件损坏或格式不正确'
    );

    vi.restoreAllMocks();
  });
});
