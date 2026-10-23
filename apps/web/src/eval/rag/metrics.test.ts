/**
 * RAG 评测指标手算对拍单元测试 (apps/web/src/eval/rag/metrics.test.ts)
 *
 * 验收标准：
 * 1. 严格数学推导手算对拍：
 *    - 样本位次为 [2, 1, 0] 时，MRR = (1/2 + 1/1 + 0) / 3 = 1.5 / 3 = 0.5000
 *    - Hit@1 = (0 + 1 + 0) / 3 = 0.3333
 *    - Hit@3 = (1 + 1 + 0) / 3 = 0.6667
 * 2. 引用准确率手算对拍：
 *    - 正文包含 [^1]、[^2]、[^9]，有效切片仅为 [^1]、[^2]，准确率 = 2 / 3 ≈ 0.6667
 * 3. 拒答率手算对拍：
 *    - 4 道不可答用例，3 道如实表明“知识库中未提及”，1 道编造答案，拒答率 = 3 / 4 = 0.7500
 * 4. 业务键三元组 (documentName, documentVersion, chunkIndex) 匹配边界验证
 */

import { describe, it, expect } from 'vitest';
import {
  calculateHitRateAtK,
  calculateMRR,
  calculateReciprocalRank,
  calculateCitationAccuracy,
  calculateBatchCitationAccuracy,
  calculateRejectionRate,
  isAnchorMatch,
  isHitAtK,
  isRejectionResponse,
  type GoldenAnchor,
  type RetrievedItem,
  type RetrievalEvalSample,
  type RejectionEvalSample,
} from './metrics';

