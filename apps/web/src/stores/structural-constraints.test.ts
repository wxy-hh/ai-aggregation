/**
 * structural-constraints.test.ts —— 结构约束与旧路径清除（TC09 / ADR-0046）
 *
 * 锁定的外部行为：
 * 1. 字符串事件总线与事件协调器模块已删除；
 * 2. 全仓不再出现会话相关事件常量的 emit 调用；
 * 3. 会话 store 不再导出编排方法；
 * 4. 聊天 store 不 import 会话、对比、历史或音频历史 store；
 * 5. 端口、编排模块与双快照类型的签名中不出现 any；
 * 6. 聊天工作区经编排命令完成发送事务与模型切换。
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve(process.cwd(), 'src');

const read = (relative: string) => readFileSync(path.join(srcRoot, relative), 'utf8');

/** 递归收集 src 下的 TypeScript 源码（排除测试文件自身） */
const collectSources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      files.push(...collectSources(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
};

const REMOVED_EVENT_CONSTANTS = [
  'CONVERSATION_UPDATED',
  'CONVERSATION_DELETED',
  'CONVERSATION_TOOL_OVERRIDES_UPDATED',
  'CHAT_HISTORY_SAVED',
  'RELAY_SOURCES_INVALIDATED',
  'AUDIO_HISTORY_DELETED',
  'HISTORY_DELETED',
];

const ORCHESTRATION_METHODS = [
  'switchConversation',
  'switchMode',
  'startNewSession',
  'openHistorySession',
  'openComparisonSession',
  'prepareRelaySession',
];

describe('结构约束与旧路径清除（TC09）', () => {
  it('字符串事件总线模块与事件协调器模块文件均不存在', () => {
    expect(existsSync(path.join(srcRoot, 'stores/store-events.ts'))).toBe(false);
    expect(existsSync(path.join(srcRoot, 'stores/store-coordinator.ts'))).toBe(false);
  });

  it('全仓源码不存在会话相关事件常量的 emit 调用', () => {
    const violations: string[] = [];
    for (const file of collectSources(srcRoot)) {
      const source = readFileSync(file, 'utf8');
      for (const eventName of REMOVED_EVENT_CONSTANTS) {
        if (source.includes(eventName)) {
          violations.push(`${path.relative(srcRoot, file)}: ${eventName}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('会话 store 不再导出编排方法', () => {
    const source = read('stores/conversations-store.ts');
    for (const method of ORCHESTRATION_METHODS) {
      expect(source).not.toContain(method);
    }
  });

  it('聊天 store 不 import 会话、对比、历史或音频历史 store', () => {
    const source = read('stores/chat-store.ts');
    expect(source).not.toMatch(/from '\.\/(conversations|comparison|history|audio-history)-store'/);
    expect(source).not.toMatch(/from '@\/stores\/(conversations|comparison|history|audio-history)-store'/);
  });

  it('端口、编排与双快照类型的签名中不出现 any', () => {
    const portSource = read('stores/conversation-port.ts');
    const orchestratorSource = read('stores/conversation-orchestrator.ts');
    // 双快照的持久化接口：转换函数与 Message / ArchivedMessage 类型定义
    const snapshotSource = read('lib/conversation/message-snapshots.ts');
    const messageTypes = read('types/chat-message.ts');
    for (const source of [portSource, orchestratorSource, snapshotSource, messageTypes]) {
      expect(source).not.toMatch(/:\s*any\b|<any>|as any/);
    }
  });

  it('聊天工作区经编排命令完成发送事务与模型切换，不直接双写', () => {
    const source = read('app/chat/chat-workspace.tsx');
    expect(source).toContain('conversationOrchestrator.sendChatMessage');
    expect(source).toContain('conversationOrchestrator.updateSessionModel');
    expect(source).not.toContain('ensureActiveConversation');
    expect(source).not.toContain('loadConversation(');
    expect(source).not.toContain('switchProvider(');
    expect(source).not.toContain('setCapabilityPackKey(');
  });
});
