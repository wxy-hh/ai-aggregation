/**
 * artifact-version-engine.ts
 *
 * 职责（ADR-0037）：
 * 产物版本引擎，纯函数、无 UI 依赖。输入「当前产物池 + 一个流式产物事件」，输出新的产物池。
 *
 * 核心规则：
 * - 草稿与正式版分离：流式中的内容为草稿，仅 `complete` 才转为正式版本入链；
 * - `error` / 中止收尾：有上一版则丢弃草稿并保留上一版，全新产物则保留半成品并标记未完成；
 * - 同 identifier 再生成为整篇替换，不与旧正文拼接；
 * - 版本链最多 5 个，淘汰最旧的中间版本，始终保留首版与当前版，序号不复用；
 * - 回滚为追加式：复制历史版本为新的末尾版本，不删除任何版本；
 * - 章节补丁：Markdown 产物带 `section` 的输出只替换对应章节（精确匹配标题行，含子章节），
 *   同一轮的多个补丁合并为一个新版本，成功与失败逐个记录，失败不影响当前版。
 */

import type {
  Artifact,
  ArtifactPatchResult,
  ArtifactVersion,
  ArtifactVersionSource,
  ChatStreamEvent,
  SectionPatchFailureReason,
} from './chat-stream-contract';

/** 每个产物最多保留的正式版本数 */
export const MAX_ARTIFACT_VERSIONS = 5;

/** 入库状态派生结果 */
export type ArtifactDepositState =
  | { status: 'none' }
  | { status: 'latest'; depositedSeq: number }
  | { status: 'stale'; depositedSeq: number; currentSeq: number; canDepositLatest: true };

/** Markdown 标题（ATX `#` 语法）及其章节区间 */
export interface MarkdownHeading {
  /** 标题层级 1-6 */
  level: number;
  /** 标题行原文（去首尾空白） */
  line: string;
  /** 标题行起点的字符偏移 */
  start: number;
  /** 章节终点（不含）：下一个同级或更高级标题之前，含全部子章节 */
  end: number;
}

/** 标题行比对键：仅忽略首尾空白与连续空格，不做其它模糊处理 */
function normalizeHeadingLine(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/**
 * 解析 Markdown 标题目录（含层级与字符区间），跳过代码围栏内的 `#` 行。
 * 围栏识别：以 ``` 或 ~~~ 开头（最多缩进 3 空格），同字符且不短于开启长度的围栏行关闭。
 */
export function parseMarkdownHeadings(content: string): MarkdownHeading[] {
  const found: Omit<MarkdownHeading, 'end'>[] = [];
  let fence: { char: string; length: number } | null = null;
  let offset = 0;

  for (const rawLine of content.split('\n')) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    const line = rawLine.replace(/\r$/, '');

    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!fence) {
        fence = { char: marker[0], length: marker.length };
      } else if (marker[0] === fence.char && marker.length >= fence.length) {
        fence = null;
      }
      continue;
    }
    if (fence) continue;

    const headingMatch = /^ {0,3}(#{1,6})[ \t]+\S/.exec(line);
    if (headingMatch) {
      found.push({ level: headingMatch[1].length, line: line.trim(), start: lineStart });
    }
  }

  return found.map((h, index) => {
    const next = found.slice(index + 1).find((n) => n.level <= h.level);
    return { ...h, end: next ? next.start : content.length };
  });
}

/**
 * 在 Markdown 中定位章节区间（含子章节）：与补丁应用同一套精确匹配规则。
 * 找不到或标题重复时返回 null，供就地预览与改动高亮使用。
 */
export function findSectionRange(content: string, section: string): { start: number; end: number } | null {
  const target = normalizeHeadingLine(section);
  const matches = parseMarkdownHeadings(content).filter((h) => normalizeHeadingLine(h.line) === target);
  if (matches.length !== 1) return null;
  return { start: matches[0].start, end: matches[0].end };
}

type SectionPatchOutcome =
  | { ok: true; content: string }
  | { ok: false; reason: SectionPatchFailureReason };

