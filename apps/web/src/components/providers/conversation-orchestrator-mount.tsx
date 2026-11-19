'use client';

import dynamic from 'next/dynamic';

/**
 * 会话编排挂载点（客户端组件）。
 *
 * 通过 dynamic 懒加载 conversation-orchestrator，使根布局不再静态引入
 * conversations/history/relay 等重量级 store（含 Dexie），
 * 避免 layout chunk 膨胀——这些 store 由实际使用它们的页面 chunk 携带即可。
 */
const OrchestratorEffect = dynamic(
  () => import('@/stores/conversation-orchestrator').then((m) => m.OrchestratorEffect),
  { ssr: false }
);

export function ConversationOrchestratorMount() {
  return <OrchestratorEffect />;
}