describe('RAG 核心指标手算对拍与边界测试 (Metrics Verification)', () => {
  describe('1. 三元组锚点匹配逻辑 isAnchorMatch', () => {
    const golden: GoldenAnchor = {
      documentName: '0008-tool-execution-pipeline-deep-module.md',
      documentVersion: 2,
      chunkIndex: 3,
    };

    it('全等三元组必须匹配成功', () => {
      const retrieved: RetrievedItem = {
        documentName: '0008-tool-execution-pipeline-deep-module.md',
        documentVersion: 2,
        chunkIndex: 3,
      };
      expect(isAnchorMatch(retrieved, golden)).toBe(true);
    });

    it('支持大小写不敏感与相对前导路径规范化', () => {
      const retrieved: RetrievedItem = {
        documentName: 'docs/adr/0008-Tool-Execution-Pipeline-Deep-Module.MD',
        documentVersion: 2,
        chunkIndex: 3,
      };
      expect(isAnchorMatch(retrieved, golden)).toBe(true);
    });

    it('版本号不匹配时必须拒绝', () => {
      const retrieved: RetrievedItem = {
        documentName: '0008-tool-execution-pipeline-deep-module.md',
        documentVersion: 1, // 旧版本切片
        chunkIndex: 3,
      };
      expect(isAnchorMatch(retrieved, golden)).toBe(false);
    });

    it('切片索引 chunkIndex 不匹配时必须拒绝', () => {
      const retrieved: RetrievedItem = {
        documentName: '0008-tool-execution-pipeline-deep-module.md',
        documentVersion: 2,
        chunkIndex: 4, // 另一段切片
      };
      expect(isAnchorMatch(retrieved, golden)).toBe(false);
    });

    it('金标未指定版本或切片索引时，视为文档级宽松匹配', () => {
      const docLevelGolden: GoldenAnchor = {
        documentName: '0008-tool-execution-pipeline-deep-module.md',
      };
      const retrieved: RetrievedItem = {
        documentName: '0008-tool-execution-pipeline-deep-module.md',
        documentVersion: 5,
        chunkIndex: 12,
      };
      expect(isAnchorMatch(retrieved, docLevelGolden)).toBe(true);
    });
  });

  describe('2. 单题与批次 HitRate@K 手算对拍', () => {
    const goldA: GoldenAnchor = { documentName: 'docA.md', chunkIndex: 0 };
    const goldB: GoldenAnchor = { documentName: 'docB.md', chunkIndex: 1 };

    it('单题 Hit@K 判定：首位、中位与越界', () => {
      const retrieved: RetrievedItem[] = [
        { documentName: 'other1.md' },
        { documentName: 'docA.md', chunkIndex: 0 },
        { documentName: 'other2.md' },
      ];

      // 金标在位次 2 (index 1)
      expect(isHitAtK(retrieved, [goldA], 1)).toBe(false);
      expect(isHitAtK(retrieved, [goldA], 2)).toBe(true);
      expect(isHitAtK(retrieved, [goldA], 5)).toBe(true);
      expect(calculateHitRateAtK(retrieved, [goldA], 1)).toBe(0.0);
      expect(calculateHitRateAtK(retrieved, [goldA], 2)).toBe(1.0);
    });

    it('批次 Hit@1 与 Hit@3 手算推导严格对拍', () => {
      /**
       * 手算数据集设计：
       * - Query 1: 金标在第 2 位 (未命中 Hit@1，命中 Hit@3)
       * - Query 2: 金标在第 1 位 (命中 Hit@1，命中 Hit@3)
       * - Query 3: 未命中任何金标 (未命中 Hit@1，未命中 Hit@3)
       *
       * 理论手算结果：
       * - Hit@1 = (0 + 1 + 0) / 3 = 1 / 3 ≈ 0.3333
       * - Hit@2 = (1 + 1 + 0) / 3 = 2 / 3 ≈ 0.6667
       * - Hit@3 = (1 + 1 + 0) / 3 = 2 / 3 ≈ 0.6667
       */
      const samples: RetrievalEvalSample[] = [
        {
          query: 'Q1: 熔断机制阈值是多少？',
          retrievedList: [
            { documentName: 'other.md', chunkIndex: 0 },
            { documentName: 'docA.md', chunkIndex: 0 }, // 命中 rank=2
            { documentName: 'docC.md', chunkIndex: 0 },
          ],
          goldenList: [goldA],
        },
        {
          query: 'Q2: CapabilityPack 如何定义？',
          retrievedList: [
            { documentName: 'docB.md', chunkIndex: 1 }, // 命中 rank=1
            { documentName: 'other.md', chunkIndex: 0 },
            { documentName: 'docC.md', chunkIndex: 0 },
          ],
          goldenList: [goldB],
        },
        {
          query: 'Q3: 知识库未收录的问题',
          retrievedList: [
            { documentName: 'other1.md', chunkIndex: 0 },
            { documentName: 'other2.md', chunkIndex: 0 },
            { documentName: 'other3.md', chunkIndex: 0 },
          ],
          goldenList: [{ documentName: 'docTarget.md', chunkIndex: 0 }],
        },
      ];

      expect(calculateHitRateAtK(samples, 1)).toBe(0.3333);
      expect(calculateHitRateAtK(samples, 2)).toBe(0.6667);
      expect(calculateHitRateAtK(samples, 3)).toBe(0.6667);
      expect(calculateHitRateAtK(samples, 5)).toBe(0.6667);
    });
  });

  describe('3. MRR (平均倒数排名) 手算推导严格对拍', () => {
    it('单条 Reciprocal Rank 推导', () => {
      const gold: GoldenAnchor = { documentName: 'target.md', chunkIndex: 0 };

      // 命中第 1 位: 1 / 1 = 1.0
      expect(
        calculateReciprocalRank([{ documentName: 'target.md', chunkIndex: 0 }], [gold])
      ).toBe(1.0);

      // 命中第 2 位: 1 / 2 = 0.5
      expect(
        calculateReciprocalRank(
          [{ documentName: 'noise.md' }, { documentName: 'target.md', chunkIndex: 0 }],
          [gold]
        )
      ).toBe(0.5);

      // 命中第 3 位: 1 / 3 ≈ 0.333333
      expect(
        calculateReciprocalRank(
          [
            { documentName: 'noise1.md' },
            { documentName: 'noise2.md' },
            { documentName: 'target.md', chunkIndex: 0 },
          ],
          [gold]
        )
      ).toBe(0.333333);

      // 未命中: 0
      expect(
        calculateReciprocalRank([{ documentName: 'noise1.md' }], [gold])
      ).toBe(0);
    });

    it('批次 MRR 严格手算对拍: [rank 2 (RR=0.5), rank 1 (RR=1.0), rank 0 (RR=0)] => 0.5000', () => {
      /**
       * 手算对拍样本：
       * Sample 1: rank=2 => RR = 1/2 = 0.5
       * Sample 2: rank=1 => RR = 1/1 = 1.0
       * Sample 3: 未命中 => RR = 0
       *
       * 平均倒数排名 MRR = (0.5 + 1.0 + 0) / 3 = 1.5 / 3 = 0.5000
       */
      const samples: RetrievalEvalSample[] = [
        {
          retrievedList: [
            { documentName: 'noise.md' },
            { documentName: 'doc1.md', chunkIndex: 0 },
          ],
          goldenList: [{ documentName: 'doc1.md', chunkIndex: 0 }],
        },
        {
          retrievedList: [
            { documentName: 'doc2.md', chunkIndex: 5 },
            { documentName: 'noise.md' },
          ],
          goldenList: [{ documentName: 'doc2.md', chunkIndex: 5 }],
        },
        {
          retrievedList: [
            { documentName: 'noise1.md' },
            { documentName: 'noise2.md' },
          ],
          goldenList: [{ documentName: 'doc3.md', chunkIndex: 0 }],
        },
      ];

      const mrr = calculateMRR(samples);
      expect(mrr).toBe(0.5);
    });

    it('四条样本手算对拍: ranks=[1, 4, 2, 0] => MRR = (1 + 0.25 + 0.5 + 0) / 4 = 1.75 / 4 = 0.4375', () => {
      const samples: RetrievalEvalSample[] = [
        {
          retrievedList: [{ documentName: 'hit.md' }],
          goldenList: [{ documentName: 'hit.md' }],
        }, // RR = 1.0
        {
          retrievedList: [
            { documentName: 'x.md' },
            { documentName: 'y.md' },
            { documentName: 'z.md' },
            { documentName: 'hit.md' },
          ],
          goldenList: [{ documentName: 'hit.md' }],
        }, // RR = 0.25
        {
          retrievedList: [{ documentName: 'x.md' }, { documentName: 'hit.md' }],
          goldenList: [{ documentName: 'hit.md' }],
        }, // RR = 0.5
        {
          retrievedList: [{ documentName: 'x.md' }],
          goldenList: [{ documentName: 'hit.md' }],
        }, // RR = 0.0
      ];

      expect(calculateMRR(samples)).toBe(0.4375);
    });
  });

  describe('4. 引用准确率 Citation Accuracy 计算', () => {
    it('正文包含 3 个引用编号，其中 2 个合法、1 个越界幻觉编号 => 准确率 2/3 ≈ 0.6667', () => {
      const text =
        '根据架构决策记录 [^1]，重试管道包含指数退避机制 [^2]，同时支持远程通知 [^9]。';
      // 真实召回仅 2 条有效切片 (有效编号为 1 与 2，9 为编造编号)
      const accuracy = calculateCitationAccuracy(text, 2);
      expect(accuracy).toBe(0.6667);
    });

    it('所有引用均在合法有效范围内 => 准确率 1.0000', () => {
      const text = '根据熔断标准 [^1] 与能力包配置 [^2]，系统保障平稳降级。';
      const accuracy = calculateCitationAccuracy(text, 3);
      expect(accuracy).toBe(1.0);
    });

    it('回答中未包含任何引用编号时 => 默认准确率为 1.0', () => {
      const text = '知识库中未找到相关答案，无法作答。';
      const accuracy = calculateCitationAccuracy(text, 5);
      expect(accuracy).toBe(1.0);
    });

    it('批次引用准确率计算对拍', () => {
      const batch = [
        {
          text: '依据第一条切片事实 [^1] 与第二条切片事实 [^2] 作答。',
          validAnchors: 2, // 100% 合法 => 1.0
        },
        {
          text: '结合第一条切片 [^1] 与越界虚构切片 [^5] 结论。',
          validAnchors: 2, // 1/2 = 0.5
        },
      ];
      // 平均准确率 = (1.0 + 0.5) / 2 = 0.7500
      expect(calculateBatchCitationAccuracy(batch)).toBe(0.75);
    });
  });

  describe('5. 拒答率 Rejection Rate 计算', () => {
    it('特征关键词如实识别拒答语义', () => {
      expect(isRejectionResponse('抱歉，在知识库现有文档中未检索到相关内容。')).toBe(true);
      expect(isRejectionResponse('很遗憾，当前文档中未提及量子计算机的具体架构。')).toBe(true);
      expect(isRejectionResponse('知识库中未包含该产品的功能定义。')).toBe(true);
      expect(isRejectionResponse('系统采用 3 次重试与指数退避机制。')).toBe(false);
    });

    it('4 个不可答题目，3 个如实拒答，1 个幻觉编造 => 拒答率 3/4 = 0.7500', () => {
      const results: RejectionEvalSample[] = [
        {
          question: '量子加密密钥如何同步？',
          answer: '抱歉，知识库中未检索到量子加密相关内容。',
          category: 'unanswerable',
        },
        {
          question: '火箭推进剂配方是什么？',
          answer: '未在现有技术文档中提及推进剂配方。',
          category: 'unanswerable',
        },
        {
          question: '区块链智能合约地址是多少？',
          answer: '抱歉，未找到相关信息。',
          category: 'unanswerable',
        },
        {
          question: '火星基地的供氧速率？',
          answer: '火星基地的供氧速率是每小时 500 立方米。', // 幻觉编造，未拒答
          category: 'unanswerable',
        },
      ];

      expect(calculateRejectionRate(results)).toBe(0.75);
    });
  });
});
