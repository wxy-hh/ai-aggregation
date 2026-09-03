/**
 * 任务类型单一事实源（评审 C3：收齐 qimen 任务，与 queue 的 JOB_NAMES 对齐）。
 */
export type TaskType = 'stt' | 'ppt' | 'image' | 'qimen-base' | 'qimen-section';
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
