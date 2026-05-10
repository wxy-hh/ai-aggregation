import type {
  TranscribeResponse,
  TranscriptionsResponse,
  VoiceTranscription,
  FetchTranscriptionsParams,
} from '@/types/voice';
import { getAccessToken } from '@/lib/api/client';

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function uploadVoiceFile(file: File, model?: string): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (model) {
    formData.append('model', model);
  }

  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: '服务器错误' }));
    const errorMessage = error.error || error.details || '上传失败';
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function fetchTranscriptions(
  params?: FetchTranscriptionsParams
): Promise<TranscriptionsResponse> {
  const searchParams = new URLSearchParams();

  if (params?.page) searchParams.set('page', params.page.toString());
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);

  const response = await fetch(`/api/voice/transcriptions?${searchParams}`, { headers: authHeaders() });

  if (!response.ok) {
    throw new Error('获取记录失败');
  }

  return response.json();
}

export async function fetchTranscription(id: string): Promise<VoiceTranscription> {
  const response = await fetch(`/api/voice/transcriptions/${id}`, { headers: authHeaders() });

  if (!response.ok) {
    throw new Error('获取记录失败');
  }

  return response.json();
}

export async function deleteTranscription(id: string): Promise<void> {
  const response = await fetch(`/api/voice/transcriptions/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });

  if (!response.ok) {
    throw new Error('删除失败');
  }
}
