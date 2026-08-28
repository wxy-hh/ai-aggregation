// 真实链路复现：AUTH_SECRET 签发 JWT → 真实 /api/chat 两轮 doubao-seed-evolving 对话
import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';

const envPath = '/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/.env.local';
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
}

const USER_ID = 'cmrswotmx0000zi9kvk8za9bt';
const token = jwt.sign({ userId: USER_ID, role: 'admin' }, env.AUTH_SECRET, { expiresIn: 900 });

async function round(messages, label) {
  const t0 = Date.now();
  const res = await fetch('http://localhost:3030/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, provider: 'doubao', model: 'doubao-seed-evolving' }),
  });
  if (!res.ok) {
    console.log(`[${label}] HTTP ${res.status}:`, (await res.text()).slice(0, 300));
    return null;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', events = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (const block of buf.split('\n\n').slice(0, -1)) {
      const dl = block.split('\n').find(l => l.startsWith('data: '));
      if (!dl) continue;
      try { events.push(JSON.parse(dl.slice(6)).type); } catch {}
    }
    buf = buf.split('\n\n').pop();
  }
  console.log(`[${label}] HTTP ${res.status} | ${((Date.now()-t0)/1000).toFixed(1)}s | 事件: ${[...new Set(events)].join(',')}`);
  return events;
}

const r1 = await round([{ role: 'user', content: '用一句话介绍北京' }], '第1轮');
if (!r1) process.exit(1);
const r2 = await round([
  { role: 'user', content: '用一句话介绍北京' },
  { role: 'assistant', content: '北京是中国的首都，也是全国政治文化中心。' },
  { role: 'user', content: '那上海呢？也用一句话' },
], '第2轮(含assistant历史)');
