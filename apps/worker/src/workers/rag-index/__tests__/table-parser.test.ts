import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseTableBuffer, parseCsvString } from '../table-parser';
import { RAG_TABLE_CONFIG } from '@repo/shared';

describe('表格结构化解析与表头上下文注入器 (table-parser)', () => {
  it('正确解析 Excel (.xlsx) 包含多 Sheet 并为切片注入表头与工作表上下文', async () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: 研发团队
    const wsDev = XLSX.utils.aoa_to_sheet([
      ['工号', '姓名', '职位', '城市'],
      ['RD001', '张三', '前端架构师', '北京'],
      ['RD002', '李四', '后端工程师', '上海'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsDev, '研发团队');

    // Sheet 2: 市场团队
    const wsMkt = XLSX.utils.aoa_to_sheet([
      ['工号', '姓名', '职位', '城市'],
      ['MK001', '王五', '运营总监', '深圳'],
    ]);
    XLSX.utils.book_append_sheet(wb, wsMkt, '市场团队');

    // Sheet 3: 纯空表（应该被跳过）
    const wsEmpty = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, wsEmpty, '空表');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = await parseTableBuffer(buffer, '公司人员花名册.xlsx');

    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.fullMarkdown).toContain('### 表格: 公司人员花名册.xlsx (工作表: 研发团队)');
    expect(result.fullMarkdown).toContain('### 表格: 公司人员花名册.xlsx (工作表: 市场团队)');
    expect(result.fullMarkdown).not.toContain('工作表: 空表');

    // 检查切片 1 (研发团队)
    const devChunk = result.chunks.find((c) => c.headingPath?.includes('研发团队'));
    expect(devChunk).toBeDefined();
    expect(devChunk!.headingPath).toBe('公司人员花名册.xlsx > 研发团队');
    expect(devChunk!.content).toContain('> 工作簿: 公司人员花名册.xlsx | 工作表: 研发团队');
    expect(devChunk!.content).toContain('| 工号 | 姓名 | 职位 | 城市 |');
    expect(devChunk!.content).toContain('| :--- | :--- | :--- | :--- |');
    expect(devChunk!.content).toContain('| RD001 | 张三 | 前端架构师 | 北京 |');
    expect(devChunk!.contentSegmented).toContain('前端');

    // 检查切片 2 (市场团队)
    const mktChunk = result.chunks.find((c) => c.headingPath?.includes('市场团队'));
    expect(mktChunk).toBeDefined();
    expect(mktChunk!.headingPath).toBe('公司人员花名册.xlsx > 市场团队');
    expect(mktChunk!.content).toContain('| MK001 | 王五 | 运营总监 | 深圳 |');
  });

  it('正确处理 CSV 文本并注入表头自包含切块', async () => {
    const csvContent = `产品编号,产品名称,单价,库存数量
P-101,无线人体工学鼠标,199,500
P-102,机械键盘 (青轴),399,200`;

    const result = await parseCsvString(csvContent, '商品目录.csv');

    expect(result.chunks.length).toBe(1);
    const chunk = result.chunks[0]!;
    expect(chunk.headingPath).toBe('商品目录.csv');
    expect(chunk.content).toContain('> 工作簿: 商品目录.csv');
    expect(chunk.content).toContain('| 产品编号 | 产品名称 | 单价 | 库存数量 |');
    expect(chunk.content).toContain('| P-101 | 无线人体工学鼠标 | 199 | 500 |');
    expect(chunk.tokenCount).toBeGreaterThan(0);
  });

  it('单元格换行清洗与超宽列 (超过 15 列) 修剪保护', async () => {
    const wb = XLSX.utils.book_new();
    const headers = Array.from({ length: 20 }, (_, i) => `字段${i + 1}`);
    const rowData = Array.from({ length: 20 }, (_, i) => (i === 0 ? '首列内容\n换行测试' : `数据${i + 1}`));

    const ws = XLSX.utils.aoa_to_sheet([headers, rowData]);
    XLSX.utils.book_append_sheet(wb, ws, '宽表');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = await parseTableBuffer(buffer, '宽表测试.xlsx');

    expect(result.chunks.length).toBe(1);
    const content = result.chunks[0]!.content;

    // 验证换行符被清洗为空格
    expect(content).not.toContain('首列内容\n换行测试');
    expect(content).toContain('首列内容 换行测试');

    // 验证仅保留前 15 列，第 16 列被裁剪
    expect(content).toContain('字段15');
    expect(content).not.toContain('字段16');
    expect(content).not.toContain('字段20');
  });

  it('超大表格 500 行截断防线生效并追加说明', async () => {
    const wb = XLSX.utils.book_new();
    const headers = ['ID', '指标名称', '数值'];
    // 构造 600 行数据
    const rows = [headers];
    for (let i = 1; i <= 600; i++) {
      rows.push([`ID-${i}`, `指标_${i}`, `${i * 10}`]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, '大数据表');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const result = await parseTableBuffer(buffer, '指标监控.xlsx');

    // 检查所有切片中包含的数据行总数不超过 500 行
    const allContent = result.chunks.map((c) => c.content).join('\n');
    expect(allContent).toContain('ID-500');
    expect(allContent).not.toContain('ID-501');
    expect(allContent).not.toContain('ID-600');

    // 尾部包含截断提示
    expect(allContent).toContain('仅收录前 500 行');
  });
});
