/**
 * chat-safety.ts —— 通用对话服务端合规拦截与审计
 *
 * 设计意图：
 * 1. 为什么在服务端前置拦截：
 *    合规判定不能依赖客户端或模型自觉。对于违法犯罪、暴恐、色情、仇恨歧视等明显违规内容，
 *    在服务端直接前置识别并拦截，避免调用上游 LLM，保障平台内容合规与运行安全。
 * 2. 为什么不计费：
 *    命中合规拦截的请求未进入 LLM 处理阶段，未消耗外部大模型 Token 资源，不预留额度、不计费，
 *    以零成本合成安全话术响应，符合计费公平原则。
 * 3. 词库克制原则（宁少勿滥）：
 *    通用聊天不同于垂直领域（如占星/医疗），用户日常提问广泛存在医疗健康、购房贷款、法律维权
 *    或情感咨询等正常诉求。词库仅覆盖确定性违规的高危指令与违法话题，严禁误伤普通合法问题；
 *    「入侵/盗号/纳粹」等多义词条一律收窄为指令型、宣扬型表述，历史科普（纳粹德国战败）、
 *    生物科普（物种入侵）、账号求助（被盗号找回）等正当讨论不得命中。
 */

import { encodeSseEvent } from './sse';

export type ChatSensitiveTopic = 'illegal' | 'terror' | 'porn' | 'hate';

interface ChatSensitiveRule {
  topic: ChatSensitiveTopic;
  label: string;
  re: RegExp;
}

const CHAT_SENSITIVE_RULES: ChatSensitiveRule[] = [
  {
    topic: 'illegal',
    label: '违法犯罪',
    // 「入侵/盗号」收窄为指令型表述：避免误伤「物种入侵」「入侵检测」「微信被盗号怎么找回」等正当提问
    // 入侵限定数字对象（网站/服务器/教务等），「入侵生态系统」等生物语境不命中
    re: /制爆|制毒|制造炸药|制作炸弹|制造毒品|制作毒品|黑客入侵|入侵.{0,6}(?:网站|服务器|数据库|电脑|邮箱|账号|后台|内网|教务|手机|游戏)|怎么盗号|如何盗号|盗号教程|盗取账号|窃取账号|洗钱|办假证|买卖枪支|贩卖毒品/,
  },
  {
    topic: 'terror',
    label: '暴恐',
    re: /恐怖袭击|恐怖组织|暴恐|恐怖分子|自杀式袭击/,
  },
  {
    topic: 'porn',
    label: '色情',
    re: /卖淫|嫖娼|援交|露骨色情|色情服务|色情交易/,
  },
  {
    topic: 'hate',
    label: '仇恨歧视',
    // 「纳粹」收窄为宣扬型表述：避免误伤「纳粹德国是哪一年战败的」等历史科普提问
    re: /新纳粹|纳粹万岁|美化纳粹|灭族|劣等民族|种族清洗|种族灭绝/,
  },
];

const TOPIC_LABELS: Record<ChatSensitiveTopic, string> = {
  illegal: '违法犯罪',
  terror: '暴恐',
  porn: '色情',
  hate: '仇恨歧视',
};

/**
 * 确定性识别文本中的敏感主题
 * @param text 待检测文本
 * @returns 命中的敏感主题类型，未命中则返回 null
 */
export function detectChatSensitiveTopic(text: string): ChatSensitiveTopic | null {
  if (!text) return null;
  for (const rule of CHAT_SENSITIVE_RULES) {
    if (rule.re.test(text)) {
      return rule.topic;
    }
  }
  return null;
}

/**
 * 构造统一的安全拦截话术
 * @param topic 命中的敏感主题类型
 */
export function buildChatBlockedText(topic: ChatSensitiveTopic): string {
  const label = TOPIC_LABELS[topic];
  return `这个问题涉及${label}内容，我无法提供帮助。如果你有其他问题，欢迎随时问我。`;
}

/**
 * 创建合规拦截的 SSE 响应流
 * 合成单条 assistant 安全话术（text-delta + done，done 不带 usage）
 */
export function createBlockedStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encodeSseEvent({ type: 'text-delta', text }));
      controller.enqueue(encodeSseEvent({ type: 'done' }));
      controller.close();
    },
  });
}
