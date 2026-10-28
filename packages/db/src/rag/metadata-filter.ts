/**
 * 知识库切片元数据与标签前置过滤解析引擎 (ADR-0032 / KB-META-FILTER)
 *
 * 核心设计：
 * 1. 工业级精简语法：顶层隐式 AND 复合，支持 $eq / $in / $gte / $lte；
 * 2. 强安全防注入白名单：键名严格白名单正则校验，坚决杜绝 SQL 拼接注入；
 * 3. 严格位置参数绑定：生成 $n 参数化占位符，安全映射至 PostgreSQL 执行；
 * 4. 驱动安全：使用函数替代 ? 操作符（如 jsonb_exists_any），杜绝驱动层占位符冲突。
 */

export interface MetadataRangeFilter<T = number | string> {
  $eq?: T;
  $in?: T[];
  $gte?: T;
  $lte?: T;
  $all?: T[];
}

export interface MetadataFilter {
  /** 标签过滤（支持包含任一标签的数组，或带有操作符的高级过滤） */
  tags?: string[] | MetadataRangeFilter<string>;
  /** 年份过滤（支持等值或范围） */
  year?: number | string | MetadataRangeFilter<number | string>;
  /** 任意其他自定义键值过滤 */
  [key: string]: unknown;
}

export interface BuildFilterResult {
  sqlClauses: string[];
  params: unknown[];
  nextParamIndex: number;
}

/** 键名安全白名单：仅允许 1~32 位字母、数字、下划线及连字符 */
const KEY_NAME_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

/**
 * 校验过滤字段名称是否合法，防注入
 */
export function validateMetadataFilterKey(key: string): void {
  if (!key || typeof key !== 'string' || !KEY_NAME_REGEX.test(key)) {
    throw new Error(`非法元数据过滤字段名称: "${key}"，仅允许 1-32 位英文字母、数字、下划线与中划线`);
  }
}

/**
 * 构建元数据 SQL 过滤子句与参数绑定列表
 * @param filter 过滤条件对象
 * @param startParamIndex 参数起始序号（如 $5）
 * @param tableAlias 表别名，默认 'dc'
 */
export function buildMetadataFilterClause(
  filter: MetadataFilter | undefined | null,
  startParamIndex: number,
  tableAlias = 'dc'
): BuildFilterResult {
  const sqlClauses: string[] = [];
  const params: unknown[] = [];
  let currentParamIndex = startParamIndex;

  if (!filter || typeof filter !== 'object') {
    return { sqlClauses, params, nextParamIndex: currentParamIndex };
  }

  for (const [rawKey, value] of Object.entries(filter)) {
    // 忽略未定义或空值
    if (value === undefined || value === null) {
      continue;
    }

    const key = rawKey.trim();
    validateMetadataFilterKey(key);

    // 针对 tags 字段的处理
    if (key === 'tags') {
      if (Array.isArray(value)) {
        const tagList = value.map((v) => String(v).trim()).filter(Boolean);
        if (tagList.length > 0) {
          // 默认包含任意一个标签即匹配
          sqlClauses.push(`jsonb_exists_any(${tableAlias}."metadata"->'tags', $${currentParamIndex}::text[])`);
          params.push(tagList);
          currentParamIndex++;
        }
      } else if (typeof value === 'object' && value !== null) {
        const tagFilter = value as MetadataRangeFilter<string>;
        if (Array.isArray(tagFilter.$in) && tagFilter.$in.length > 0) {
          const inTags = tagFilter.$in.map((v) => String(v).trim()).filter(Boolean);
          if (inTags.length > 0) {
            sqlClauses.push(`jsonb_exists_any(${tableAlias}."metadata"->'tags', $${currentParamIndex}::text[])`);
            params.push(inTags);
            currentParamIndex++;
          }
        }
        if (Array.isArray(tagFilter.$all) && tagFilter.$all.length > 0) {
          const allTags = tagFilter.$all.map((v) => String(v).trim()).filter(Boolean);
          if (allTags.length > 0) {
            sqlClauses.push(`jsonb_exists_all(${tableAlias}."metadata"->'tags', $${currentParamIndex}::text[])`);
            params.push(allTags);
            currentParamIndex++;
          }
        }
        if (tagFilter.$eq !== undefined && tagFilter.$eq !== null) {
          const eqTag = String(tagFilter.$eq).trim();
          if (eqTag) {
            sqlClauses.push(`jsonb_exists(${tableAlias}."metadata"->'tags', $${currentParamIndex}::text)`);
            params.push(eqTag);
            currentParamIndex++;
          }
        }
      } else if (typeof value === 'string' || typeof value === 'number') {
        const singleTag = String(value).trim();
        if (singleTag) {
          sqlClauses.push(`jsonb_exists(${tableAlias}."metadata"->'tags', $${currentParamIndex}::text)`);
          params.push(singleTag);
          currentParamIndex++;
        }
      }
      continue;
    }

    // 针对其他字段（如 year、department 等）的处理
    if (typeof value === 'object' && !Array.isArray(value)) {
      const opObj = value as Record<string, unknown>;

      // $eq
      if (opObj.$eq !== undefined && opObj.$eq !== null) {
        sqlClauses.push(`${tableAlias}."metadata"->>'${key}' = $${currentParamIndex}`);
        params.push(String(opObj.$eq));
        currentParamIndex++;
      }

      // $in
      if (Array.isArray(opObj.$in) && opObj.$in.length > 0) {
        const inVals = opObj.$in.map((v) => String(v));
        sqlClauses.push(`${tableAlias}."metadata"->>'${key}' = ANY($${currentParamIndex}::text[])`);
        params.push(inVals);
        currentParamIndex++;
      }

      // $gte
      if (opObj.$gte !== undefined && opObj.$gte !== null) {
        const isNum = typeof opObj.$gte === 'number' || !isNaN(Number(opObj.$gte));
        if (isNum) {
          sqlClauses.push(`(${tableAlias}."metadata"->>'${key}')::numeric >= $${currentParamIndex}`);
          params.push(Number(opObj.$gte));
        } else {
          sqlClauses.push(`${tableAlias}."metadata"->>'${key}' >= $${currentParamIndex}`);
          params.push(String(opObj.$gte));
        }
        currentParamIndex++;
      }

      // $lte
      if (opObj.$lte !== undefined && opObj.$lte !== null) {
        const isNum = typeof opObj.$lte === 'number' || !isNaN(Number(opObj.$lte));
        if (isNum) {
          sqlClauses.push(`(${tableAlias}."metadata"->>'${key}')::numeric <= $${currentParamIndex}`);
          params.push(Number(opObj.$lte));
        } else {
          sqlClauses.push(`${tableAlias}."metadata"->>'${key}' <= $${currentParamIndex}`);
          params.push(String(opObj.$lte));
        }
        currentParamIndex++;
      }
    } else if (Array.isArray(value)) {
      // 数组值按 ANY 包含处理
      if (value.length > 0) {
        const arrVals = value.map((v) => String(v));
        sqlClauses.push(`${tableAlias}."metadata"->>'${key}' = ANY($${currentParamIndex}::text[])`);
        params.push(arrVals);
        currentParamIndex++;
      }
    } else {
      // 基础标量等值匹配
      sqlClauses.push(`${tableAlias}."metadata"->>'${key}' = $${currentParamIndex}`);
      params.push(String(value));
      currentParamIndex++;
    }
  }

  return {
    sqlClauses,
    params,
    nextParamIndex: currentParamIndex,
  };
}
