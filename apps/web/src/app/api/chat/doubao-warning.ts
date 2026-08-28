export function getDoubaoIncompleteWarning(data: unknown): string | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const payload = data as {
    type?: string;
    status?: string;
    incomplete_details?: {
      reason?: string;
    };
    response?: {
      status?: string;
      incomplete_details?: {
        reason?: string;
      };
    };
  };

  // 上游可能以独立事件 response.incomplete 结束，也可能在 response.done 内携带
  // incomplete 状态，两种形态都要识别（适配器对三者都调用本函数）。
  if (payload.type !== 'response.done' && payload.type !== 'response.incomplete') {
    return null;
  }

  const isIncomplete = payload.response?.status === 'incomplete' || payload.status === 'incomplete';
  const reason = payload.response?.incomplete_details?.reason || payload.incomplete_details?.reason;

  if (isIncomplete || reason) {
    return '回答可能被截断，请尝试继续追问或缩小问题范围。';
  }

  return null;
}
