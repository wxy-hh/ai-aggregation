/**
 * parse-curl.test.ts —— cURL 粘贴导入解析器纯函数单元测试
 *
 * 覆盖规格与安全红线（工单 06 / spec §4.1 / §E2）：
 * 1. 输入上限 8KB（超出即降级）
 * 2. 非 cURL 命令降级「无法识别，请手动填写」
 * 3. 请求方法限制：仅支持 GET 与 POST；PUT/DELETE/PATCH 等返回「暂不支持」
 * 4. Header 白名单提取与非鉴权头忽略警告（含 Cookie 忽略）
 * 5. Body 提取：JSON 顶层字段映射、嵌套对象忽略警告、表单编码推断
 * 6. 多行续行符与引号分词处理
 */

import { describe, it, expect } from 'vitest';
import { parseCurl } from './parse-curl';

describe('parseCurl 纯函数 - 安全红线与降级', () => {
  it('安全红线 1：输入超过 8KB（8192 字符）拒绝解析并返回中文提示', () => {
    const hugeInput = 'curl https://example.com/api -d "' + 'x'.repeat(8193) + '"';
    const result = parseCurl(hugeInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/8KB|超出上限/);
    }
  });

  it('安全红线 2：普通文本输入无法识别，降级提示手动填写，绝不返回半填表单', () => {
    const result = parseCurl('这是一段普通文字');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('无法识别');
      expect(result.reason).toContain('请手动填写');
    }
  });

  it('安全红线 3：非 curl 起始的命令行输入拒绝解析', () => {
    const result = parseCurl('wget https://example.com/api');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/无法识别|curl/i);
    }
  });

  it('安全红线 4：显式 -X PUT / -X DELETE 等不支持的方法返回「暂不支持」', () => {
    const putResult = parseCurl('curl -X PUT https://api.example.com/resource');
    expect(putResult.ok).toBe(false);
    if (!putResult.ok) {
      expect(putResult.reason).toContain('暂不支持');
    }

    const deleteResult = parseCurl('curl -X DELETE https://api.example.com/resource/1');
    expect(deleteResult.ok).toBe(false);
    if (!deleteResult.ok) {
      expect(deleteResult.reason).toContain('暂不支持');
    }

    const patchResult = parseCurl('curl --request PATCH https://api.example.com/resource');
    expect(patchResult.ok).toBe(false);
    if (!patchResult.ok) {
      expect(patchResult.reason).toContain('暂不支持');
    }
  });
});

describe('parseCurl 纯函数 - Header 白名单与鉴权提取', () => {
  it('提取 Authorization 头，并忽略非鉴权头且产生警告提示（GitHub 官方调用样本）', () => {
    const curl =
      'curl https://api.github.com/user/repos -H "Authorization: Bearer tok_xxx" -H "User-Agent: my-app"';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.method).toBe('GET');
      expect(result.dto.url).toBe('https://api.github.com/user/repos');
      expect(result.dto.authHeaderName).toBe('Authorization');
      expect(result.dto.authHeaderValue).toBe('Bearer tok_xxx');
      expect(result.warnings.some((w) => w.includes('已忽略 1 个非鉴权请求头'))).toBe(true);
    }
  });

  it('提取 X-API-Key 头，且 Cookie 头强制被忽略并计入忽略计数', () => {
    const curl =
      'curl https://api.example.com/v1 -H "X-API-Key: secret_123" -H "Cookie: session=abc; uid=10" -H "Accept: application/json"';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.authHeaderName).toBe('X-API-Key');
      expect(result.dto.authHeaderValue).toBe('secret_123');
      // 忽略了 Cookie 与 Accept 两个头
      expect(result.warnings.some((w) => w.includes('已忽略 2 个非鉴权请求头'))).toBe(true);
    }
  });

  it('支持名称包含 token/key（大小写不敏感）的自定义鉴权头提取', () => {
    const curl = 'curl https://api.example.com/data -H "x-access-token: token_abc999"';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.authHeaderName).toBe('x-access-token');
      expect(result.dto.authHeaderValue).toBe('token_abc999');
      expect(result.warnings).toHaveLength(0);
    }
  });
});

