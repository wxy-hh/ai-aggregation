/**
 * T01 闸门验证脚本 — 豆包 seed function calling 能力实测
 *
 * 工单：.scratch/chat-agent-tools/issues/01-doubao-function-calling-verification.md
 * 结论：见 docs/features/2026-10-01-chat-agent-tools/spec.md §13（2026-10-01，GO）
 *
 * 用途：换模型 / 上游变更时复跑，确认 agent 工具调用路径仍然可用。
 * 跑法：cd packages/providers && node <此文件绝对路径>
 *      （依赖 @ai-sdk/openai 与 ai，均声明于 packages/providers）
 *
 * 验证三点：
 *  ① result.toolCalls 稳定返回，input 已解析为对象
 *  ② fullStream 事件序列含 tool-call
 *  ③ tool 无 execute 时停在 tool-call（runner 自行执行的控制点）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, jsonSchema } from 'ai';

const HERE = dirname(fileURLToPath(import.meta.url));
// docs/features/<slug>/ → 仓库根
const ENV_PATH = resolve(HERE, '../../../apps/web/.env.local');
const env = readFileSync(ENV_PATH, 'utf8');
const key = env.match(/^ARK_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const provider = createOpenAI({
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: key,
});

const weatherTool = tool({
  description: '查询指定城市的实时天气',
  inputSchema: jsonSchema({
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' },
      unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    },
    required: ['city'],
  }),
  // 不提供 execute：SDK 停在 tool-call，由 runner 自行执行
});

const MODEL = 'doubao-seed-evolving';

const result = streamText({
  model: provider(MODEL),
  messages: [{ role: 'user', content: '郑州今天天气怎么样？' }],
  tools: { get_weather: weatherTool },
  maxOutputTokens: 256,
});

const streamEvents = [];
for await (const part of result.fullStream) {
  if (part.type === 'tool-call') {
    streamEvents.push({ type: part.type, toolName: part.toolName, input: part.input });
  } else if (part.type === 'finish') {
    streamEvents.push({ type: part.type, finishReason: part.finishReason });
  } else {
    streamEvents.push({ type: part.type });
  }
}

const toolCalls = await result.toolCalls;
const usage = await result.usage;

console.log(JSON.stringify({ model: MODEL, toolCalls, usage, streamEvents }, null, 2));
