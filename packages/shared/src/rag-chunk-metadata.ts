/**
 * 切片元数据键分层契约与构造规则 (ADR-0032 2026-11-10 修订)
 *
 * 核心契约：
 * 1. 切片 metadata 键分四层——A 用户可编辑继承键（tags + 自定义业务元数据）、
 *    B 系统派生键（由 Document 主表列权威重算，永不信任请求体）、
 *    C 文档溯源键（继承自主表，只读）、D 显式剔除键（outline 只留主表）。
 * 2. 唯一事实源：Worker、ArtifactKnowledgeDeposit 与原地元数据编辑共享本模块的构造规则。
 * 3. 原地更新只允许覆写 A+B 层，切片私有键由 `metadata || $1` 拼接语义天然保留。
 */

/** B 层：系统派生键（从 Document 主表列权威重算） */
export const SYSTEM_DERIVED_KEYS = ['sourceType', 'fileName', 'storageKey', 'parsedContentKey'] as const;

/** C 层：文档溯源键（BidirectionalProvenance，继承自主表，只读） */
export const SYSTEM_PROVENANCE_KEYS = ['sourceSessionId', 'sourceArtifactId', 'depositedAt', 'artifactType'] as const;

/** D 层：显式剔除键（ADR-0036 大纲树只存主表，严禁流入切片） */
export const EXCLUDED_CHUNK_METADATA_KEYS = ['outline'] as const;

/**
 * 判断键名是否为系统保护键（B/C/D 层），PATCH 等编辑入口据此拒绝写入
 */
export function isProtectedMetadataKey(key: string): boolean {
  return (
    (SYSTEM_DERIVED_KEYS as readonly string[]).includes(key) ||
    (SYSTEM_PROVENANCE_KEYS as readonly string[]).includes(key) ||
    (EXCLUDED_CHUNK_METADATA_KEYS as readonly string[]).includes(key)
  );
}

/**
 * 切片继承事实：构造切片元数据所需的最小文档主表事实
 */
export interface ChunkInheritanceFacts {
  /** 文档来源类型（Document.sourceType 列："file" | "url" | "chat_artifact"） */
  sourceType: string;
  /** 文档名（Document.name 列，即切片 fileName 的权威来源） */
  name: string;
  /** 对象存储定位（Document.storageKey 列） */
  storageKey: string;
  /** 文档标签数组 */
  tags: string[];
  /** 文档主表 metadata（可含 outline，构造时显式剔除；含 C 层溯源键时原样继承） */
  metadata: Record<string, unknown>;
}

/**
 * 由存储定位派生提纯内容键（去掉尾段文件名，固定替换为 content.md）
 */
export function deriveParsedContentKey(storageKey: string): string {
  return storageKey.replace(/\/[^/]+$/, '/content.md');
}

/**
 * 构造切片继承层元数据（A 层打平 + B 层派生，剔除 D 层，继承 C 层）
 * 输出即原地更新 `metadata || $1` 的 $1 载荷，也是入库切片的继承部分。
 */
export function buildChunkInheritedMetadata(facts: ChunkInheritanceFacts): Record<string, unknown> {
  const rawMetadata =
    facts.metadata && typeof facts.metadata === 'object' && !Array.isArray(facts.metadata)
      ? facts.metadata
      : {};
  // 显式解构剔除 D 层键（如 outline），确保切片 metadata 干净
  const excluded = new Set<string>(EXCLUDED_CHUNK_METADATA_KEYS);
  const cleanMetadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawMetadata)) {
    if (!excluded.has(key)) {
      cleanMetadata[key] = value;
    }
  }

  return {
    ...cleanMetadata,
    tags: facts.tags ?? [],
    sourceType: facts.sourceType,
    fileName: facts.name,
    storageKey: facts.storageKey,
    parsedContentKey: deriveParsedContentKey(facts.storageKey),
  };
}

/**
 * 估算切片文本 Token 数量（中英混合启发式：中文字符 ≈ 1 token，西文字符 ≈ 4 字符 1 token）
 * 原位于 worker rag-index parser，随 C1 收拢迁入共享包；消费方保持原引用路径（parser 转出口）。
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // 匹配中文字符及全角标点
  const chineseChars = text.match(/[一-龥　-〿！-～]/g)?.length || 0;
  // 剩余其他字符（英文/数字/空格）
  const otherChars = Math.max(0, text.length - chineseChars);
  return Math.ceil(chineseChars + otherChars / 4);
}
