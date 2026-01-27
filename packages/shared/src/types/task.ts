export type TaskType = 'stt' | 'ppt' | 'image';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Task {
  id: string;
  userId: string;
  type: TaskType;
  status: TaskStatus;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface TaskProgress {
  taskId: string;
  progress: number;
  message?: string;
}
