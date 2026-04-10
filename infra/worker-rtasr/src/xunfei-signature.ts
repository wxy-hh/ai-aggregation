/**
 * 讯飞实时语音转写 API 协议工具
 *
 * 当前 Cloudflare Worker 与仓库中现有 Node 网关保持同一套鉴权协议：
 * 1. `signa = Base64(HmacSHA1(MD5(appid + ts), apiKey))`
 * 2. WebSocket 查询参数使用 `appid`、`ts`、`signa`，可选 `pd`
 */

export interface BuildRealtimeUrlOptions {
  pd?: string;
  timestampSeconds?: string;
}

/**
 * 生成讯飞实时转写签名
 */
export async function buildXunfeiSigna(
  appId: string,
  apiKey: string,
  timestampSeconds: string
): Promise<string> {
  const baseString = `${appId}${timestampSeconds}`;
  const md5 = md5Hex(baseString);

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(apiKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(md5));

  return bytesToBase64(new Uint8Array(signature));
}

/**
 * 构建讯飞 WebSocket 连接 URL
 */
export async function buildXunfeiWebSocketUrl(
  appId: string,
  apiKey: string,
  options: BuildRealtimeUrlOptions = {}
): Promise<string> {
  const ts = options.timestampSeconds ?? String(Math.floor(Date.now() / 1000));
  const signa = await buildXunfeiSigna(appId, apiKey, ts);

  const query = new URLSearchParams({
    appid: appId,
    ts,
    signa,
  });

  if (options.pd) {
    query.set('pd', options.pd);
  }

  return `wss://rtasr.xfyun.cn/v1/ws?${query.toString()}`;
}

export interface ParsedRealtimeResult {
  text: string;
  segId?: number;
  isEnd?: boolean;
  bg?: number;
  ed?: number;
}

/**
 * 解析讯飞结果体
 */
export function parseXunfeiResultPayload(payload: unknown): ParsedRealtimeResult | null {
  const data = normalizePayloadData(payload);
  if (!data || typeof data !== 'object') {
    return null;
  }

  const segId = typeof data.seg_id === 'number' ? data.seg_id : undefined;
  const cn = isObject(data.cn) ? data.cn : undefined;
  const st = isObject(cn?.st) ? cn.st : undefined;
  const rt = Array.isArray(st?.rt) ? st.rt : [];

  const text = rt
    .flatMap((candidate) => (isObject(candidate) && Array.isArray(candidate.ws) ? candidate.ws : []))
    .flatMap((candidate) => (isObject(candidate) && Array.isArray(candidate.cw) ? candidate.cw : []))
    .map((candidate) => (isObject(candidate) && typeof candidate.w === 'string' ? candidate.w : ''))
    .join('')
    .trim();

  const bg = st?.bg !== undefined ? Number(st.bg) : undefined;
  const ed = st?.ed !== undefined ? Number(st.ed) : undefined;
  const isEnd =
    typeof data.ls === 'boolean'
      ? data.ls
      : typeof data.isEnd === 'boolean'
        ? data.isEnd
        : undefined;

  if (!text) {
    return null;
  }

  return { text, segId, isEnd, bg, ed };
}

function normalizePayloadData(payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) {
    return null;
  }

  const maybeData = payload.data;
  if (typeof maybeData === 'string') {
    try {
      const parsed = JSON.parse(maybeData) as unknown;
      return isObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return isObject(maybeData) ? maybeData : payload;
}

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function md5Hex(input: string): string {
  const words = stringToWords(input);
  const bitLength = input.length * 8;

  words[bitLength >> 5] |= 0x80 << bitLength % 32;
  words[(((bitLength + 64) >>> 9) << 4) + 14] = bitLength;

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < words.length; i += 16) {
    const oldA = a;
    const oldB = b;
    const oldC = c;
    const oldD = d;

    a = md5ff(a, b, c, d, words[i], 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);

    a = md5gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, words[i], 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);

    a = md5hh(a, b, c, d, words[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, words[i], 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);

    a = md5ii(a, b, c, d, words[i], 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);

    a = safeAdd(a, oldA);
    b = safeAdd(b, oldB);
    c = safeAdd(c, oldC);
    d = safeAdd(d, oldD);
  }

  return wordsToHex([a, b, c, d]);
}

function stringToWords(input: string): number[] {
  const words: number[] = [];
  for (let i = 0; i < input.length * 8; i += 8) {
    words[i >> 5] |= (input.charCodeAt(i / 8) & 0xff) << i % 32;
  }
  return words;
}

function wordsToHex(words: number[]): string {
  const hexChars = '0123456789abcdef';
  let output = '';
  for (let i = 0; i < words.length * 4; i++) {
    const value = words[i >> 2] >> ((i % 4) * 8);
    output += `${hexChars[(value >>> 4) & 0x0f]}${hexChars[value & 0x0f]}`;
  }
  return output;
}

function md5cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}

function md5ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn((b & c) | (~b & d), a, b, x, s, t);
}

function md5gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function md5hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}

function md5ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}

function safeAdd(x: number, y: number): number {
  const lsw = (x & 0xffff) + (y & 0xffff);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xffff);
}

function bitRotateLeft(num: number, cnt: number): number {
  return (num << cnt) | (num >>> (32 - cnt));
}
