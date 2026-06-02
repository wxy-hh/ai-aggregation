import type { QueuedQuestion } from './ai-copilot-conversation';

/** 追问面板聚焦某一步大运时的上下文 */
export type DestinyCopilotDecadeFocus = {
  decadeName: string;
  /** 展示用，如「丙寅大运 · 24-33岁」 */
  label: string;
};

export type DestinyCopilotLaunch = {
  focus?: DestinyCopilotDecadeFocus | null;
  queuedQuestion?: QueuedQuestion | null;
};

/** 生成「追问这一步大运」的默认问题 */
export function buildDecadeFortuneAskQuestion(decade: {
  name: string;
  startAge: number;
  endAge: number;
}): string {
  return `请只围绕【${decade.name}大运】（${decade.startAge}-${decade.endAge}岁）报告中的 AI 专属解读，结合我的命盘说明这十年与我的关系，并分别给出前五年、后五年各一条可执行建议。`;
}
