/**
 * Agent 自定义工具配置预置模板常量表（spec §E1 / 工单 05）
 *
 * 核心设计与安全约束：
 * 1. 客户端完全安全：无任何 API 密钥、私有凭证或真实出站 Webhook URL；
 * 2. 预置 POST 请求、指导模型调用时机的中文描述与消息文本参数；
 * 3. 模板 DTO 严格受控，以 createAgentToolSchema.partial() 锁定，杜绝格式漂移；
 * 4. 默认调用名符合 CALL_NAME_REGEX 命名规范，并可接入既有 suggestCallName 链路。
 */

import type { WebhookParamItem, CreateAgentToolInput } from '@/schemas/agent-tool.schema';

/** 单个工具模板定义类型 */
export interface ToolTemplate {
  /** 模板唯一标识 */
  id: 'feishu_bot' | 'dingtalk_bot';
  /** 模板标题（界面展示） */
  title: string;
  /** 模板副标题说明（界面展示） */
  subtitle: string;
  /** 模板图标标识 */
  icon: 'feishu' | 'dingtalk';
  /** 默认工具名称 */
  defaultName: string;
  /** 默认调用名（英文，满足 CALL_NAME_REGEX 且供模型侧 wh_ 命名） */
  defaultCallName: string;
  /** 预填中文描述（指导模型何时调用） */
  description: string;
  /** 固定请求方式 */
  method: 'POST';
  /** URL 提示占位符 */
  urlPlaceholder: string;
  /** 预置参数列表 */
  params: WebhookParamItem[];
  /** 可选鉴权头名称（群机器人默认无需单独请求头鉴权） */
  authHeaderName?: string;
}

/**
 * 预置模板常量字典（飞书群机器人 / 钉钉群机器人）
 */
export const TOOL_TEMPLATES: Record<'feishu_bot' | 'dingtalk_bot', ToolTemplate> = {
  feishu_bot: {
    id: 'feishu_bot',
    title: '飞书群机器人',
    subtitle: '将对话结果或通知推送至飞书群聊',
    icon: 'feishu',
    defaultName: '飞书群机器人',
    defaultCallName: 'feishu_bot',
    description: '当需要把消息、通知或查询结果推送到飞书群时调用此工具',
    method: 'POST',
    urlPlaceholder: 'https://open.feishu.cn/open-apis/bot/v2/hook/...',
    params: [
      {
        name: 'text',
        type: 'string',
        required: true,
        description: '需要发送到飞书群的消息文本内容',
      },
    ],
  },
  dingtalk_bot: {
    id: 'dingtalk_bot',
    title: '钉钉群机器人',
    subtitle: '将对话结果或通知推送至钉钉群聊',
    icon: 'dingtalk',
    defaultName: '钉钉群机器人',
    defaultCallName: 'dingtalk_bot',
    description: '当需要把消息、通知或查询结果推送到钉钉群时调用此工具',
    method: 'POST',
    urlPlaceholder: 'https://oapi.dingtalk.com/robot/send?access_token=...',
    params: [
      {
        name: 'text',
        type: 'string',
        required: true,
        description: '需要发送到钉钉群的消息文本内容',
      },
    ],
  },
};

/** 模板列表数组（按展示顺序） */
export const TOOL_TEMPLATE_LIST: ToolTemplate[] = [
  TOOL_TEMPLATES.feishu_bot,
  TOOL_TEMPLATES.dingtalk_bot,
];

/**
 * 提取模板自身预置的字段 DTO（不含 URL，专门供 createAgentToolSchema.partial() 锁定校验）
 */
export function templateToPartialDto(template: ToolTemplate) {
  return {
    name: template.defaultName,
    callName: template.defaultCallName,
    description: template.description,
    method: template.method,
    params: template.params.map((p) => ({ ...p })),
    enabled: true,
  };
}

/**
 * 将模板实体转换为创建工具表单所需的初始字段受控状态
 *
 * 注：返回的 URL 保持为空字符串，由用户后续在抽屉表单中填写真实 Webhook 地址。
 */
export function templateToToolInput(
  template: ToolTemplate
): Omit<CreateAgentToolInput, 'url'> & { url: string } {
  return {
    ...templateToPartialDto(template),
    url: '',
    authHeaderName: null,
    authHeaderValue: null,
  };
}
