export interface STTJobData {
  taskId: string;
  userId: string;
  audioUrl: string;
  language?: string;
}

export interface PPTJobData {
  taskId: string;
  userId: string;
  content: string;
  template?: string;
}

export interface ImageJobData {
  taskId: string;
  userId: string;
  prompt: string;
  size?: string;
  style?: string;
}

export const JOB_NAMES = {
  STT: 'stt',
  PPT: 'ppt',
  IMAGE: 'image',
} as const;
