// 消费聊天接口返回的标准 SSE 流
export async function consumeChatResponse(
  response: Response,
  onChunk: (chunk: string) => void,
  onWarning?: (warning: string) => void
): Promise<void> {
  const contentType = response.headers.get('Content-Type') || '';

  if (!contentType.includes('text/event-stream')) {
    throw new Error('聊天接口必须返回标准 SSE 响应');
  }

  if (!response.body) {
    throw new Error('响应体为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isDone = false;

  const processBlock = (block: string) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    const dataLines = lines.filter((line) => line.startsWith('data:'));
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
    if (!payload || payload === '[DONE]') {
      isDone = true;
      return;
    }

    try {
      const data = JSON.parse(payload) as {
        type?: string;
        text?: string;
        delta?: string;
        error?: string;
        warning?: string;
      };

      if (data.type === 'text-delta' && data.text) {
        onChunk(data.text);
        return;
      }

      if (data.type === 'response.output_text.delta' && data.delta) {
        onChunk(data.delta);
        return;
      }

      if (data.type === 'done' || data.type === 'response.done') {
        isDone = true;
        return;
      }

      if (data.type === 'warning' && typeof data.warning === 'string') {
        onWarning?.(data.warning);
        return;
      }

      if (data.type === 'error') {
        throw new Error(data.error || '流式响应失败');
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'SyntaxError') {
        throw error;
      }
      onChunk(payload);
    }
  };

  try {
    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        processBlock(block);
        if (isDone) {
          break;
        }
      }
    }

    const rest = buffer + decoder.decode();
    if (!isDone && rest.trim()) {
      processBlock(rest);
    }
  } finally {
    reader.releaseLock();
  }
}
