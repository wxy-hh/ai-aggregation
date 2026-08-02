'use client';

import { useCallback, useRef } from 'react';
import { authFetch } from '@/lib/api/client';
import { createDestinyHistoryItem } from '@/lib/utils/history-helpers';
import { generateUUID } from '@/lib/utils/uuid';
import { useHistoryStore } from '@/stores/history-store';
import type {
  CompatibilityReport,
  CompatibilityStreamEvent,
  CompatibilityStreamStatus,
  PartnerProfileForm,
  RelationType,
} from '../types';
import type { BaziFormData } from '../../bazi-types';
import type { DestinyProvider } from '@/stores/destiny-workspace-store';

function parseStreamBlock(block: string): CompatibilityStreamEvent | null {
  const data = block
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('\n')
    .trim();
  if (!data) return null;
  return JSON.parse(data) as CompatibilityStreamEvent;
}

async function consumeStream(
  response: Response,
  onEvent: (event: CompatibilityStreamEvent) => void
) {
  if (!response.body) throw new Error('响应体为空');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx !== -1) {
      const block = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 2);
      const event = block ? parseStreamBlock(block) : null;
      if (event) onEvent(event);
      idx = buffer.indexOf('\n\n');
    }
  }
  const tail = `${buffer}${decoder.decode()}`.trim();
  const event = tail ? parseStreamBlock(tail) : null;
  if (event) onEvent(event);
}

function mapSelf(form: BaziFormData) {
  return {
    name: form.name,
    gender: form.gender,
    calendarType: form.calendarType,
    birthDate: form.birthDate,
    birthTime: form.birthTime,
    location: form.location,
  };
}

function mapPartner(form: PartnerProfileForm) {
  return {
    name: form.displayName.trim() || 'TA',
    gender: form.gender === 'unspecified' ? null : form.gender,
    calendarType: form.calendarType,
    birthDate: form.birthDate,
    birthTime: form.birthTime,
    location: form.locationSkipped
      ? null
      : form.location
        ? {
            name: form.location.name,
            lat: form.location.lat,
            lon: form.location.lon,
          }
        : null,
  };
}

export function useCompatibilityFlow() {
  const abortRef = useRef<AbortController | null>(null);

  const generate = useCallback(
    async (args: {
      selfForm: BaziFormData;
      partnerForm: PartnerProfileForm;
      relationType: RelationType;
      provider: DestinyProvider;
      sourceBaziHistoryId?: string | null;
      existingReportId?: string;
      viewOnly?: boolean;
      onStatus: (s: CompatibilityStreamStatus | null) => void;
      onReport: (report: CompatibilityReport) => void;
      onError: (message: string) => void;
    }) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await authFetch('/api/destiny/compatibility-report', {
          method: 'POST',
          body: JSON.stringify({
            self: mapSelf(args.selfForm),
            partner: mapPartner(args.partnerForm),
            relationType: args.relationType,
            focusTags: args.partnerForm.focusTags,
            provider: args.provider,
            consentConfirmed: true as const,
            sourceBaziHistoryId: args.sourceBaziHistoryId ?? null,
            existingReportId: args.existingReportId,
            viewOnly: args.viewOnly ?? false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({} as Record<string, unknown>));
          const code = typeof err?.code === 'string' ? err.code : undefined;
          const message =
            (typeof err?.error === 'string' && err.error) ||
            (typeof err?.message === 'string' && err.message) ||
            '合盘生成失败';
          // 额度不足：authFetch 已触发全局弹框；带上 code 供上层避免页内重复提示
          const error = new Error(message) as Error & { code?: string };
          if (
            response.status === 402 ||
            code === 'QUOTA_INSUFFICIENT' ||
            code === 'QUOTA_EXHAUSTED'
          ) {
            error.code = code || 'QUOTA_INSUFFICIENT';
          }
          throw error;
        }

        let finalReport: CompatibilityReport | null = null;

        await consumeStream(response, (event) => {
          if (event.type === 'status') {
            args.onStatus(event.status);
            return;
          }
          if (event.type === 'complete') {
            finalReport = event.report;
            args.onReport(event.report);
            return;
          }
          if (event.type === 'error') {
            throw new Error(event.error);
          }
        });

        if (finalReport) {
          const report = finalReport as CompatibilityReport;
          const partnerName = report.partnerDisplayName || 'TA';
          const historyId = report.id || args.existingReportId || generateUUID();
          const formPayload = {
            self: mapSelf(args.selfForm),
            partner: mapPartner(args.partnerForm),
            relationType: args.relationType,
            focusTags: args.partnerForm.focusTags,
          };

          // viewOnly：合并已缓存视角后回写同一档案，避免重复条目
          let reportToStore = report;
          if (args.viewOnly && args.existingReportId) {
            const existing = useHistoryStore.getState().getItemById(args.existingReportId);
            if (existing?.type === 'destiny' && existing.subType === 'bazi-compatibility') {
              const prevReport = existing.reportData as CompatibilityReport | null;
              if (prevReport?.views) {
                reportToStore = {
                  ...report,
                  id: historyId,
                  views: { ...prevReport.views, ...report.views },
                };
              }
            }
          }

          const historyItem = createDestinyHistoryItem(
            'bazi-compatibility',
            formPayload,
            reportToStore as unknown as Record<string, unknown>,
            args.provider,
            {
              id: historyId,
              title: `我 × ${partnerName} · 合盘`,
              preview:
                reportToStore.views[args.relationType]?.oneLiner ||
                reportToStore.views[reportToStore.relationType]?.oneLiner ||
                '八字合盘报告',
              coreTone: '八字合盘',
            }
          );

          const store = useHistoryStore.getState();
          if (store.getItemById(historyId)) {
            store.updateItem(historyId, historyItem);
          } else {
            store.addItem(historyItem);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        args.onError(error instanceof Error ? error.message : '合盘生成失败');
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        args.onStatus(null);
      }
    },
    []
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { generate, abort };
}
