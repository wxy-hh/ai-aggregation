/**
 * 跨模态单引用接力 — 中文案常量
 *
 * 所有接力相关 UI 文案/提示/错误统一中文，集中在此便于一致性维护。
 */

export const RELAY_COPY = {
  /** 接力动作按钮 */
  action: '接力',
  /** 接力菜单标题（固定） */
  menuTitle: '用此继续',
  /** 引用条 */
  referenceBar: {
    viewSource: '查看来源',
    remove: '移除引用',
    fillInput: '填入输入框',
    fillPrompt: '填入 Prompt',
    replaceTitle: '替换当前引用？',
    replaceDesc: '目标已有引用，替换不会删除你的草稿。',
    replaceConfirm: '替换',
    replaceCancel: '取消',
    sourceDeleted: '来源已删除，快照仍可使用',
    mediaInvalid: '媒体快照已失效，请重新选择来源',
    reselectSource: '重新选择来源',
    restoring: '正在恢复引用…',
    invalid: '接力内容已失效',
    unsupported: '当前内容不支持此目标',
  },
  /** 禁用原因 */
  disabled: {
    generating: '生成中，稍后可接力',
    empty: '内容为空，无法接力',
    noTarget: '当前内容暂无可接力目标',
    recording: '请先暂停或结束录音，再接力完整转写',
  },
  /** 语音 */
  voice: {
    fullTranscript: '完整转写',
    selectedSegment: '选中片段',
  },
  /** 命理 */
  destiny: {
    pendingReference: '待解读引用',
    pickMethod: '选择术数',
    prefillNote: '命盘生成后预填至 AI 顾问，不会写入以下生辰字段',
  },
  /** 历史 */
  history: {
    derivedFrom: '由某来源接力生成',
    viewSource: '查看来源',
  },
} as const;

export type RelayCopy = typeof RELAY_COPY;
