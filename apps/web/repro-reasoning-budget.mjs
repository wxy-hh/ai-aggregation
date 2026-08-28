// 验证机制：max_output_tokens 同时限制 reasoning+output，循环直连 ARK 直到复现空输出
import { readFileSync } from 'node:fs';
const env = {};
for (const line of readFileSync('/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
}
const BASE = (env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3').replace(/\/$/, '');

async function callRound2(maxTokens) {
  const body = {
    model: 'doubao-seed-evolving', stream: true, temperature: 0.7, top_p: 0.9,
    input: [
      { role: 'user', content: '用一句话介绍北京' },
      { role: 'assistant', content: '北京是中国的首都，也是全国政治文化中心，拥有三千多年建城史。' },
      { role: 'user', content: '请详细对比北京和上海两座城市在经济、文化、生活成本方面的差异，并给出你的综合评价。' },
    ],
  };
  if (maxTokens) body.max_output_tokens = maxTokens;

  const res = await fetch(`${BASE}/responses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ARK_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { httpError: res.status, txt: (await res.text()).slice(0,150) };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', reasoning = '', endEvent = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const block of buf.split('\n\n').slice(0, -1)) {
      const dl = block.split('\n').find(l => l.startsWith('data: '));
      if (!dl) continue;
      try {
        const d = JSON.parse(dl.slice(6));
        if (d.type === 'response.output_text.delta') text += d.delta || '';
        if (d.type === 'response.reasoning_summary_text.delta') reasoning += d.delta || '';
        if (['response.completed','response.incomplete','response.done','response.failed'].includes(d.type)) {
          endEvent = { type: d.type, status: d.response?.status, reason: d.response?.incomplete_details?.reason,
            usage: d.response?.usage ? { in: d.response.usage.input_tokens, out: d.response.usage.output_tokens,
              rt: d.response.usage.output_tokens_details?.reasoning_tokens } : null };
        }
      } catch {}
    }
    buf = buf.split('\n\n').pop();
  }
  return { text: text.length, reasoning: reasoning.length, endEvent };
}

// 场景A：与线上一致 max_output_tokens=2048，跑 4 次
for (let i = 0; i < 4; i++) {
  const r = await callRound2(2048);
  console.log(`[2048 #${i+1}]`, JSON.stringify(r).slice(0, 220));
}
// 场景B：小预算 512（模拟低配额用户 outputLimit 被压小）
const r512 = await callRound2(512);
console.log('[512]', JSON.stringify(r512).slice(0, 220));
