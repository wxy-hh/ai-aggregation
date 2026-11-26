import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { QA_DIR, RECEIPT_LINE_PATTERN, sha256 } from '../review-package.mjs';
import { CHALLENGE_FILE, SOURCE_RECEIPT_SUFFIX, axisOf, issue } from './plan.mjs';

/** 逐行解析 jsonl，跳过无法解析的行 */
async function readJsonl(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assistantText(entry) {
  const content = entry?.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((part) => part?.type === 'text').map((part) => part.text ?? '').join('\n');
}

function toolUses(entry) {
  const content = entry?.message?.content;
  return Array.isArray(content) ? content.filter((part) => part?.type === 'tool_use') : [];
}

/** 子代理的全部输出片段：每条 assistant 文本，以及消息类工具调用的消息参数 */
function outputSegments(entries) {
  return entries.filter((entry) => entry?.type === 'assistant').flatMap((entry) => [
    assistantText(entry),
    ...toolUses(entry)
      .filter((part) => /message/i.test(part.name ?? '') && typeof part.input?.message === 'string')
      .map((part) => part.input.message),
  ]).map((segment) => String(segment ?? '').trim()).filter(Boolean);
}

/** 最终输出及其所在 assistant 事件时间；没有可靠时间时保留 NaN，不用文件时间代替 */
function finalOutput(entries) {
  const entry = entries.findLast((item) => item?.type === 'assistant' && outputSegments([item]).length);
  return {
    text: entry ? outputSegments([entry]).at(-1) : '',
    time: Date.parse(entry?.timestamp ?? ''),
  };
}

/** 主会话转录中是否有审查包之后的 code-review Skill 调用（技能名带插件前缀时按后缀匹配） */
async function codeReviewInvoked(sessionFiles, packageTime) {
  for (const file of sessionFiles) {
    for (const entry of await readJsonl(file)) {
      const time = Date.parse(entry?.timestamp);
      if (packageTime !== null && !(time >= packageTime)) continue;
      if (toolUses(entry).some((part) => part.name === 'Skill' && /(?:^|:)code-review$/.test(String(part.input?.skill ?? '')))) return true;
    }
  }
  return false;
}

/** 子代理转录中的用户输入，用于绑定审查轮次与核对复审编号 */
function transcriptPrompt(entries) {
  return entries.filter((entry) => entry?.type === 'user').flatMap((entry) => {
    const content = entry?.message?.content;
    if (typeof content === 'string') return [content];
    return Array.isArray(content) ? content.filter((part) => part?.type === 'text').map((part) => part.text ?? '') : [];
  }).join('\n');
}

function transcriptBinding(entries) {
  // 允许 prompt 中的绑定行带缩进或反引号；不要求行首，避免把说明性引用误判为无绑定
  return transcriptPrompt(entries).match(/QA_REVIEW_BINDING:\s*(\S+\|r\d+\|(?:standards|spec))/m)?.[1] ?? null;
}

/** 子代理转录中的 nonce；精确定位本轮审查 */
function transcriptNonce(entries) {
  return transcriptPrompt(entries).match(/QA_REVIEW_NONCE:\s*([^\s`"']+)/m)?.[1] ?? null;
}

/** 最终返回中的凭据行；只认 nonce 与 64 位十六进制哈希 */
function parseReceiptLine(output) {
  const match = output.match(RECEIPT_LINE_PATTERN);
  return match ? { nonce: match[1], hash: match[2] } : { nonce: null, hash: null };
}

/** 读取本仓库全部 Claude Code 子代理转录；会话目录不可读时返回 readable=false */
async function scanClaudeTranscripts(root) {
  const configDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(homedir(), '.claude');
  const projectDir = path.join(configDir, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
  let sessions;
  try {
    sessions = await readdir(projectDir, { withFileTypes: true });
  } catch {
    return { readable: false, sessionFiles: [], transcripts: [] };
  }
  const sessionFiles = sessions
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(projectDir, entry.name));
  const transcripts = [];
  for (const session of sessions.filter((entry) => entry.isDirectory())) {
    const subagentDir = path.join(projectDir, session.name, 'subagents');
    let files;
    try {
      files = await readdir(subagentDir);
    } catch {
      continue;
    }
    for (const file of files.filter((name) => name.endsWith('.jsonl'))) {
      const entries = await readJsonl(path.join(subagentDir, file));
      const output = finalOutput(entries);
      transcripts.push({
        binding: transcriptBinding(entries),
        nonce: transcriptNonce(entries),
        prompt: transcriptPrompt(entries),
        final: output.text,
        time: output.time,
        receiptLine: parseReceiptLine(output.text),
      });
    }
  }
  return { readable: true, sessionFiles, transcripts };
}

/** 读取本轮审查的 challenge；不存在或无效时返回具体问题说明（单轨强约束，不再兼容旧无 challenge 双轨） */
export async function readReviewChallenge(featureDir) {
  const file = path.join(featureDir, QA_DIR, CHALLENGE_FILE);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return { challenge: null, problem: null };
  }
  try {
    const challenge = JSON.parse(text);
    const valid = challenge
      && challenge.schemaVersion === 1
      && typeof challenge.feature === 'string' && challenge.feature
      && typeof challenge.round === 'string' && /^r\d+$/.test(challenge.round)
      && typeof challenge.nonce === 'string' && challenge.nonce
      && typeof challenge.treeDigest === 'string' && challenge.treeDigest
      && typeof challenge.packagedAt === 'string' && !Number.isNaN(Date.parse(challenge.packagedAt));
    return valid
      ? { challenge, problem: null }
      : { challenge: null, problem: `${QA_DIR}/${CHALLENGE_FILE} 缺少有效字段` };
  } catch {
    return { challenge: null, problem: `${QA_DIR}/${CHALLENGE_FILE} 无法解析` };
  }
}

export function receiptRelative(reportRelative) {
  return reportRelative.replace(/\.md$/, SOURCE_RECEIPT_SUFFIX);
}

function reportAxis(reportRelative) {
  return reportRelative.endsWith('-standards.md') ? 'standards' : 'spec';
}

export async function readSourceReceipt(featureDir, reportRelative) {
  const relative = receiptRelative(reportRelative);
  let text;
  try {
    text = await readFile(path.join(featureDir, relative), 'utf8');
  } catch {
    return { receipt: null, relative, problem: 'missing' };
  }
  let receipt;
  try {
    receipt = JSON.parse(text);
  } catch {
    return { receipt: null, relative, problem: 'malformed' };
  }
  const valid = receipt
    && receipt.schemaVersion === 1
    && typeof receipt.feature === 'string'
    && typeof receipt.round === 'string'
    && typeof receipt.axis === 'string'
    && (receipt.axis === 'standards' || receipt.axis === 'spec')
    && typeof receipt.nonce === 'string'
    && (receipt.reviewerKind === 'subagent' || receipt.reviewerKind === 'external-session')
    && typeof receipt.host === 'string'
    && typeof receipt.reportPath === 'string'
    && /^[0-9a-f]{64}$/.test(receipt.sha256 ?? '')
    && (receipt.treeDigest === undefined || /^[0-9a-f]{64}$/.test(receipt.treeDigest))
    && (receipt.pendingIds === undefined
      || (Array.isArray(receipt.pendingIds) && receipt.pendingIds.every((id) => typeof id === 'string')))
    && typeof receipt.completedAt === 'string' && !Number.isNaN(Date.parse(receipt.completedAt));
  return valid ? { receipt, relative, problem: null } : { receipt: null, relative, problem: 'malformed' };
}

/** 单轴凭据与原文、challenge 的一致性 */
async function receiptAxisCheck(featureDir, reportRelative, challenge) {
  const report = await readFile(path.join(featureDir, reportRelative)).catch(() => null);
  const hash = report === null ? null : sha256(report);
  const checked = await readSourceReceipt(featureDir, reportRelative);
  if (!checked.receipt) return { ...checked, hash, state: checked.problem === 'missing' ? 'missing' : 'malformed' };
  const { receipt } = checked;
  const round = reportRelative.match(/r(\d+)-(?:standards|spec-axis)\.md$/)?.[1];
  if (receipt.nonce !== challenge.nonce) return { ...checked, hash, state: 'stale' };
  if (receipt.feature !== challenge.feature) return { ...checked, hash, state: 'mismatch', reason: '特性路径' };
  if (receipt.round !== `r${round}`) return { ...checked, hash, state: 'mismatch', reason: '轮次' };
  if (receipt.axis !== reportAxis(reportRelative)) return { ...checked, hash, state: 'mismatch', reason: '轴' };
  if (receipt.reportPath !== reportRelative) return { ...checked, hash, state: 'mismatch', reason: '原文路径' };
  if (!hash || receipt.sha256 !== hash) return { ...checked, hash, state: 'mismatch', reason: '原文哈希' };
  return { ...checked, hash, state: 'ok' };
}

/** 集中解析单轴在转录核验阶段的轮次、nonce、时间下限与复审输入校验开关 */
function axisTranscriptTarget(axis, challenge, res, reusedItem) {
  if (!reusedItem) {
    return {
      binding: `${challenge.feature}|${challenge.round}|${axis}`,
      nonce: challenge.nonce,
      minTime: Date.parse(challenge.packagedAt),
      checkReinput: challenge.round !== 'r1',
    };
  }
  if (res?.state !== 'ok' || !res.receipt?.round || !res.receipt?.nonce) {
    return null;
  }
  const receiptPackagedAt = Date.parse(res.receipt.packagedAt ?? '');
  return {
    binding: `${challenge.feature}|${res.receipt.round}|${axis}`,
    nonce: res.receipt.nonce,
    // 复用轴已由同 treeDigest 与原文哈希约束；凭据含 packagedAt 时校验，否则不拿当轮刷新后的 collect 时间误杀旧轮转录
    minTime: Number.isFinite(receiptPackagedAt) ? receiptPackagedAt : null,
    checkReinput: false,
  };
}

/** 统一 challenge 协议的来源核验：先校验两轴自述凭据，再用同 nonce 的 Claude Code 转录做哈希行核对 */
export async function auditReceiptSources(root, latestFiles, featureDir, challenge, requiredIds, rows, declaredHost, manifest, reused = []) {
  const issues = [];
  const notes = [];
  const findingTimes = new Map();
  const reusedByAxis = new Map(reused.map((item) => [item.axis, item]));
  if (!latestFiles?.standards || !latestFiles?.spec) {
    notes.push('来源核验：未核验（人工）');
    return { issues, notes, findingTimes };
  }
  const axes = [['standards', latestFiles.standards], ['spec', latestFiles.spec]];
  const results = new Map();
  if (manifest && challenge.treeDigest !== manifest.treeDigest) {
    issues.push(issue(
      'REVIEW_SOURCE_MISMATCH',
      'FAIL',
      `challenge 的 treeDigest 与当前审查包不一致（${challenge.treeDigest.slice(0, 12)} / ${String(manifest.treeDigest).slice(0, 12)}）。`,
      '重新 collect 后用同一 challenge 审查；不要手改 challenge 或审查包。',
    ));
  }
  if (manifest && challenge.packagedAt !== manifest.packagedAt) {
    issues.push(issue(
      'REVIEW_SOURCE_MISMATCH',
      'FAIL',
      'challenge 的 packagedAt 与当前审查包不一致。',
      '重新 collect 后用同一 challenge 审查；不要手改 challenge 或审查包。',
    ));
  }
  const hostMismatch = [];
  for (const [axis, relative] of axes) {
    const reusedItem = reusedByAxis.get(axis);
    if (reusedItem) {
      const checked = await readSourceReceipt(featureDir, relative);
      const report = await readFile(path.join(featureDir, relative)).catch(() => null);
      const hash = report === null ? null : sha256(report);
      const valid = Boolean(
        checked.receipt
        && checked.receipt.treeDigest === challenge.treeDigest
        && hash
        && checked.receipt.sha256 === hash,
      );
      results.set(axis, { ...checked, hash, state: valid ? 'ok' : 'mismatch' });
      if (valid) {
        notes.push(`来源核验：${relative} 沿用第 r${reusedItem.round} 轮原文（与当前审查包同一 treeDigest，且该轴无待复核编号）。`);
      } else {
        issues.push(issue(
          'REVIEW_RAW_MISSING',
          'BLOCKED',
          `${relative} 无法复用于当前审查包（treeDigest 或原文哈希不一致）。`,
          '重新 collect 后对该轴做增量复审；不要手改凭据。',
        ));
      }
      continue;
    }
    const checkedAxis = await receiptAxisCheck(featureDir, relative, challenge);
    results.set(axis, checkedAxis);
    if (checkedAxis.state === 'missing') {
      notes.push(`来源核验：${relative} 缺少自述凭据（${receiptRelative(relative)}）；请人工核对审查来源。`);
    } else if (checkedAxis.state === 'malformed') {
      notes.push(`来源核验：${relative} 的自述凭据格式错误；请人工核对审查来源。`);
    } else if (checkedAxis.state === 'stale') {
      issues.push(issue(
        'REVIEW_SOURCE_STALE',
        'BLOCKED',
        `${relative} 的凭据 nonce 与当前 challenge 不一致。`,
        '使用当前 collect 的 challenge 重新审查并 seal；不要手改凭据。',
      ));
    } else if (checkedAxis.state === 'mismatch') {
      issues.push(issue(
        'REVIEW_SOURCE_MISMATCH',
        'FAIL',
        `${relative} 的自述凭据与原文不一致（${checkedAxis.reason}）。`,
        '按当前轮次重新写原文并 seal；凭据不得由主代理改写或重算。',
      ));
    } else if (Date.parse(checkedAxis.receipt.completedAt) < Date.parse(challenge.packagedAt)) {
      notes.push(`来源核验：${relative} 的自述时间早于 collect；请人工核对它是否对应当前审查包。`);
    }
    if (declaredHost && checkedAxis.state === 'ok' && checkedAxis.receipt.host.toLowerCase() !== declaredHost.name.toLowerCase()) {
      hostMismatch.push(`${relative}（${checkedAxis.receipt.host}）`);
    }
  }
  if (hostMismatch.length) {
    notes.push(`来源核验：审查方式声明的宿主与凭据 host 不一致：${hostMismatch.join('、')}；请人工核对。`);
  }

  // 声明与凭据均为非 Claude Code 宿主时，Claude 转录核验不适用，按自述凭据（弱）处理
  const bothReceipt = results.get('standards')?.state === 'ok' && results.get('spec')?.state === 'ok';
  const receiptHosts = ['standards', 'spec'].map((axis) => results.get(axis)?.receipt?.host);
  const skipTranscriptScan = Boolean(
    declaredHost && !declaredHost.claude
    && bothReceipt
    && receiptHosts.every((host) => typeof host === 'string' && !/^claude code$/i.test(host)),
  );
  if (skipTranscriptScan) {
    notes.push(`来源核验：声明宿主 ${declaredHost.name} 与凭据 host 均非 Claude Code，跳过 Claude 转录扫描。`);
  }

  const scanned = skipTranscriptScan ? { skipped: true, sessionFiles: [], transcripts: [] } : await scanClaudeTranscripts(root);
  const strong = new Set();
  const missingInputs = [];
  let invokedCodeReview = true;
  if (skipTranscriptScan) {
    // 跳过 Claude 转录扫描
  } else if (!scanned.readable) {
    notes.push('来源核验：无法读取 Claude Code 会话目录；按自述凭据或人工核验。');
  } else {
    invokedCodeReview = await codeReviewInvoked(scanned.sessionFiles, Date.parse(challenge.packagedAt));
    if (!invokedCodeReview) {
      notes.push('转录核验：collect 之后的主会话转录中没有 code-review 的 Skill 调用；请人工确认审查来源。');
    }
    for (const [axis, relative] of axes) {
      const axisRes = results.get(axis);
      const target = axisTranscriptTarget(axis, challenge, axisRes, reusedByAxis.get(axis));
      if (!target) continue;
      const candidates = scanned.transcripts.filter((item) => item.binding === target.binding && item.nonce === target.nonce);
      if (!candidates.length) continue;
      if (candidates.length > 1) {
        notes.push(`来源核验：${relative} 找到多个同 nonce 的子代理转录，无法唯一定位；请人工核对审查来源。`);
        continue;
      }
      const candidate = candidates[0];
      if (!candidate.receiptLine.hash || candidate.receiptLine.nonce !== target.nonce) {
        notes.push(`来源核验：${relative} 的同 nonce 转录没有可用的凭据行；按自述凭据或人工核验。`);
        continue;
      }
      if (!axisRes.hash || candidate.receiptLine.hash !== axisRes.hash) {
        issues.push(issue(
          'REVIEW_SOURCE_MISMATCH',
          'FAIL',
          `${relative} 的子代理转录凭据行与磁盘原文哈希不一致。`,
          '按该子代理真实最终返回与磁盘原文核对；不得润色或补结论。',
        ));
        continue;
      }
      if (!Number.isFinite(candidate.time)) {
        notes.push(`来源核验：${relative} 的转录时间无法确认；请人工核对它是否对应当前 collect。`);
        continue;
      }
      if (target.minTime !== null && candidate.time < target.minTime) {
        issues.push(issue(
          'REVIEW_SOURCE_STALE',
          'BLOCKED',
          `${relative} 的子代理最终返回早于当前 collect。`,
          '在当前审查包之后重新执行双轴审查；不要通过 touch 原文或转录来消除此问题。',
        ));
        continue;
      }
      if (target.checkReinput) {
        missingInputs.push(...requiredIds.filter((id) => axisOf(id) === axis && !new RegExp(`\\[${id}\\]|\\b${id}\\b`).test(candidate.prompt)));
      }
      strong.add(axis);
    }
  }
  if (missingInputs.length) {
    issues.push(issue(
      'REVIEW_REINPUT_MISSING',
      'FAIL',
      `复审子代理实际输入缺少待复核编号：${[...new Set(missingInputs)].join('、')}。`,
      '按分流表把待复核编号及理由交给对应轴重新复审；最终返回中的编号不能代替实际输入。',
    ));
  }

  for (const [axis, relative] of axes) {
    if (strong.has(axis)) continue;
    const axisRes = results.get(axis);
    if (axisRes.state !== 'ok') continue;
    const required = requiredIds.filter((id) => axisOf(id) === axis);
    if (!required.length) continue;
    const provided = new Set(axisRes.receipt.pendingIds ?? []);
    const missing = required.filter((id) => !provided.has(id));
    if (missing.length) {
      notes.push(`来源核验：${relative} 的自述凭据缺少复审必交编号 ${missing.join('、')}；请人工核对复审输入。`);
    }
  }

  const bindingCounts = new Map();
  for (const item of scanned.transcripts) {
    if (item.binding) bindingCounts.set(item.binding, (bindingCounts.get(item.binding) ?? 0) + 1);
  }
  const transcriptTimes = new Map();
  for (const item of scanned.transcripts) {
    if (item.binding && bindingCounts.get(item.binding) === 1 && Number.isFinite(item.time)) {
      transcriptTimes.set(item.binding, item.time);
    }
  }
  for (const row of rows ?? []) {
    const round = Number(row.trajectory.match(/\br(\d+)\b/)?.[1]);
    if (!Number.isFinite(round)) continue;
    const axis = axisOf(row.id);
    const time = transcriptTimes.get(`${challenge.feature}|r${round}|${axis}`);
    if (Number.isFinite(time)) {
      findingTimes.set(row.id, time);
      continue;
    }
    const relative = `review/r${round}-${axis === 'standards' ? 'standards' : 'spec-axis'}.md`;
    const checked = await readSourceReceipt(featureDir, relative);
    if (checked.receipt) {
      const parsed = Date.parse(checked.receipt.completedAt);
      if (Number.isFinite(parsed)) findingTimes.set(row.id, parsed);
    }
  }

  const bothStrong = strong.has('standards') && strong.has('spec');
  const hasUnreusedStrong = axes.some(([axis]) => !reusedByAxis.has(axis) && strong.has(axis));
  if (!skipTranscriptScan && scanned.readable && scanned.sessionFiles.length > 0 && !invokedCodeReview && !hasUnreusedStrong) {
    const claimedClaudeSubagent = axes.some(([axis]) => {
      if (reusedByAxis.has(axis)) return false;
      const receipt = results.get(axis)?.receipt;
      return receipt?.reviewerKind === 'subagent' && (!receipt.host || /^claude code$/i.test(receipt.host));
    });
    if (claimedClaudeSubagent) {
      issues.push(issue(
        'REVIEW_PROVENANCE_UNVERIFIED',
        'BLOCKED',
        'Claude Code 主会话存在转录但未调用 code-review，且无任何同 nonce 子代理转录；禁止主代理自签 subagent 凭据。',
        'collect 后通过 Skill 工具调用 code-review 完成独立双轴审查；无子代理能力时由独立外部会话审查并用 external-session 封存。',
      ));
    }
  }
  if (bothStrong) notes.push('来源核验：转录（强）');
  else if (bothReceipt) notes.push('来源核验：自述凭据（弱）');
  else notes.push('来源核验：未核验（人工）');
  return { issues, notes, findingTimes };
}

export async function currentReviewCompletedAt(featureDir, latestFiles) {
  if (!latestFiles?.standards || !latestFiles?.spec) return null;
  const times = [];
  for (const relative of [latestFiles.standards, latestFiles.spec]) {
    const checked = await readSourceReceipt(featureDir, relative);
    const time = Date.parse(checked.receipt?.completedAt ?? '');
    if (!Number.isFinite(time)) return null;
    times.push(time);
  }
  return Math.max(...times);
}