/**
 * 把章节补丁应用到 Markdown：`section` 精确匹配标题行（仅忽略首尾空白与连续空格），
 * 找不到或重复判失败；补丁正文必须以该标题行开头；成功时保留原章节尾部的空白，
 * 使章节间的空行结构不因替换而漂移。
 */
function applySectionPatch(content: string, section: string, patchBody: string): SectionPatchOutcome {
  const target = normalizeHeadingLine(section);
  const matches = parseMarkdownHeadings(content).filter(
    (h) => normalizeHeadingLine(h.line) === target
  );
  if (matches.length === 0) return { ok: false, reason: 'not-found' };
  if (matches.length > 1) return { ok: false, reason: 'duplicate' };

  const body = patchBody.replace(/^\s+/, '').replace(/\s+$/, '');
  const firstLine = body.split('\n', 1)[0] ?? '';
  if (normalizeHeadingLine(firstLine) !== target) return { ok: false, reason: 'not-heading-start' };

  const { start, end } = matches[0];
  const trailing = /\s*$/.exec(content.slice(start, end))?.[0] ?? '';
  return { ok: true, content: content.slice(0, start) + body + trailing + content.slice(end) };
}

function versionId(seq: number): string {
  return `v${seq}`;
}

/**
 * 读取产物的正式版本链。
 * 老数据（无版本链字段）视为仅有 1 个版本（序号 1，内容为原 content）；
 * 老数据若非完成态（流式残留或出错）则没有正式版本。
 */
export function getArtifactVersions(artifact: Artifact): ArtifactVersion[] {
  if (Array.isArray(artifact.versions)) return artifact.versions;
  if (artifact.status === 'complete') {
    return [
      {
        id: versionId(1),
        seq: 1,
        content: artifact.content,
        createdAt: artifact.createdAt ?? 0,
        source: { kind: 'generated' },
      },
    ];
  }
  return [];
}

/** 追加新版本；超限时淘汰最旧的中间版本（首版与当前版始终保留） */
function appendVersion(
  versions: ArtifactVersion[],
  content: string,
  source: ArtifactVersionSource,
  now: number
): ArtifactVersion[] {
  // 当前版（末尾）永不被淘汰，所以 last.seq + 1 保证序号单调且不复用
  const seq = versions.length > 0 ? versions[versions.length - 1].seq + 1 : 1;
  const next = [...versions, { id: versionId(seq), seq, content, createdAt: now, source }];
  while (next.length > MAX_ARTIFACT_VERSIONS) next.splice(1, 1);
  return next;
}

function omitNotice(artifact: Artifact): Artifact {
  const { notice: _notice, ...rest } = artifact;
  return rest;
}

/** 去掉补丁相关的瞬态字段（补丁草稿、本轮合并标记、上一轮结果） */
function omitPatchState(artifact: Artifact): Artifact {
  const { patchDraft: _draft, patchTurn: _turn, patchReport: _report, ...rest } = artifact;
  return rest;
}

/** 只去掉流式中的补丁草稿，保留本轮合并标记与结果 */
function omitPatchDraft(artifact: Artifact): Artifact {
  const { patchDraft: _draft, ...rest } = artifact;
  return rest;
}

/**
 * 丢弃流式草稿：
 * - 有上一版：回到上一版内容并标记「草稿已丢弃」；
 * - 全新产物：保留半成品内容并标记为未完成（error），不入版本链。
 */
function discardDraft(artifact: Artifact): Artifact {
  const versions = getArtifactVersions(artifact);
  const current = versions[versions.length - 1];
  if (!current) {
    return { ...omitNotice(omitPatchDraft(artifact)), versions: [], status: 'error' };
  }
  return {
    ...omitPatchDraft(artifact),
    versions,
    content: current.content,
    status: 'complete',
    notice: 'draft-discarded',
  };
}

