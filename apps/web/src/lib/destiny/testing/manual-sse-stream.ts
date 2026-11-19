const encoder = new TextEncoder();

/**
 * 手工可控的 SSE 测试流对象接口
 */
export interface ManualSseStream {
  /** 包装了可控 ReadableStream 的 200 text/event-stream 响应对象 */
  response: Response;
  /** 推送一帧（可传原始文本以模拟分块与 CRLF，或传入对象自动包装为 data: ...\n\n） */
  push: (event: unknown | string) => void;
  /** 关闭流 */
  close: () => void;
}

/**
 * 手工可控的 SSE 流：测试自行决定何时推帧、何时关流
 *
 * 移植自占星测试（apps/web/src/lib/astrology/chart-request.test.ts:60-80），
 * 供后续命理各学科会话命令深模块（八字、紫微、奇门）的单测复用。
 */
export function manualSseStream(): ManualSseStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });

  return {
    response: new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }),
    push(event: unknown | string) {
      const text = typeof event === 'string' ? event : `data: ${JSON.stringify(event)}\n\n`;
      controller.enqueue(encoder.encode(text));
    },
    close() {
      controller.close();
    },
  };
}
