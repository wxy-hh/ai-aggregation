import { readFileSync } from 'node:fs';
import jwt from 'jsonwebtoken';
const env = {};
for (const line of readFileSync('/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/web/.env.local','utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
}
const token = jwt.sign({ userId: 'cmrswotmx0000zi9kvk8za9bt', role: 'admin' }, env.AUTH_SECRET, { expiresIn: 900 });

const res = await fetch('http://localhost:3030/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({
    messages: [
      { role: 'user', content: '用一句话介绍北京' },
      { role: 'assistant', content: '北京是中国的首都，也是全国政治文化中心。' },
      { role: 'user', content: '那上海呢？也用一句话' },
    ],
    provider: 'doubao', model: 'doubao-seed-evolving',
  }),
});
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  for (const block of buf.split('\n\n').slice(0, -1)) {
    const dl = block.split('\n').find(l => l.startsWith('data: '));
    if (dl) console.log('SSE:', dl.slice(0, 200));
  }
  buf = buf.split('\n\n').pop();
}
