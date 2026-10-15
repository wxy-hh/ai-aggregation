/**
 * profile-tool-templates.test.ts —— 工具配置模板常量与 DTO 校验测试
 *
 * 覆盖的规格与验收标准（工单 05 / spec §E1-E3）：
 * 1. 模板常量表（客户端安全，无密钥）：feishu_bot 与 dingtalk_bot；
 * 2. 固定 POST 请求、预填中文描述、消息文本参数（string / required）；
 * 3. 模板 DTO 以 createAgentToolSchema.partial() 单测锁定（防模板漂移成绕过校验的后门）；
 * 4. 补充合法 Webhook URL 后通过 createAgentToolSchema 全量校验；
 * 5. 注入非法或内网 URL 时被安全闸门拦截；
 * 6. 默认调用名接入 suggestCallName 与 CALL_NAME_REGEX 规范。
 */

import { describe, it, expect } from 'vitest';
import { createAgentToolSchema } from '@/schemas/agent-tool.schema';
import { CALL_NAME_REGEX } from '@/schemas/agent-tool-constants';
import { validateWebhookUrl } from '@/lib/webhook/validation';
import {
  TOOL_TEMPLATES,
  TOOL_TEMPLATE_LIST,
  templateToToolInput,
  templateToPartialDto,
  type ToolTemplate,
} from './profile-tool-templates';

describe('工具配置模板（profile-tool-templates）', () => {
  it('模板列表包含飞书群机器人与钉钉群机器人两款模板', () => {
    expect(TOOL_TEMPLATE_LIST).toHaveLength(2);
    expect(TOOL_TEMPLATE_LIST.map((t) => t.id)).toEqual(['feishu_bot', 'dingtalk_bot']);
    expect(TOOL_TEMPLATES.feishu_bot).toBeDefined();
    expect(TOOL_TEMPLATES.dingtalk_bot).toBeDefined();
  });

  it('客户端安全性：模板中无任何敏感密钥、Token 或真实出站 Webhook URL', () => {
    for (const tpl of TOOL_TEMPLATE_LIST) {
      // 不得含有真实密钥或 token
      const json = JSON.stringify(tpl);
      expect(json).not.toMatch(/sk-[a-zA-Z0-9]+/);
      expect(json).not.toMatch(/Bearer\s+[a-zA-Z0-9_-]+/);
      expect(tpl.authHeaderName ?? '').toBe('');
      // 模板的真实 url 字段预置为空，由用户后续填写
      const dto = templateToToolInput(tpl);
      expect(dto.url).toBe('');
    }
  });

  it('固定 POST 方法、中文描述指导模型何时调用', () => {
    // 飞书群机器人
    const feishu = TOOL_TEMPLATES.feishu_bot;
    expect(feishu.method).toBe('POST');
    expect(feishu.title).toContain('飞书');
    expect(feishu.description).toMatch(/飞书群/);
    expect(feishu.description).toMatch(/调用/);

    // 钉钉群机器人
    const dingtalk = TOOL_TEMPLATES.dingtalk_bot;
    expect(dingtalk.method).toBe('POST');
    expect(dingtalk.title).toContain('钉钉');
    expect(dingtalk.description).toMatch(/钉钉群/);
    expect(dingtalk.description).toMatch(/调用/);
  });

  it('消息文本参数规格：string 类型且为必填（required: true）', () => {
    for (const tpl of TOOL_TEMPLATE_LIST) {
      expect(tpl.params).toHaveLength(1);
      const textParam = tpl.params[0];
      expect(textParam.name).toBe('text');
      expect(textParam.type).toBe('string');
      expect(textParam.required).toBe(true);
      expect(textParam.description).toBeTruthy();
    }
  });

  it('调用名接入合法规范，符合 CALL_NAME_REGEX 约束', () => {
    for (const tpl of TOOL_TEMPLATE_LIST) {
      expect(CALL_NAME_REGEX.test(tpl.defaultCallName)).toBe(true);
      expect(tpl.defaultCallName).toMatch(/^[a-z][a-z0-9_-]{1,30}$/);
    }
  });

  it('模板 DTO 锁定测试：通过 createAgentToolSchema.partial() 校验（防后门与字段漂移）', () => {
    const partialSchema = createAgentToolSchema.partial();

    for (const tpl of TOOL_TEMPLATE_LIST) {
      const partialDto = templateToPartialDto(tpl);
      // 模板 DTO 不含 url，在 partialSchema 下应当是严格合法的
      const parseResult = partialSchema.safeParse(partialDto);
      expect(parseResult.success, `模板 ${tpl.id} 未通过 partial 校验: ${JSON.stringify(parseResult)}`).toBe(true);

      if (parseResult.success) {
        expect(parseResult.data.name).toBe(tpl.defaultName);
        expect(parseResult.data.callName).toBe(tpl.defaultCallName);
        expect(parseResult.data.method).toBe('POST');
        expect(parseResult.data.params).toHaveLength(1);
      }
    }
  });

  it('用户补填合法 Webhook 链接后，完整通过 createAgentToolSchema 严格校验', () => {
    const feishuValidUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/test-p0a-token-123456';
    const feishuDto = {
      ...templateToToolInput(TOOL_TEMPLATES.feishu_bot),
      url: feishuValidUrl,
    };
    const feishuParsed = createAgentToolSchema.safeParse(feishuDto);
    expect(feishuParsed.success).toBe(true);

    const dingtalkValidUrl =
      'https://oapi.dingtalk.com/robot/send?access_token=test-p0a-token-abcdef123';
    const dingtalkDto = {
      ...templateToToolInput(TOOL_TEMPLATES.dingtalk_bot),
      url: dingtalkValidUrl,
    };
    const dingtalkParsed = createAgentToolSchema.safeParse(dingtalkDto);
    expect(dingtalkParsed.success).toBe(true);
  });

  it('安全闸门：模板若被填入非法协议或内网 URL，被安全校验严格拦截', () => {
    const unsafeUrls = [
      'http://open.feishu.cn/open-apis/bot/v2/hook/xxx', // 非 https
      'https://192.168.1.1/hook', // 内网 IP
      'https://localhost:8080/hook', // 本地主机
      'not-a-valid-url', // 非法格式
    ];

    for (const unsafeUrl of unsafeUrls) {
      const validation = validateWebhookUrl(unsafeUrl);
      expect(validation.ok).toBe(false);

      const dto = {
        ...templateToToolInput(TOOL_TEMPLATES.feishu_bot),
        url: unsafeUrl,
      };
      const result = createAgentToolSchema.safeParse(dto);
      expect(result.success, `非法 URL 未被拦截: ${unsafeUrl}`).toBe(false);
    }
  });
});