function patchArtifact(
  artifacts: Artifact[],
  id: string,
  update: (artifact: Artifact) => Artifact
): Artifact[] {
  const index = artifacts.findIndex((a) => a.id === id);
  if (index === -1) return artifacts;
  const next = artifacts.slice();
  next[index] = update(artifacts[index]);
  return next;
}

/**
 * 完成一个章节补丁：成功则把结果并入「本轮」的补丁版本（首个成功补丁追加新版本，
 * 之后的补丁原地更新该版本，保证同一轮只多一个版本）；失败则不动内容，仅记录原因。
 */
function completeSectionPatch(
  a: Artifact,
  draft: { section: string; content: string },
  now: number
): Artifact {
  const versions = getArtifactVersions(a);
  const current = versions[versions.length - 1];
  const base = omitNotice(omitPatchDraft(a));
  const outcome = applySectionPatch(current.content, draft.section, draft.content);
  const result: ArtifactPatchResult = outcome.ok
    ? { section: draft.section, status: 'applied' }
    : { section: draft.section, status: 'failed', reason: outcome.reason };
  const patchReport = [...(a.patchReport ?? []), result];

  if (!outcome.ok) {
    return { ...base, versions, content: current.content, status: 'complete', patchReport };
  }

  const mergedIntoTurnVersion = a.patchTurn?.versionSeq === current.seq;
  if (mergedIntoTurnVersion) {
    const nextVersions = [...versions.slice(0, -1), { ...current, content: outcome.content }];
    return {
      ...base,
      versions: nextVersions,
      content: outcome.content,
      status: 'complete',
      patchReport,
      patchTurn: { versionSeq: current.seq },
    };
  }
  const nextVersions = appendVersion(versions, outcome.content, { kind: 'patch' }, now);
  return {
    ...base,
    versions: nextVersions,
    content: outcome.content,
    status: 'complete',
    patchReport,
    patchTurn: { versionSeq: nextVersions[nextVersions.length - 1].seq },
  };
}

/**
 * 新一轮对话开始：清除上一轮的补丁合并标记与结果，使本轮的补丁产生新的版本。
 * 无补丁状态可清理时原样返回同一数组。
 */
export function beginArtifactTurn(artifacts: Artifact[]): Artifact[] {
  if (!artifacts.some((a) => a.patchTurn || a.patchReport)) return artifacts;
  return artifacts.map((a) => (a.patchTurn || a.patchReport ? omitPatchState(a) : a));
}

/** 应用一个流式产物事件，返回新的产物池；非产物事件或无关事件原样返回 */
export function applyArtifactEvent(
  artifacts: Artifact[],
  event: ChatStreamEvent,
  now: number
): Artifact[] {
  switch (event.type) {
    case 'artifact_start': {
      const meta = event.artifact;
      const existing = artifacts.find((a) => a.id === meta.id);
      if (!existing) {
        return [
          ...artifacts,
          {
            id: meta.id,
            type: meta.type,
            title: meta.title,
            ...(meta.language ? { language: meta.language } : {}),
            content: '',
            status: 'streaming',
            createdAt: now,
            versions: [],
          },
        ];
      }
      // 章节补丁：仅当原产物是有标题结构的 Markdown 且已有正式版时成立，
      // 否则退回整篇替换语义（代码、表格、无标题短文）
      const existingVersions = getArtifactVersions(existing);
      const currentVersion = existingVersions[existingVersions.length - 1];
      if (
        meta.section &&
        currentVersion &&
        existing.type === 'markdown' &&
        parseMarkdownHeadings(currentVersion.content).length > 0
      ) {
        const section = meta.section;
        return patchArtifact(artifacts, meta.id, (a) => ({
          ...omitNotice(a),
          versions: existingVersions,
          // 补丁流式期间正文保持当前版，增量只进入补丁草稿
          content: currentVersion.content,
          status: 'streaming',
          patchDraft: { section, content: '' },
        }));
      }
      // 同 identifier 再生成：草稿从空开始，绝不拼接旧正文；已有正式版时标题与类型沿用原产物
      return patchArtifact(artifacts, meta.id, (a) => {
        const versions = getArtifactVersions(a);
        const base = omitPatchState(omitNotice(a));
        return {
          ...base,
          versions,
          content: '',
          status: 'streaming',
          ...(versions.length === 0
            ? {
                type: meta.type,
                title: meta.title,
                ...(meta.language ? { language: meta.language } : {}),
              }
            : {}),
        };
      });
    }
    case 'artifact_delta':
      return patchArtifact(artifacts, event.id, (a) => {
        if (a.status !== 'streaming') return a;
        if (a.patchDraft) {
          return { ...a, patchDraft: { ...a.patchDraft, content: a.patchDraft.content + event.delta } };
        }
        return { ...a, content: a.content + event.delta };
      });
    case 'artifact_end':
      return patchArtifact(artifacts, event.id, (a) => {
        if (a.status !== 'streaming') return a;
        if (event.status === 'error') return discardDraft(a);
        if (a.patchDraft) return completeSectionPatch(a, a.patchDraft, now);
        const versions = appendVersion(
          getArtifactVersions(a),
          a.content,
          { kind: 'generated' },
          now
        );
        return { ...omitNotice(omitPatchDraft(a)), versions, status: 'complete' };
      });
    default:
      return artifacts;
  }
}

