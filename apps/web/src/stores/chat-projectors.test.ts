import { describe, it, expect } from 'vitest';
import type { Message, Attachment } from './chat-store';
import type { Artifact, ArtifactMeta, AgentPlan, PlanStepStatus } from '@repo/shared';
import {
  projectReasoningStart,
  projectCalculateReasoningDuration,
  projectStreamFrame,
  projectStreamContentDelta,
  projectReasoningContentDelta,
  projectFreezeReasoningDuration,
  projectFinalizeStreamingMessage,
  projectToolCall,
  projectToolResult,
  projectAgentNote,
  projectArtifactStart,
  projectAssociateArtifact,
  projectArtifactDelta,
  projectArtifactEnd,
  projectFinalizeArtifacts,
  projectPlanCreated,
  projectPlanStepUpdate,
  projectToolApprovalRequest,
  projectExpireApprovals,
  projectRejectApproval,
} from './chat-projectors';

describe('apps/web/src/stores/chat-projectors.test.ts', () => {
  const createBaseAssistantMessage = (id = 'asst-1'): Message => ({
    id,
    role: 'assistant',
    content: '',
    isStreaming: true,
  });

  describe('TC01: 正文与深度思考流纯函数投影', () => {
    it('首个 text delta 到达时若有思考内容自动计算并冻结推理时长', () => {
      const msg: Message = {
        ...createBaseAssistantMessage(),
        reasoningContent: '深度思考步骤...',
      };
      // 场景 1：有思考内容，起始时间戳为 1000，到达时间为 2250，自动计算时长 1250ms 并冻结
      const timing = { startedAt: 1000 };
      const calcResult = projectCalculateReasoningDuration(timing, 2250);
      expect(calcResult.durationMs).toBe(1250);

      const frozenMsg = projectFreezeReasoningDuration(msg, calcResult.durationMs);
      expect(frozenMsg.reasoningDurationMs).toBe(1250);

      // 幂等：若已冻结则不覆盖
      const secondCall = projectFreezeReasoningDuration(frozenMsg, 3000);
      expect(secondCall.reasoningDurationMs).toBe(1250);

      // 场景 2：无思考内容（无 startedAt），返回 undefined，消息不写入时长
      const noThinkingCalc = projectCalculateReasoningDuration(undefined, 2250);
      expect(noThinkingCalc.durationMs).toBeUndefined();
      const plainMsg = createBaseAssistantMessage();
      const unfrozen = projectFreezeReasoningDuration(plainMsg, noThinkingCalc.durationMs);
      expect(unfrozen.reasoningDurationMs).toBeUndefined();
    });

    it('delta 内容正确累加', () => {
      const msg = createBaseAssistantMessage();
      const s1 = projectStreamContentDelta(msg, 'Hello');
      expect(s1.content).toBe('Hello');
      const s2 = projectStreamContentDelta(s1, ' World');
      expect(s2.content).toBe('Hello World');
    });

    it('首个 reasoning delta 到达记录起始时间戳且增量正确累加', () => {
      // 1. 首个 reasoning delta 到达时记录起始时间戳
      const initialTiming = undefined;
      const startedTiming = projectReasoningStart(initialTiming, 1500);
      expect(startedTiming.startedAt).toBe(1500);

      // 重复到达保持幂等，不覆盖起始时间戳
      const secondTiming = projectReasoningStart(startedTiming, 2000);
      expect(secondTiming.startedAt).toBe(1500);

      // 2. 增量累加到 reasoningContent
      const msg = createBaseAssistantMessage();
      const s1 = projectReasoningContentDelta(msg, 'Think step 1\n');
      expect(s1.reasoningContent).toBe('Think step 1\n');
      const s2 = projectReasoningContentDelta(s1, 'Think step 2');
      expect(s2.reasoningContent).toBe('Think step 1\nThink step 2');
    });

    it('收尾流式消息时合并最新正文与推理状态并结束 isStreaming', () => {
      const msg = createBaseAssistantMessage();
      const finalized = projectFinalizeStreamingMessage(msg, {
        latestText: 'Final text',
        latestReasoning: 'Final reasoning',
        reasoningDurationMs: 1500,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimated: false },
      });
      expect(finalized.content).toBe('Final text');
      expect(finalized.reasoningContent).toBe('Final reasoning');
      expect(finalized.reasoningDurationMs).toBe(1500);
      expect(finalized.isStreaming).toBe(false);
      expect(finalized.usage?.totalTokens).toBe(30);
    });
  });

  describe('TC02: 工具调用与结果纯函数投影', () => {
    it('工具调用 running 状态追加与幂等', () => {
      const messages = [createBaseAssistantMessage('asst-1')];
      const call = { id: 'call-1', name: 'web_search', argsSummary: 'query: AI' };

      const { messages: nextMessages, changed } = projectToolCall(messages, 'asst-1', call);
      expect(changed).toBe(true);
      expect(nextMessages[0]?.toolCalls).toHaveLength(1);
      expect(nextMessages[0]?.toolCalls?.[0]).toEqual({
        id: 'call-1',
        name: 'web_search',
        argsSummary: 'query: AI',
        status: 'running',
        resultSummary: '',
      });

      // 幂等：重复同 callId 调用不重复追加
      const idempotent = projectToolCall(nextMessages, 'asst-1', call);
      expect(idempotent.changed).toBe(false);
      expect(idempotent.messages[0]?.toolCalls).toHaveLength(1);
    });

    it('工具结果终态更新', () => {
      const initialMessage: Message = {
        ...createBaseAssistantMessage('asst-1'),
        toolCalls: [
          {
            id: 'call-1',
            name: 'web_search',
            argsSummary: 'query: AI',
            status: 'running',
            resultSummary: '',
          },
        ],
      };

      const result = {
        callId: 'call-1',
        name: 'web_search',
        status: 'success' as const,
        summary: 'found 3 results',
        durationMs: 450,
      };

      const { messages: nextMessages, changed } = projectToolResult([initialMessage], 'asst-1', result);
      expect(changed).toBe(true);
      const targetCall = nextMessages[0]?.toolCalls?.[0];
      expect(targetCall?.status).toBe('success');
      expect(targetCall?.resultSummary).toBe('found 3 results');
      expect(targetCall?.durationMs).toBe(450);
    });

    it('工具产出图片并入消息附件', () => {
      const initialMessage = createBaseAssistantMessage('asst-1');
      const result = {
        callId: 'gen-img-1',
        name: 'generate_image',
        status: 'success' as const,
        summary: 'Image generated',
        attachment: {
          kind: 'image' as const,
          url: 'https://example.com/generated.png',
        },
      };

      const { messages: nextMessages } = projectToolResult([initialMessage], 'asst-1', result);
      const attachments = nextMessages[0]?.attachments;
      expect(attachments).toBeDefined();
      expect(attachments).toHaveLength(1);
      expect(attachments?.[0]?.id).toBe('tool-gen-img-1');
      expect(attachments?.[0]?.imageUrl).toBe('https://example.com/generated.png');
      expect(attachments?.[0]?.status).toBe('ready');
    });
  });

  describe('TC03: 过程旁白纯函数投影', () => {
    it('旁白增量切片与定位', () => {
      const initialMessage: Message = {
        ...createBaseAssistantMessage('asst-1'),
        toolCalls: [
          { id: 'c1', name: 't1', status: 'success', resultSummary: '', argsSummary: '' },
          { id: 'c2', name: 't2', status: 'running', resultSummary: '', argsSummary: '' },
        ],
      };

      const { messages, changed } = projectAgentNote([initialMessage], 'asst-1', 'Analyzing data...');
      expect(changed).toBe(true);
      expect(messages[0]?.agentNotes).toHaveLength(1);
      expect(messages[0]?.agentNotes?.[0]).toEqual({
        beforeCallIndex: 2,
        text: 'Analyzing data...',
      });
    });
  });

  describe('TC04: 产物协同生命周期纯函数投影', () => {
    const sampleArtifact: ArtifactMeta = {
      id: 'art-1',
      type: 'markdown',
      title: 'Quarterly Report',
    };

    it('产物 start 关联与新增', () => {
      const messages = [createBaseAssistantMessage('asst-1')];
      const now = Date.now();
      const artifacts = projectArtifactStart([], sampleArtifact, now);
      const associateRes = projectAssociateArtifact(messages, 'asst-1', 'art-1');

      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]?.id).toBe('art-1');
      expect(associateRes.changed).toBe(true);
      expect(associateRes.messages[0]?.artifactIds).toContain('art-1');
    });

    it('产物 delta 更新', () => {
      const now = Date.now();
      const artifacts = projectArtifactStart([], sampleArtifact, now);
      const nextArtifacts = projectArtifactDelta(artifacts, 'art-1', 'New section', now + 10);

      expect(nextArtifacts[0]?.content).toBe('New section');
    });

    it('产物收尾与草稿标记', () => {
      const streamingArtifact: Artifact = {
        id: 'art-draft',
        type: 'code',
        title: 'Draft Code',
        content: 'const x = 1;',
        status: 'streaming',
      };
      const res = projectFinalizeArtifacts([streamingArtifact]);
      expect(res.changed).toBe(true);
      expect(res.artifacts[0]?.status).toBe('error');
    });
  });

  describe('TC05: 计划推进与审批卡片纯函数投影', () => {
    const samplePlan: AgentPlan = {
      id: 'plan-1',
      title: 'Conduct research',
      steps: [
        { id: 'step-1', title: 'Search papers', status: 'pending' },
        { id: 'step-2', title: 'Synthesize findings', status: 'pending' },
      ],
    };

    it('计划创建与检查点状态流式推进', () => {
      const messages = [createBaseAssistantMessage('asst-1')];
      const created = projectPlanCreated(messages, 'asst-1', samplePlan);
      expect(created.changed).toBe(true);
      expect(created.messages[0]?.plan?.title).toBe('Conduct research');

      const updated = projectPlanStepUpdate(created.messages, 'asst-1', 'step-1', 'completed', 'Read 5 papers');
      expect(updated.changed).toBe(true);
      expect(updated.messages[0]?.plan?.steps[0]?.status).toBe('completed');
      expect(updated.messages[0]?.plan?.steps[0]?.summary).toBe('Read 5 papers');
    });

    it('审批卡片生成与凭证绑定', () => {
      const messages = [createBaseAssistantMessage('asst-1')];
      const approvalData = {
        callId: 'call-wh-1',
        toolName: 'send_webhook',
        host: 'api.example.com',
        params: { message: 'alert' },
        token: 'hmac-token-123',
        expiresAt: Date.now() + 600000,
      };

      const res = projectToolApprovalRequest(messages, 'asst-1', approvalData);
      expect(res.changed).toBe(true);
      expect(res.messages[0]?.approval).toEqual({
        ...approvalData,
        status: 'pending',
      });
    });

    it('新消息追加自动失效未决审批', () => {
      const messagesWithPendingApproval: Message[] = [
        {
          id: 'asst-1',
          role: 'assistant',
          content: 'Need approval',
          approval: {
            callId: 'call-wh-1',
            toolName: 'send_webhook',
            host: 'api.example.com',
            params: {},
            token: 'tok-1',
            expiresAt: Date.now() + 600000,
            status: 'pending',
          },
        },
        {
          id: 'user-2',
          role: 'user',
          content: 'Next question',
        },
      ];

      const expired = projectExpireApprovals(messagesWithPendingApproval);
      expect(expired[0]?.approval?.status).toBe('expired');
    });

    it('用户拒绝审批置为 rejected', () => {
      const messagesWithPendingApproval: Message[] = [
        {
          id: 'asst-1',
          role: 'assistant',
          content: 'Need approval',
          approval: {
            callId: 'call-wh-1',
            toolName: 'send_webhook',
            host: 'api.example.com',
            params: {},
            token: 'tok-1',
            expiresAt: Date.now() + 600000,
            status: 'pending',
          },
        },
      ];

      const rejected = projectRejectApproval(messagesWithPendingApproval, 'asst-1');
      expect(rejected[0]?.approval?.status).toBe('rejected');
    });
  });
});
