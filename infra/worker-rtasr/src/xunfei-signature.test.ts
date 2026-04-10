import test from 'node:test';
import assert from 'node:assert/strict';
import { buildXunfeiSigna, buildXunfeiWebSocketUrl, parseXunfeiResultPayload } from './xunfei-signature.ts';

test('buildXunfeiSigna uses the same algorithm as the Node gateway', async () => {
  const signa = await buildXunfeiSigna('demo-app', 'secret-key', '1710000000');

  assert.equal(signa, 'TIN4NfQ5uNwu2IHkTvVjShvJM68=');
});

test('buildXunfeiWebSocketUrl keeps signa and pd as single-encoded query params', async () => {
  const url = await buildXunfeiWebSocketUrl('demo-app', 'secret-key', {
    pd: 'medical',
    timestampSeconds: '1710000000',
  });
  const parsed = new URL(url);

  assert.equal(parsed.origin, 'wss://rtasr.xfyun.cn');
  assert.equal(parsed.pathname, '/v1/ws');
  assert.equal(parsed.searchParams.get('appid'), 'demo-app');
  assert.equal(parsed.searchParams.get('ts'), '1710000000');
  assert.equal(parsed.searchParams.get('pd'), 'medical');
  assert.equal(parsed.searchParams.get('signa'), 'TIN4NfQ5uNwu2IHkTvVjShvJM68=');
});

test('parseXunfeiResultPayload supports the stringified data shape returned by upstream', () => {
  const parsed = parseXunfeiResultPayload({
    action: 'result',
    data: JSON.stringify({
      seg_id: 12,
      ls: true,
      cn: {
        st: {
          bg: 100,
          ed: 420,
          rt: [
            {
              ws: [
                { cw: [{ w: '你好' }] },
                { cw: [{ w: '世界' }] },
              ],
            },
          ],
        },
      },
    }),
  });

  assert.deepEqual(parsed, {
    text: '你好世界',
    segId: 12,
    isEnd: true,
    bg: 100,
    ed: 420,
  });
});
