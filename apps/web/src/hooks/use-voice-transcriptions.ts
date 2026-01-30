import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  uploadVoiceFile,
  fetchTranscriptions,
  fetchTranscription,
  deleteTranscription,
} from '@/lib/api/voice';
import type { FetchTranscriptionsParams } from '@/types/voice';

export function useVoiceTranscriptions(params?: FetchTranscriptionsParams) {
  return useQuery({
    queryKey: ['voice-transcriptions', params],
    queryFn: () => fetchTranscriptions(params),
    staleTime: 30000, // 30 秒缓存
  });
}

export function useVoiceTranscription(id: string) {
  return useQuery({
    queryKey: ['voice-transcription', id],
    queryFn: () => fetchTranscription(id),
    enabled: !!id,
  });
}

export function useUploadVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, model }: { file: File; model?: string }) => uploadVoiceFile(file, model),
    onSuccess: () => {
      // 刷新历史记录列表
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
    },
  });
}

export function useDeleteVoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTranscription(id),
    onSuccess: () => {
      // 刷新历史记录列表
      queryClient.invalidateQueries({ queryKey: ['voice-transcriptions'] });
    },
  });
}