describe('parseCurl 纯函数 - Body 解析与参数声明映射', () => {
  it('JSON 请求体：顶层字段转参数声明，嵌套对象忽略且警告含「嵌套」字样', () => {
    const curl =
      'curl -X POST https://httpbin.org/post -d \'{"a":{"nested":1},"b":"x","count":10,"active":true}\'';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.method).toBe('POST');
      // 嵌套 a 被忽略，保留 b, count, active
      const paramNames = result.dto.params.map((p) => p.name);
      expect(paramNames).toEqual(['b', 'count', 'active']);

      const bParam = result.dto.params.find((p) => p.name === 'b');
      expect(bParam).toEqual({
        name: 'b',
        type: 'string',
        required: true,
        description: '',
      });

      const countParam = result.dto.params.find((p) => p.name === 'count');
      expect(countParam).toEqual({
        name: 'count',
        type: 'number',
        required: true,
        description: '',
      });

      const activeParam = result.dto.params.find((p) => p.name === 'active');
      expect(activeParam).toEqual({
        name: 'active',
        type: 'boolean',
        required: true,
        description: '',
      });

      // 必须包含「嵌套」字样的警告
      expect(result.warnings.some((w) => w.includes('嵌套'))).toBe(true);
    }
  });

  it('JSON 请求体：嵌套数组字段同样被忽略且产生含「嵌套」字样警告', () => {
    const curl = 'curl -X POST https://example.com/api -d \'{"tags":["a","b"],"title":"my title"}\'';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.params).toHaveLength(1);
      expect(result.dto.params[0].name).toBe('title');
      expect(result.dto.params[0].type).toBe('string');
      expect(result.warnings.some((w) => w.includes('嵌套'))).toBe(true);
    }
  });

  it('表单编码请求体：-d \'a=1&b=hello&c=false\' 正确推断类型', () => {
    const curl = 'curl https://httpbin.org/post -d "a=1&b=hello&c=false"';
    const result = parseCurl(curl);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.method).toBe('POST');
      expect(result.dto.params).toEqual([
        { name: 'a', type: 'number', required: true, description: '' },
        { name: 'b', type: 'string', required: true, description: '' },
        { name: 'c', type: 'boolean', required: true, description: '' },
      ]);
    }
  });

  it('多行 cURL（反斜杠续行与引号交替）解析正确', () => {
    const curl = `curl https://example.com/api/v1 \\
      -H "Authorization: Bearer token_multi" \\
      -H "Content-Type: application/json" \\
      -d '{"msg":"hello world"}'`;

    const result = parseCurl(curl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.url).toBe('https://example.com/api/v1');
      expect(result.dto.authHeaderName).toBe('Authorization');
      expect(result.dto.authHeaderValue).toBe('Bearer token_multi');
      expect(result.dto.params).toEqual([
        { name: 'msg', type: 'string', required: true, description: '' },
      ]);
    }
  });

  it('不支持或非结构化请求体（如 XML）整体降级失败，避免半填表单', () => {
    const curl = 'curl -X POST https://example.com/api -d "<xml><key>val</key></xml>"';
    const result = parseCurl(curl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('无法识别');
    }
  });

  it('飞书群机器人真实 Webhook 样本解析（POST + JSON msg_type 与 content）', () => {
    const feishuCurl = `curl -X POST "https://open.feishu.cn/open-apis/bot/v2/hook/xxxx-xxxx" \\
      -H "Content-Type: application/json" \\
      -d '{"msg_type":"text","content":{"text":"Hello"}}'`;

    const result = parseCurl(feishuCurl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.method).toBe('POST');
      expect(result.dto.url).toBe(
        'https://open.feishu.cn/open-apis/bot/v2/hook/xxxx-xxxx'
      );
      // msg_type 为顶层字符串参数，content 为嵌套对象被忽略并告警
      expect(result.dto.params).toEqual([
        {
          name: 'msg_type',
          type: 'string',
          required: true,
          description: '',
        },
      ]);
      expect(result.warnings.some((w) => w.includes('嵌套'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('非鉴权请求头'))).toBe(true);
    }
  });

  it('从 URL path 或 host 智能派生初始合法调用名 callName', () => {
    const curl = 'curl https://api.github.com/repos/octocat/hello-world';
    const result = parseCurl(curl);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.dto.callName).toBeDefined();
      expect(result.dto.callName).toMatch(/^[a-z][a-z0-9_-]{1,30}$/);
    }
  });
});




describe('parseCurl 纯函数 - 验收修复回归', () => {
  it('畸形百分号编码的表单 body 不抛异常，整体降级无法识别', () => {
    // decodeURIComponent 遇 '100%' 类畸形序列抛 URIError：必须按「不半填」原则降级，绝不上抛
    const curl = "curl -X POST https://httpbin.org/post -d 'a=100%'";
    expect(() => parseCurl(curl)).not.toThrow();
    const result = parseCurl(curl);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('请手动填写');
    }
  });
});
