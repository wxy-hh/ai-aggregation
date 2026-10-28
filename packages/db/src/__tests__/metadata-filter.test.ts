import { describe, it, expect } from 'vitest';
import {
  buildMetadataFilterClause,
  validateMetadataFilterKey,
  type MetadataFilter,
} from '../rag/metadata-filter';

describe('MetadataFilter 前置过滤与防注入引擎 (TC07 / ADR-0032)', () => {
  describe('validateMetadataFilterKey 安全白名单', () => {
    it('合法键名正常通过', () => {
      expect(() => validateMetadataFilterKey('department')).not.toThrow();
      expect(() => validateMetadataFilterKey('year_2026')).not.toThrow();
      expect(() => validateMetadataFilterKey('sub-category')).not.toThrow();
      expect(() => validateMetadataFilterKey('DOC_TYPE')).not.toThrow();
    });

    it('非法键名（空格、特殊字符、SQL 注释与注入载荷）前置抛出异常', () => {
      expect(() => validateMetadataFilterKey("dept' OR 1=1 --")).toThrow(/非法元数据过滤字段名称/);
      expect(() => validateMetadataFilterKey('year; DROP TABLE users;')).toThrow(/非法元数据过滤字段名称/);
      expect(() => validateMetadataFilterKey('foo bar')).toThrow(/非法元数据过滤字段名称/);
      expect(() => validateMetadataFilterKey('foo$bar')).toThrow(/非法元数据过滤字段名称/);
      expect(() => validateMetadataFilterKey('')).toThrow(/非法元数据过滤字段名称/);
      expect(() => validateMetadataFilterKey('a'.repeat(33))).toThrow(/非法元数据过滤字段名称/);
    });
  });

  describe('buildMetadataFilterClause SQL 与参数化构造', () => {
    it('空 filter 返回空子句与空参数', () => {
      const res1 = buildMetadataFilterClause(undefined, 5);
      expect(res1.sqlClauses).toEqual([]);
      expect(res1.params).toEqual([]);
      expect(res1.nextParamIndex).toBe(5);

      const res2 = buildMetadataFilterClause({}, 1);
      expect(res2.sqlClauses).toEqual([]);
      expect(res2.params).toEqual([]);
      expect(res2.nextParamIndex).toBe(1);
    });

    it('支持普通标量等值匹配', () => {
      const filter: MetadataFilter = {
        department: 'finance',
        valid: true,
      };
      const res = buildMetadataFilterClause(filter, 4, 'dc');
      expect(res.sqlClauses).toEqual([
        `dc."metadata"->>'department' = $4`,
        `dc."metadata"->>'valid' = $5`,
      ]);
      expect(res.params).toEqual(['finance', 'true']);
      expect(res.nextParamIndex).toBe(6);
    });

    it('支持 tags 简单数组（默认 jsonb_exists_any 包含任一）', () => {
      const filter: MetadataFilter = {
        tags: ['财务', '报销'],
      };
      const res = buildMetadataFilterClause(filter, 3, 'dc');
      expect(res.sqlClauses).toEqual([
        `jsonb_exists_any(dc."metadata"->'tags', $3::text[])`,
      ]);
      expect(res.params).toEqual([['财务', '报销']]);
      expect(res.nextParamIndex).toBe(4);
    });

    it('支持 tags 高级操作符（$all 和 $eq）', () => {
      const filter: MetadataFilter = {
        tags: {
          $all: ['制度', '2026'],
        },
      };
      const res = buildMetadataFilterClause(filter, 2, 'dc');
      expect(res.sqlClauses).toEqual([
        `jsonb_exists_all(dc."metadata"->'tags', $2::text[])`,
      ]);
      expect(res.params).toEqual([['制度', '2026']]);
      expect(res.nextParamIndex).toBe(3);
    });

    it('支持 $gte 与 $lte 范围比较（数值类型转换）', () => {
      const filter: MetadataFilter = {
        year: {
          $gte: 2025,
          $lte: 2026,
        },
      };
      const res = buildMetadataFilterClause(filter, 5, 'dc');
      expect(res.sqlClauses).toEqual([
        `(dc."metadata"->>'year')::numeric >= $5`,
        `(dc."metadata"->>'year')::numeric <= $6`,
      ]);
      expect(res.params).toEqual([2025, 2026]);
      expect(res.nextParamIndex).toBe(7);
    });

    it('支持 $in 集合匹配', () => {
      const filter: MetadataFilter = {
        category: {
          $in: ['notice', 'guide'],
        },
      };
      const res = buildMetadataFilterClause(filter, 1, 'dc');
      expect(res.sqlClauses).toEqual([
        `dc."metadata"->>'category' = ANY($1::text[])`,
      ]);
      expect(res.params).toEqual([['notice', 'guide']]);
      expect(res.nextParamIndex).toBe(2);
    });

    it('当传入包含恶意键名时抛出异常并不生成任何 SQL', () => {
      const badFilter = {
        "year' OR '1'='1": 2026,
      };
      expect(() => buildMetadataFilterClause(badFilter, 1)).toThrow(/非法元数据过滤字段名称/);
    });
  });
});
