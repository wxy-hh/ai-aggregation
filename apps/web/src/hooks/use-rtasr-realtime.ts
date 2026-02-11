'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TranscriptSegment } from '@/components/voice/transcript-list';

export type RtasrStatus = 'idle' | 'connecting' | 'running' | 'paused' | 'stopped' | 'error';

export interface UseRtasrRealtimeResult {
  status: RtasrStatus;
  error: string | null;
  segments: TranscriptSegment[];
  level: number;
  elapsedMs: number;
  start: (opts?: { pd?: string }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  stop: () => Promise<void>;
}

type GatewayEvent =
  | { type: 'status'; status: 'connected' | 'started' | 'stopped' }
  | { type: 'result'; segId?: number; isEnd?: boolean; text: string; raw?: any }
  | { type: 'error'; message: string; raw?: any };

type ControlMessage = { type: 'start'; pd?: string } | { type: 'end' } | { type: 'ping' };

const TARGET_SAMPLE_RATE = 16000;
const FRAME_MS = 40;
const FRAME_SAMPLES = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000; // 640

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
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function useRtasrRealtime(): UseRtasrRealtimeResult {
  const [status, setStatus] = useState<RtasrStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [level, setLevel] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  const statusRef = useRef<RtasrStatus>('idle');

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);

  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const lastSegIdRef = useRef<number | null>(null);

  const pcmQueueRef = useRef<Int16Array[]>([]);
  const queuedSamplesRef = useRef<number>(0);
  const sendTimerRef = useRef<number | null>(null);

  const gatewayUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_RTASR_GATEWAY_URL;
    return envUrl || 'ws://localhost:8787';
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const reset = useCallback(() => {
    pcmQueueRef.current = [];
    queuedSamplesRef.current = 0;
    lastSegIdRef.current = null;
    setSegments([]);
    setError(null);
    setLevel(0);
    setElapsedMs(0);
    pausedElapsedRef.current = 0;
  }, []);

  const stopTimers = useCallback(() => {
    if (sendTimerRef.current) {
      window.clearInterval(sendTimerRef.current);
      sendTimerRef.current = null;
    }
  }, []);

  const closeAll = useCallback(
    async (sendEnd: boolean) => {
      stopTimers();

      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && ws.readyState === WebSocket.OPEN && sendEnd) {
        const msg: ControlMessage = { type: 'end' };
        ws.send(JSON.stringify(msg));
      }
      try {
        ws?.close();
      } catch { }

      try {
        workletNodeRef.current?.disconnect();
      } catch { }
      workletNodeRef.current = null;

      try {
        audioContextRef.current?.close();
      } catch { }
      audioContextRef.current = null;

      try {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      } catch { }
      mediaStreamRef.current = null;
    },
    [stopTimers]
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

  const startSending = useCallback(() => {
    if (sendTimerRef.current) return;

    sendTimerRef.current = window.setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (status !== 'running') return;

      const frame = pullFrame();
      if (!frame) return;

      ws.send(frame.buffer);
    }, FRAME_MS);
  }, [pullFrame, status]);

  const onGatewayEvent = useCallback((evt: GatewayEvent) => {
    if (evt.type === 'error') {
      setError(evt.message || '网关错误');
      setStatus('error');
      return;
    }

    if (evt.type === 'result') {
      const segId = evt.segId ?? null;
      const now = Date.now();
      const ts = startedAtRef.current ? formatTimeFromMs(now - startedAtRef.current) : '00:00';

      setSegments((prev) => {
        const next = prev.map((s) => ({ ...s, active: false }));

        const id = segId !== null ? String(segId) : String(next.length + 1);
        const last = next[next.length - 1];

        if (last && last.id === id) {
          next[next.length - 1] = {
            ...last,
            text: evt.text,
            timestamp: ts,
            active: true,
          };
          return next;
        }

        next.push({
          id,
          timestamp: ts,
          speaker: 'Speaker A',
          role: 'Speaker A',
          text: evt.text,
          active: true,
        });

        return next;
      });

      lastSegIdRef.current = segId;
    }
  }, []);

  const start = useCallback(
    async (opts?: { pd?: string }) => {
      if (status === 'connecting' || status === 'running') return;

      reset();
      setStatus('connecting');

      try {
        const ws = new WebSocket(gatewayUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = async () => {
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

          node.port.onmessage = (e) => {
            const { type, sampleRate, buffer } = e.data || {};
            if (type !== 'pcm' || !buffer) return;

            const floats = new Float32Array(buffer);

            // Level meter (RMS)
            let sum = 0;
            for (let i = 0; i < floats.length; i++) sum += floats[i] * floats[i];
            const rms = Math.sqrt(sum / floats.length);
            setLevel(Math.min(1, rms * 3));

            const resampled = resampleLinear(floats, sampleRate, TARGET_SAMPLE_RATE);
            const int16 = floatToInt16LE(resampled);
            enqueuePcm(int16);
          };

          // Keep the audio graph alive. No need to connect to destination to avoid feedback.
          const zeroGain = ctx.createGain();
          zeroGain.gain.value = 0;

          source.connect(node);
          node.connect(zeroGain);
          zeroGain.connect(ctx.destination);

          setStatus('running');
          startSending();
        };

        ws.onmessage = (e) => {
          try {
            const payload = JSON.parse(String(e.data)) as GatewayEvent;
            onGatewayEvent(payload);
          } catch {
            // ignore
          }
        };

        ws.onerror = () => {
          setError('WebSocket 连接失败');
          setStatus('error');
        };

        ws.onclose = () => {
          stopTimers();
          setStatus((prev) => {
            const current = statusRef.current;
            if (current === 'running' || current === 'connecting') return 'stopped';
            return prev;
          });
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : '启动失败');
        setStatus('error');
        await closeAll(false);
      }
    },
    [
      closeAll,
      enqueuePcm,
      gatewayUrl,
      onGatewayEvent,
      reset,
      startSending,
      status,
      stopTimers,
    ]
  );

  const pause = useCallback(async () => {
    if (status !== 'running') return;
    if (startedAtRef.current) {
      pausedElapsedRef.current = Date.now() - startedAtRef.current;
      setElapsedMs(pausedElapsedRef.current);
    }
    setStatus('paused');
    try {
      await audioContextRef.current?.suspend();
    } catch { }
  }, [status]);

  const resume = useCallback(async () => {
    if (status !== 'paused') return;
    startedAtRef.current = Date.now() - pausedElapsedRef.current;
    setStatus('running');
    try {
      await audioContextRef.current?.resume();
    } catch { }
  }, [status]);

  const stop = useCallback(async () => {
    if (status === 'idle' || status === 'stopped') return;
    setStatus('stopped');
    await closeAll(true);
  }, [closeAll, status]);

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
