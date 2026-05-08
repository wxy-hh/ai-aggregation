import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRtasrRealtime } from './use-rtasr-realtime';

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  binaryType = 'blob';
  sent: Array<string | ArrayBuffer> = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(public readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({} as CloseEvent);
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.({} as Event);
  }

  emitMessage(data: unknown) {
    this.onmessage?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
    } as MessageEvent);
  }
}

class MockAudioContext {
  audioWorklet = {
    addModule: vi.fn().mockResolvedValue(undefined),
  };
  destination = {};
  close = vi.fn().mockResolvedValue(undefined);
  suspend = vi.fn().mockResolvedValue(undefined);
  resume = vi.fn().mockResolvedValue(undefined);
  createMediaStreamSource = vi.fn().mockReturnValue({
    connect: vi.fn(),
  });
  createGain = vi.fn().mockReturnValue({
    gain: { value: 1 },
    connect: vi.fn(),
  });
}

class MockAudioWorkletNode {
  port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
  };
  connect = vi.fn();
  disconnect = vi.fn();
}

describe('useRtasrRealtime', () => {
  const trackStop = vi.fn();

  beforeEach(() => {
    MockWebSocket.instances = [];
    trackStop.mockReset();

    vi.stubGlobal('WebSocket', MockWebSocket as unknown as typeof WebSocket);
    vi.stubGlobal('AudioContext', MockAudioContext as unknown as typeof AudioContext);
    vi.stubGlobal(
      'AudioWorkletNode',
      MockAudioWorkletNode as unknown as typeof AudioWorkletNode
    );

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: trackStop }],
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('stop 会等待尾包结果后再关闭连接，并返回最终转写内容', async () => {
    const { result } = renderHook(() => useRtasrRealtime());

    await act(async () => {
      await result.current.start();
    });

    const ws = MockWebSocket.instances[0];
    expect(ws).toBeDefined();

    await act(async () => {
      ws.emitOpen();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('running');
    });

    act(() => {
      ws.emitMessage({ type: 'result', segId: 1, isEnd: false, text: '前半句' });
    });

    let finalSegments: Awaited<ReturnType<typeof result.current.stop>> = [];
    let stopPromise: Promise<Awaited<ReturnType<typeof result.current.stop>>> | null = null;

    await act(async () => {
      stopPromise = result.current.stop();
      await Promise.resolve();
    });

    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('stopping');
    expect(ws.sent).toContain(JSON.stringify({ type: 'end' }));
    expect(ws.readyState).toBe(MockWebSocket.OPEN);

    act(() => {
      ws.emitMessage({ type: 'result', segId: 2, isEnd: true, text: '收尾句' });
    });

    await act(async () => {
      finalSegments = await stopPromise!;
    });

    expect(ws.readyState).toBe(MockWebSocket.CLOSED);
    expect(result.current.status).toBe('stopped');
    expect(finalSegments.map((segment) => segment.text)).toEqual(['前半句', '收尾句']);
  });

  it('浏览器不支持 getUserMedia 时返回可读错误而不是抛出未捕获异常', async () => {
    vi.stubGlobal('navigator', {});

    const { result } = renderHook(() => useRtasrRealtime());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toContain('不支持麦克风采集');
  });
});
