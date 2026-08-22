/**
 * 前端共享 SSE 消费工具
 *
 * 说明：
 * - 统一 `data: <json>\n\n` 分帧解析与流消费循环
 * - 提供通用错误响应读取，避免各 workspace 重复实现
 */

type ConsumeSseOptions<T> = {
  onEvent: (event: T) => void;
  onError?: (error: unknown) => void;
};

function parseSsePayload(block: string): string | null {
  const data = block.startsWith('data: ') ? block.slice(6).trim() : null;
  return data || null;
}

export async function consumeSse<T>(
  response: Response,
  { onEvent, onError }: ConsumeSseOptions<T>
): Promise<void> {
  if (!response.body) throw new Error('响应体为空');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const block = buffer.slice(0, separatorIndex).trim();
        buffer = buffer.slice(separatorIndex + 2);

        if (block) {
          const payload = parseSsePayload(block);
          if (payload) {
            onEvent(JSON.parse(payload) as T);
          }
        }

        separatorIndex = buffer.indexOf('\n\n');
      }
    }

    const tail = `${buffer}${decoder.decode()}`.trim();
    if (tail) {
      const payload = parseSsePayload(tail);
      if (payload) {
        onEvent(JSON.parse(payload) as T);
      }
    }
  } catch (error) {
    onError?.(error);
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // 流已关闭时忽略
    }
  }
}

export async function readSseErrorMessage(
  response: Response
): Promise<string | undefined> {
  try {
    const json = (await response.json()) as { error?: string };
    return json.error;
  } catch {
    return undefined;
  }
}
