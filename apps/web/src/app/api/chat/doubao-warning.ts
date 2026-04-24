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

  if (payload.type !== 'response.done') {
    return null;
  }

  const isIncomplete = payload.response?.status === 'incomplete' || payload.status === 'incomplete';
  const reason = payload.response?.incomplete_details?.reason || payload.incomplete_details?.reason;

  if (isIncomplete || reason) {
    return '回答可能被截断，请尝试继续追问或缩小问题范围。';
  }

  return null;
}