/**
 * 收尾所有残留的流式产物（中止、失败、会话还原路径使用）。
 * 无流式产物时原样返回同一数组，避免无谓的状态更新。
 */
export function finalizeStreamingArtifacts(artifacts: Artifact[]): Artifact[] {
  if (!artifacts.some((a) => a.status === 'streaming')) return artifacts;
  return artifacts.map((a) => (a.status === 'streaming' ? discardDraft(a) : a));
}

/**
 * 追加式回滚：把所选历史版本复制为新的末尾版本并标注「回滚自 vN」。
 * 目标版本不存在、已是当前版、或产物仍在流式中时原样返回。
 */
export function rollbackArtifact(artifact: Artifact, targetSeq: number, now: number): Artifact {
  if (artifact.status === 'streaming') return artifact;
  const versions = getArtifactVersions(artifact);
  const current = versions[versions.length - 1];
  const target = versions.find((v) => v.seq === targetSeq);
  if (!current || !target || target.seq === current.seq) return artifact;
  const next = appendVersion(versions, target.content, { kind: 'rollback', fromSeq: target.seq }, now);
  return { ...omitNotice(artifact), versions: next, content: target.content, status: 'complete' };
}

/** 从入库信息解析入库版本序号；缺省（老数据）按「入库于首版」处理 */
function resolveDepositedSeq(artifact: Artifact, versions: ArtifactVersion[]): number {
  const matched = /^v(\d+)$/.exec(artifact.kbDeposit?.versionId ?? '');
  if (matched) return Number(matched[1]);
  return versions[0]?.seq ?? 1;
}

/** 派生入库状态：未入库 / 已入库且为最新 / 已入库但当前有新版本 */
export function deriveArtifactDepositState(artifact: Artifact): ArtifactDepositState {
  if (!artifact.kbDeposit?.deposited) return { status: 'none' };
  const versions = getArtifactVersions(artifact);
  const depositedSeq = resolveDepositedSeq(artifact, versions);
  const currentSeq = versions[versions.length - 1]?.seq ?? depositedSeq;
  if (depositedSeq === currentSeq) return { status: 'latest', depositedSeq };
  return { status: 'stale', depositedSeq, currentSeq, canDepositLatest: true };
}

/**
 * 存储超配额降级用：淘汰产物最旧的一个中间版本。
 * 首版与当前版始终保留；仅剩这两个（或更少）版本时无可淘汰，返回 null。
 */
export function dropOldestArtifactVersion(artifact: Artifact): Artifact | null {
  const versions = artifact.versions;
  if (!Array.isArray(versions) || versions.length <= 2) return null;
  return { ...artifact, versions: [versions[0], ...versions.slice(2)] };
}
