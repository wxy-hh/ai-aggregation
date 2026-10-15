/**
 * 复现脚本 — agent 两步式编排的「总结步」在真实上游是否可用
 *
 * 背景：T07 浏览器验收发现，豆包真实链路下决策步正常产出 toolCall、工具执行成功，
 * 但总结步报 400：
 *   The parameter `input` specified in the request are not valid: `<nil>`.
 *   url: https://ark.cn-beijing.volces.com/api/v3/responses
 * 单测（chat-handler.agent.test.ts）mock 了 streamText，因此这条路径从未打过真实上游。
 *
 * 本脚本把 agent-runner 的消息拼装原样搬出来，在两种传输层下各跑一次：
 *   A. provider(MODEL)       —— @ai-sdk/openai 默认（Responses API，/responses）
 *   B. provider.chat(MODEL)  —— Chat Completions（/chat/completions）
 * 用来判定根因是「消息拼装」还是「传输层选错」。
 *
 * 跑法：cd packages/providers && node <此文件绝对路径>
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, tool, jsonSchema, stepCountIs } from 'ai';

/**
 * 定位仓库根下的 apps/web/.env.local。
 * ESM 的裸模块解析以「脚本所在目录」为基准，所以本脚本必须复制到 packages/providers/ 下执行；
 * 但 .env.local 的定位改从 cwd 向上找，避免复制后路径失效。
 */
function findEnvFile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, 'apps/web/.env.local');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`未找到 apps/web/.env.local（从 ${startDir} 向上查找）`);
}

const env = readFileSync(findEnvFile(process.cwd()), 'utf8');
const key = env.match(/^ARK_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');

const provider = createOpenAI({
  baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
  apiKey: key,
});

const MODEL = 'doubao-seed-evolving';

const echoTool = tool({
  description: '查询指定城市的实时天气',
  inputSchema: jsonSchema({
    type: 'object',
    properties: { city: { type: 'string', description: '城市名称' } },
    required: ['city'],
  }),
});

/** 与 agent-runner 完全一致的总结步拼装 */
async function runVariant(label, modelFactory) {
  const baseMessages = [
    { role: 'user', content: '北京今天天气怎么样？请用工具查一下。' },
  ];

  console.log(`\n================ ${label} ================`);

  try {
    const decision = streamText({
      model: modelFactory(),
      messages: baseMessages,
      tools: { get_weather: echoTool },
      stopWhen: stepCountIs(1),
      maxOutputTokens: 2048,
    });

    for await (const _part of decision.fullStream) {
      // 消费掉，确保流跑完
    }

    const toolCalls = await decision.toolCalls;
    console.log('决策步 toolCalls:', JSON.stringify(toolCalls));
    const decisionMessages = (await decision.response).messages;
    console.log(
      'decision.response.messages 形状:',
      JSON.stringify(
        decisionMessages.map((m) => ({
          role: m.role,
          contentType: Array.isArray(m.content) ? m.content.map((p) => p.type) : typeof m.content,
        }))
      )
    );
    console.log('usage:', JSON.stringify(await decision.usage));

    if (toolCalls.length === 0) {
      console.log('→ 决策步未产出工具调用，跳过总结步');
      return { label, ok: true, note: 'no toolCall' };
    }

    const toolResultParts = toolCalls.map((call) => ({
      type: 'tool-result',
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      output: { type: 'text', value: '{"city":"北京","temp":"18℃","weather":"晴"}' },
    }));

    const summary = streamText({
      model: modelFactory(),
      messages: [...baseMessages, ...decisionMessages, { role: 'tool', content: toolResultParts }],
      maxOutputTokens: 2048,
    });

    let summaryText = '';
    for await (const part of summary.fullStream) {
      if (part.type === 'text-delta') summaryText += part.text;
      if (part.type === 'error') console.log('流内 error 事件:', JSON.stringify(part.error));
    }
    console.log('总结步正文:', JSON.stringify(summaryText.slice(0, 200)));
    console.log('总结步 usage:', JSON.stringify(await summary.usage));
    return { label, ok: summaryText.length > 0, text: summaryText.slice(0, 120) };
  } catch (error) {
    console.log('✗ 抛错:', error?.message ?? String(error));
    if (error?.responseBody) console.log('  上游响应体:', String(error.responseBody).slice(0, 300));
    return { label, ok: false, error: error?.message ?? String(error) };
  }
}

const results = [];
results.push(await runVariant('A. provider(MODEL) —— Responses API（现状）', () => provider(MODEL)));
results.push(
  await runVariant('B. provider.chat(MODEL) —— Chat Completions（候选修复）', () => provider.chat(MODEL))
);

console.log('\n================ 结论 ================');
for (const r of results) console.log(JSON.stringify(r));
