import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion } from './rrf';

describe('RRF (Reciprocal Rank Fusion) 排名融合算法单测', () => {
  it('1. 手算对拍基准用例（k=60）：精准匹配手算理论得分与位次', () => {
    // 构造测试数据：
    // Doc A: dense 第 1 名，lexical 第 2 名
    //   -> 1 / (60 + 1) + 1 / (60 + 2) = 1/61 + 1/62 = 0.0163934426 + 0.0161290322 = 0.0325224748
    // Doc B: dense 第 2 名，lexical 第 1 名
    //   -> 1 / (60 + 2) + 1 / (60 + 1) = 1/62 + 1/61 = 0.0325224748 (得分并列)
    // Doc C: dense 第 1 名且 lexical 第 1 名 (双榜首)
    //   -> 1 / (60 + 1) + 1 / (60 + 1) = 2 / 61 = 0.0327868852
    // Doc D: dense 第 3 名，lexical 未命中
    //   -> 1 / (60 + 3) = 1/63 = 0.0158730158
    // Doc E: dense 未命中，lexical 第 3 名
    //   -> 1 / (60 + 3) = 1/63 = 0.0158730158

    const denseList = [
      { id: 'doc_C', item: { text: '双榜首文档' }, score: 0.99 },
      { id: 'doc_A', item: { text: '文档 A' }, score: 0.88 },
      { id: 'doc_B', item: { text: '文档 B' }, score: 0.77 },
      { id: 'doc_D', item: { text: '仅向量命中' }, score: 0.66 },
    ];

    const lexicalList = [
      { id: 'doc_C', item: { text: '双榜首文档' }, score: 15.5 },
      { id: 'doc_B', item: { text: '文档 B' }, score: 10.2 },
      { id: 'doc_A', item: { text: '文档 A' }, score: 8.1 },
      { id: 'doc_E', item: { text: '仅词法命中' }, score: 5.0 },
    ];

    const fused = reciprocalRankFusion({
      denseList,
      lexicalList,
      k: 60,
    });

    expect(fused.length).toBe(5);

    // 第一名应为 doc_C (双榜首)
    expect(fused[0].id).toBe('doc_C');
    expect(fused[0].denseRank).toBe(1);
    expect(fused[0].lexicalRank).toBe(1);
    const expectedScoreC = 1 / 61 + 1 / 61;
    expect(fused[0].score).toBeCloseTo(expectedScoreC, 8);

    // 第二名与第三名为 doc_A 与 doc_B (得分完全一致)
    // 由于 doc_A 在 dense 中比 doc_B 先出现，根据出现顺序稳定排序规则：doc_A 靠前
    expect(fused[1].id).toBe('doc_A');
    expect(fused[1].denseRank).toBe(2);
    expect(fused[1].lexicalRank).toBe(3);
    const expectedScoreA = 1 / 62 + 1 / 63;
    expect(fused[1].score).toBeCloseTo(expectedScoreA, 8);

    expect(fused[2].id).toBe('doc_B');
    expect(fused[2].denseRank).toBe(3);
    expect(fused[2].lexicalRank).toBe(2);
    const expectedScoreB = 1 / 63 + 1 / 62;
    expect(fused[2].score).toBeCloseTo(expectedScoreB, 8);

    // 第四名与第五名：doc_D (dense 第 4 名) vs doc_E (lexical 第 4 名)
    // doc_D: 1/(60+4) = 1/64
    // doc_E: 1/(60+4) = 1/64
    expect(fused[3].id).toBe('doc_D');
    expect(fused[3].denseRank).toBe(4);
    expect(fused[3].lexicalRank).toBeNull();
    expect(fused[3].score).toBeCloseTo(1 / 64, 8);

    expect(fused[4].id).toBe('doc_E');
    expect(fused[4].denseRank).toBeNull();
    expect(fused[4].lexicalRank).toBe(4);
    expect(fused[4].score).toBeCloseTo(1 / 64, 8);
  });

  it('2. 融合过程绝不跨路比较原始分数，纯粹由位次 rank 决定', () => {
    // 假设 lexical 原始打分极其夸张（如 999999），而 dense 打分很低（0.001）
    // 但两路各自都只有 1 个候选
    const denseList = [
      { id: 'doc_dense_top', item: { name: 'dense_1' }, score: 0.0001 },
    ];
    const lexicalList = [
      { id: 'doc_lexical_top', item: { name: 'lexical_1' }, score: 99999999 },
    ];

    const fused = reciprocalRankFusion({
      denseList,
      lexicalList,
      k: 60,
    });

    expect(fused.length).toBe(2);
    // 两者都是各自路的第一名，因此 score 均为 1 / (60 + 1)
    expect(fused[0].score).toBeCloseTo(1 / 61, 8);
    expect(fused[1].score).toBeCloseTo(1 / 61, 8);
    // 原始分数不影响 RRF 得分
    expect(fused[0].score).toEqual(fused[1].score);
  });

  it('3. 边界条件处理：双路为空、单路为空', () => {
    // 两路均为空
    const emptyResult = reciprocalRankFusion({
      denseList: [],
      lexicalList: [],
    });
    expect(emptyResult).toEqual([]);

    // 仅 dense 有结果
    const denseOnly = reciprocalRankFusion({
      denseList: [
        { id: 'd1', item: 'A', score: 0.9 },
        { id: 'd2', item: 'B', score: 0.8 },
      ],
      lexicalList: [],
      k: 60,
    });
    expect(denseOnly.length).toBe(2);
    expect(denseOnly[0].id).toBe('d1');
    expect(denseOnly[0].score).toBeCloseTo(1 / 61, 8);
    expect(denseOnly[0].lexicalRank).toBeNull();
    expect(denseOnly[1].id).toBe('d2');
    expect(denseOnly[1].score).toBeCloseTo(1 / 62, 8);
    expect(denseOnly[1].lexicalRank).toBeNull();

    // 仅 lexical 有结果
    const lexicalOnly = reciprocalRankFusion({
      denseList: [],
      lexicalList: [{ id: 'l1', item: 'Z', score: 10 }],
      k: 60,
    });
    expect(lexicalOnly.length).toBe(1);
    expect(lexicalOnly[0].id).toBe('l1');
    expect(lexicalOnly[0].denseRank).toBeNull();
    expect(lexicalOnly[0].lexicalRank).toBe(1);
    expect(lexicalOnly[0].score).toBeCloseTo(1 / 61, 8);
  });

  it('4. 自定义平滑常数 k 验证', () => {
    const denseList = [{ id: 'doc1', item: {}, score: 1.0 }];
    const lexicalList = [{ id: 'doc1', item: {}, score: 1.0 }];

    // k = 10 -> score = 1 / (10 + 1) + 1 / (10 + 1) = 2 / 11
    const fusedK10 = reciprocalRankFusion({
      denseList,
      lexicalList,
      k: 10,
    });
    expect(fusedK10[0].score).toBeCloseTo(2 / 11, 8);

    // k <= 0 抛错校验
    expect(() =>
      reciprocalRankFusion({
        denseList,
        lexicalList,
        k: 0,
      })
    ).toThrowError(/必须为正数/);

    expect(() =>
      reciprocalRankFusion({
        denseList,
        lexicalList,
        k: -5,
      })
    ).toThrowError(/必须为正数/);
  });
});
