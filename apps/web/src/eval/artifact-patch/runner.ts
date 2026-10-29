/**
 * 章节补丁离线评测：单次运行器（ADR-0037 / 工单 10）
 *
 * - 真实运行：与线上同一 `runAgent`、同一系统提示词（含产物规范 + 产物上下文注入）、
 *   同一流式路径与步数/输出上限常量；工具注册表为空（评测不触发联网、知识库等外部调用）。
 * - 干跑：不调用模型，按用例期望生成确定性的「理想输出」，只用于验证评测流水线本身。
 *
 * 本模块不在 `@repo/web test` 的任何测试里发起真实调用：真实运行函数只被 CLI 经显式确认参数调用。
 */

import {
  buildArtifactContextRequest,
  findSectionRange,
  parseChatStreamEvent,
  resolveArtifactContext,
  type ChatStreamEvent,
} from '@repo/shared';
import { createToolRegistry } from '@/lib/agent/registry';
import type { Message as ChatMessage } from '@/stores/chat-store';
import { runAgent } from '../../app/api/chat/_lib/agent/agent-runner';
import {
  AGENT_MAX_STEPS,
  AGENT_MODEL,
  AGENT_PROVIDER,
  AGENT_STEP_OUTPUT_LIMIT,
  AGENT_SUMMARY_OUTPUT_LIMIT,
} from '../../app/api/chat/_lib/agent/agent-config';
import type { PatchEvalCase } from './cases';
import { buildInitialArtifact } from './metrics';

/** 单次真实调用的墙钟超时（毫秒），与线上整请求运行预算一致 */
const REAL_RUN_TIMEOUT_MS = 240_000;

/** 评测使用的模型：与线上 agent 模式同一常量，不允许外部覆盖 */
export const EVAL_PROVIDER = AGENT_PROVIDER;
export const EVAL_MODEL = AGENT_MODEL;

/** 消费 SSE 字节流，解析出契约事件（未知/非法帧忽略，与客户端一致） */
export async function collectChatEvents(stream: ReadableStream<Uint8Array>): Promise<ChatStreamEvent[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();

  const events: ChatStreamEvent[] = [];
  for (const frame of raw.split('\n\n')) {
    const line = frame.split('\n').find((l) => l.startsWith('data:'));
    if (!line) continue;
    const payload = line.slice('data:'.length).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const event = parseChatStreamEvent(JSON.parse(payload));
      if (event) events.push(event);
    } catch {
      // 非 JSON 帧：忽略
    }
  }
  return events;
}

/** 构造与线上一致的产物上下文提示词：工作台已展开并聚焦该产物 */
export function buildEvalArtifactPrompt(testCase: PatchEvalCase): string {
  const artifact = buildInitialArtifact(testCase);
  const request = buildArtifactContextRequest({
    artifacts: [artifact],
    activeArtifactId: artifact.id,
    isWorkspaceOpen: true,
  });
  const resolved = resolveArtifactContext(request);
  if (!resolved || resolved.mode !== 'full') {
    throw new Error(`用例 ${testCase.id} 的产物上下文未能以全文注入（mode=${resolved?.mode ?? 'null'}）`);
  }
  return resolved.text;
}

/** 真实运行一次：返回模型输出的契约事件；调用层异常以 error 事件体现 */
export async function runRealOnce(testCase: PatchEvalCase): Promise<ChatStreamEvent[]> {
  const messages: ChatMessage[] = [{ id: `eval-${testCase.id}`, role: 'user', content: testCase.instruction }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REAL_RUN_TIMEOUT_MS);
  try {
    const stream = runAgent({
      userId: 'artifact-patch-eval',
      provider: EVAL_PROVIDER,
      model: EVAL_MODEL,
      messages,
      stepOutputLimit: AGENT_STEP_OUTPUT_LIMIT,
      summaryOutputLimit: AGENT_SUMMARY_OUTPUT_LIMIT,
      maxSteps: AGENT_MAX_STEPS,
      signal: controller.signal,
      errorId: `artifact-patch-eval-${testCase.id}`,
      runtime: {
        registry: createToolRegistry([]),
        finishMetadata: () => ({ webhookCalls: 0 }),
      },
      artifactContextPrompt: buildEvalArtifactPrompt(testCase),
      onFinish: async () => {},
    });
    return await collectChatEvents(stream);
  } finally {
    clearTimeout(timer);
  }
}

/** 干跑的模拟输出：确定性的理想行为（只改期望章节 / 另起新产物），不调用模型 */
export function simulateModelEvents(testCase: PatchEvalCase): ChatStreamEvent[] {
  if (testCase.expect.kind === 'new-artifact') {
    return [
      { type: 'artifact_start', artifact: { id: 'summary-new', type: 'markdown', title: '独立摘要' } },
      { type: 'artifact_delta', id: 'summary-new', delta: '# 独立摘要\n\n模拟生成的独立文档。\n' },
      { type: 'artifact_end', id: 'summary-new', status: 'complete' },
      { type: 'done' },
    ];
  }
  const events: ChatStreamEvent[] = [];
  for (const section of testCase.expect.sections) {
    if (!findSectionRange(testCase.document, section)) {
      throw new Error(`用例 ${testCase.id} 的期望章节在原文中找不到：${section}`);
    }
    events.push(
      {
        type: 'artifact_start',
        artifact: { id: testCase.artifactId, type: 'markdown', title: testCase.title, section },
      },
      { type: 'artifact_delta', id: testCase.artifactId, delta: `${section}\n模拟改写后的内容。\n` },
      { type: 'artifact_end', id: testCase.artifactId, status: 'complete' }
    );
  }
  events.push({ type: 'done' });
  return events;
}
