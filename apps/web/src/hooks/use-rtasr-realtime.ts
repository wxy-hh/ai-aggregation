'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from '@/components/voice/transcript-list';

export type RtasrStatus =
  | 'idle'
  | 'connecting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface UseRtasrRealtimeResult {
  status: RtasrStatus;
  error: string | null;
  segments: TranscriptSegment[];
  level: number;
  elapsedMs: number;
  start: (opts?: { pd?: string }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<TranscriptSegment[]>;
}

type GatewayEvent =
  | { type: 'status'; status: 'connected' | 'started' | 'stopped' }
  | { type: 'result'; segId?: number; isEnd?: boolean; text: string; raw?: any }
  | { type: 'error'; message: string; raw?: any };

type ControlMessage = { type: 'start'; pd?: string } | { type: 'end' } | { type: 'ping' };

interface StopWaiter {
  promise: Promise<TranscriptSegment[]>;
  resolve: (segments: TranscriptSegment[]) => void;
}

const TARGET_SAMPLE_RATE = 16000;
const FRAME_MS = 40;
const FRAME_SAMPLES = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000;
const STOP_TIMEOUT_MS = 5000;

function formatTimeFromMs(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resampleLinear(input: Float32Array, inputRate: number, outputRate: number): Float32Array {
  if (inputRate === outputRate) return input;

  const ratio = inputRate / outputRate;
  const outLength = Math.floor(input.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }

  return out;
}

function floatToInt16LE(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

function buildNextSegments(
  previous: TranscriptSegment[],
  evt: Extract<GatewayEvent, { type: 'result' }>,
  timestamp: string
): TranscriptSegment[] {
  const segId = evt.segId ?? null;
  const next = previous.map((segment) => ({ ...segment, active: false }));
  const id = segId !== null ? String(segId) : String(next.length + 1);
  const last = next[next.length - 1];

  if (last && last.id === id) {
    next[next.length - 1] = {
      ...last,
      text: evt.text,
      timestamp,
      active: true,
    };
    return next;
  }

  next.push({
    id,
    timestamp,
    speaker: 'Speaker A',
    role: 'Speaker A',
    text: evt.text,
    active: true,
  });

  return next;
}

export function useRtasrRealtime(): UseRtasrRealtimeResult {
  const [status, setStatus] = useState<RtasrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [level, setLevel] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const statusRef = useRef<RtasrStatus>('idle');
  const segmentsRef = useRef<TranscriptSegment[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);

  const pcmQueueRef = useRef<Int16Array[]>([]);
  const queuedSamplesRef = useRef<number>(0);
  const sendTimerRef = useRef<number | null>(null);
  const levelFrameRef = useRef<number | null>(null);
  const levelPendingRef = useRef<number>(0);

  const stopWaiterRef = useRef<StopWaiter | null>(null);
  const stopTimeoutRef = useRef<number | null>(null);

  const gatewayUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_RTASR_GATEWAY_URL;
    return envUrl || 'ws://localhost:8787';
  }, []);

  const setStatusSafe = useCallback((nextStatus: RtasrStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const clearStopTimeout = useCallback(() => {
    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearStopTimeout();
    stopWaiterRef.current = null;
    pcmQueueRef.current = [];
    queuedSamplesRef.current = 0;
    if (levelFrameRef.current !== null) {
      window.cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = null;
    }
    levelPendingRef.current = 0;
    setSegments([]);
    setError(null);
    setLevel(0);
    setElapsedMs(0);
    pausedElapsedRef.current = 0;
  }, [clearStopTimeout]);

  const stopTimers = useCallback(() => {
    if (sendTimerRef.current !== null) {
      window.clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
  }, []);

  const scheduleLevelUpdate = useCallback((nextLevel: number) => {
    levelPendingRef.current = nextLevel;

    if (levelFrameRef.current !== null) return;

    levelFrameRef.current = window.requestAnimationFrame(() => {
      levelFrameRef.current = null;
      setLevel(levelPendingRef.current);
    });
  }, []);

  const resolveStopWaiter = useCallback(
    (finalSegments: TranscriptSegment[] = segmentsRef.current) => {
      clearStopTimeout();
      const waiter = stopWaiterRef.current;
      stopWaiterRef.current = null;
      waiter?.resolve(finalSegments);
    },
    [clearStopTimeout]
  );

  const teardownMedia = useCallback(async () => {
    stopTimers();
    if (levelFrameRef.current !== null) {
      window.cancelAnimationFrame(levelFrameRef.current);
      levelFrameRef.current = null;
    }
    setLevel(0);

    try {
      workletNodeRef.current?.disconnect();
    } catch { }
    workletNodeRef.current = null;

    try {
      await audioContextRef.current?.close();
    } catch { }
    audioContextRef.current = null;

    try {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    } catch { }
    mediaStreamRef.current = null;
  }, [stopTimers]);

  const closeSocket = useCallback((sendEnd: boolean) => {
    const ws = wsRef.current;
    wsRef.current = null;

    if (ws && ws.readyState === WebSocket.OPEN && sendEnd) {
      const msg: ControlMessage = { type: 'end' };
      ws.send(JSON.stringify(msg));
    }

    try {
      ws?.close();
    } catch { }
  }, []);

  const closeAll = useCallback(
    async (sendEnd: boolean) => {
      clearStopTimeout();
      resolveStopWaiter();
      await teardownMedia();
      closeSocket(sendEnd);
    },
    [clearStopTimeout, closeSocket, resolveStopWaiter, teardownMedia]
  );

  const finalizeStop = useCallback(
    async (finalSegments: TranscriptSegment[] = segmentsRef.current) => {
      await teardownMedia();
      setStatusSafe('stopped');
      closeSocket(false);
      resolveStopWaiter(finalSegments);
    },
    [closeSocket, resolveStopWaiter, setStatusSafe, teardownMedia]
  );

  useEffect(() => {
    if (status !== 'running') return;

    const id = window.setInterval(() => {
      if (!startedAtRef.current) return;
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 200);

    return () => window.clearInterval(id);
  }, [status]);

  const enqueuePcm = useCallback((pcm: Int16Array) => {
    if (pcm.length === 0) return;
    pcmQueueRef.current.push(pcm);
    queuedSamplesRef.current += pcm.length;
  }, []);

  const pullFrame = useCallback((): Int16Array | null => {
    if (queuedSamplesRef.current < FRAME_SAMPLES) return null;

    const frame = new Int16Array(FRAME_SAMPLES);
    let written = 0;

    while (written < FRAME_SAMPLES) {
      const head = pcmQueueRef.current[0];
      if (!head) break;

      const need = FRAME_SAMPLES - written;
      const take = Math.min(need, head.length);
      frame.set(head.subarray(0, take), written);
      written += take;

      if (take === head.length) {
        pcmQueueRef.current.shift();
      } else {
        pcmQueueRef.current[0] = head.subarray(take);
      }

      queuedSamplesRef.current -= take;
    }

    return frame;
  }, []);

  const flushQueuedAudio = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    let frame = pullFrame();
    while (frame) {
      ws.send(frame.buffer);
      frame = pullFrame();
    }

    if (queuedSamplesRef.current <= 0) {
      return;
    }

    const remaining = new Int16Array(queuedSamplesRef.current);
    let offset = 0;

    while (pcmQueueRef.current.length > 0) {
      const chunk = pcmQueueRef.current.shift();
      if (!chunk) continue;
      remaining.set(chunk, offset);
      offset += chunk.length;
    }

    pcmQueueRef.current = [];
    queuedSamplesRef.current = 0;

    if (remaining.length > 0) {
      ws.send(remaining.buffer);
    }
  }, [pullFrame]);

  const startSending = useCallback(() => {
    if (sendTimerRef.current !== null) return;

    sendTimerRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (statusRef.current !== 'running') return;

      const frame = pullFrame();
      if (!frame) return;

      ws.send(frame.buffer);
    }, FRAME_MS);
  }, [pullFrame]);

  const updateSegments = useCallback((evt: Extract<GatewayEvent, { type: 'result' }>) => {
    const now = Date.now();
    const timestamp = startedAtRef.current ? formatTimeFromMs(now - startedAtRef.current) : '00:00';
    const nextSegments = buildNextSegments(segmentsRef.current, evt, timestamp);
    segmentsRef.current = nextSegments;
    setSegments(nextSegments);
    return nextSegments;
  }, []);

  const hasMediaDevices = useCallback(() => {
    return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
  }, []);

  const onGatewayEvent = useCallback(
    (evt: GatewayEvent) => {
      if (evt.type === 'error') {
        setError(evt.message || '网关错误');

        if (statusRef.current === 'stopping') {
          void finalizeStop();
          return;
        }

        setStatusSafe('error');
        return;
      }

      if (evt.type === 'status') {
        if (evt.status === 'stopped' && statusRef.current === 'stopping') {
          void finalizeStop();
        }
        return;
      }

      const nextSegments = updateSegments(evt);
      if (evt.isEnd && statusRef.current === 'stopping') {
        void finalizeStop(nextSegments);
      }
    },
    [finalizeStop, updateSegments]
  );

  const start = useCallback(
    async (opts?: { pd?: string }) => {
      if (statusRef.current === 'connecting' || statusRef.current === 'running') return;

      reset();
      setStatusSafe('connecting');
      if (!hasMediaDevices()) {
        setError('当前浏览器环境不支持麦克风采集，请使用支持录音权限的浏览器或 HTTPS/localhost 环境。');
        setStatusSafe('error');
        return;
      }

      try {
        const ws = new WebSocket(gatewayUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = async () => {
          try {
            if (!hasMediaDevices()) {
              throw new Error(
                '当前浏览器环境不支持麦克风采集，请使用支持录音权限的浏览器或 HTTPS/localhost 环境。'
              );
            }

            const msg: ControlMessage = { type: 'start', pd: opts?.pd };
            ws.send(JSON.stringify(msg));

            startedAtRef.current = Date.now();
            pausedElapsedRef.current = 0;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const ctx = new AudioContext();
            audioContextRef.current = ctx;

            await ctx.audioWorklet.addModule('/worklets/pcm-capture-processor.js');

            const source = ctx.createMediaStreamSource(stream);
            const node = new AudioWorkletNode(ctx, 'pcm-capture-processor');
            workletNodeRef.current = node;

            node.port.onmessage = (event) => {
              const { type, sampleRate, buffer } = event.data || {};
              if (type !== 'pcm' || !buffer) return;

              const floats = new Float32Array(buffer);

              let sum = 0;
              for (let i = 0; i < floats.length; i++) {
                sum += floats[i] * floats[i];
              }
              const rms = Math.sqrt(sum / floats.length);
              scheduleLevelUpdate(Math.min(1, rms * 3));

              const resampled = resampleLinear(floats, sampleRate, TARGET_SAMPLE_RATE);
              enqueuePcm(floatToInt16LE(resampled));
            };

            const zeroGain = ctx.createGain();
            zeroGain.gain.value = 0;

            source.connect(node);
            node.connect(zeroGain);
            zeroGain.connect(ctx.destination);

            setStatusSafe('running');
            startSending();
          } catch (err) {
            setError(err instanceof Error ? err.message : '麦克风启动失败');
            setStatusSafe('error');
            await closeAll(false);
          }
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as GatewayEvent;
            onGatewayEvent(payload);
          } catch {
            // 网关可能发送了非 JSON 内容，这里忽略即可
          }
        };

        ws.onerror = () => {
          setError('WebSocket 连接失败');
          if (statusRef.current === 'stopping') {
            void finalizeStop();
            return;
          }
          setStatusSafe('error');
        };

        ws.onclose = () => {
          stopTimers();
          if (statusRef.current === 'stopping') {
            void finalizeStop();
            return;
          }

          setStatus((prev) => {
            const current = statusRef.current;
            if (current === 'running' || current === 'connecting' || current === 'paused') {
              return 'stopped';
            }
            return prev;
          });
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动失败');
        setStatusSafe('error');
        await closeAll(false);
      }
    },
    [
      hasMediaDevices,
      closeAll,
      enqueuePcm,
      finalizeStop,
      gatewayUrl,
      scheduleLevelUpdate,
      onGatewayEvent,
      reset,
      setStatusSafe,
      startSending,
      stopTimers,
    ]
  );

  const pause = useCallback(async () => {
    if (statusRef.current !== 'running') return;
    if (startedAtRef.current) {
      pausedElapsedRef.current = Date.now() - startedAtRef.current;
      setElapsedMs(pausedElapsedRef.current);
    }
    setStatusSafe('paused');
    try {
      await audioContextRef.current?.suspend();
    } catch { }
  }, [setStatusSafe]);

  const resume = useCallback(async () => {
    if (statusRef.current !== 'paused') return;
    startedAtRef.current = Date.now() - pausedElapsedRef.current;
    setStatusSafe('running');
    try {
      await audioContextRef.current?.resume();
    } catch { }
  }, [setStatusSafe]);

  const stop = useCallback(async (): Promise<TranscriptSegment[]> => {
    if (statusRef.current === 'idle' || statusRef.current === 'stopped') {
      return segmentsRef.current;
    }

    if (stopWaiterRef.current) {
      return stopWaiterRef.current.promise;
    }

    await teardownMedia();
    flushQueuedAudio();

    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      await finalizeStop();
      return segmentsRef.current;
    }

    setStatusSafe('stopping');

    const waiter: StopWaiter = {
      promise: Promise.resolve([] as TranscriptSegment[]),
      resolve: () => {},
    };

    waiter.promise = new Promise<TranscriptSegment[]>((resolve) => {
      waiter.resolve = resolve;
    });
    stopWaiterRef.current = waiter;

    stopTimeoutRef.current = window.setTimeout(() => {
      void finalizeStop();
    }, STOP_TIMEOUT_MS);

    const msg: ControlMessage = { type: 'end' };
    ws.send(JSON.stringify(msg));

    return waiter.promise;
  }, [finalizeStop, flushQueuedAudio, setStatusSafe, teardownMedia]);

  useEffect(() => {
    return () => {
      void closeAll(false);
    };
  }, [closeAll]);

  return {
    status,
    error,
    segments,
    level,
    elapsedMs,
    start,
    pause,
    resume,
    stop,
  };
}
