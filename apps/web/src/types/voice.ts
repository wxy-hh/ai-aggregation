export interface VoiceTranscription {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  duration: number | null;
  format: string;
  model: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  transcription: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface TranscribeRequest {
  file: File;
  model?: string;
}

export interface TranscribeResponse {
  id: string;
  status: string;
  transcription?: string;
  message: string;
}

export interface TranscriptionsResponse {
  data: VoiceTranscription[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface FetchTranscriptionsParams {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
}
