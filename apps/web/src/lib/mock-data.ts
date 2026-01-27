// Mock 数据，用于前端开发

export interface MockMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface MockTask {
  id: string;
  type: 'stt' | 'ppt' | 'image';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  output?: {
    url?: string;
    text?: string;
  };
  error?: string;
}

export const mockMessages: MockMessage[] = [
  {
    id: '1',
    role: 'user',
    content: '你好，请介绍一下你自己',
    createdAt: new Date('2024-01-26T10:00:00'),
  },
  {
    id: '2',
    role: 'assistant',
    content:
      '你好！我是 AI 助手，可以帮你完成多种任务，包括对话、语音转写、PPT 生成和图像生成。有什么我可以帮助你的吗？',
    createdAt: new Date('2024-01-26T10:00:05'),
  },
  {
    id: '3',
    role: 'user',
    content: '你能做什么？',
    createdAt: new Date('2024-01-26T10:01:00'),
  },
  {
    id: '4',
    role: 'assistant',
    content:
      '我可以帮你：\n1. 智能对话 - 回答问题、提供建议\n2. 语音转写 - 将音频转换为文字\n3. PPT 生成 - 根据内容自动生成演示文稿\n4. 图像生成 - 根据描述生成图片',
    createdAt: new Date('2024-01-26T10:01:05'),
  },
];

export const mockTasks: MockTask[] = [
  {
    id: '1',
    type: 'ppt',
    status: 'completed',
    createdAt: new Date('2024-01-26T09:00:00'),
    completedAt: new Date('2024-01-26T09:02:30'),
    output: {
      url: 'https://example.com/demo.pptx',
    },
  },
  {
    id: '2',
    type: 'stt',
    status: 'completed',
    createdAt: new Date('2024-01-26T09:30:00'),
    completedAt: new Date('2024-01-26T09:31:15'),
    output: {
      text: '这是一段语音转写的示例文本。语音识别技术可以将音频转换为文字，方便后续处理和分析。',
    },
  },
  {
    id: '3',
    type: 'image',
    status: 'processing',
    createdAt: new Date('2024-01-26T10:00:00'),
  },
  {
    id: '4',
    type: 'ppt',
    status: 'failed',
    createdAt: new Date('2024-01-26T08:00:00'),
    error: '生成失败：内容格式不正确',
  },
];

// 辅助函数：获取任务状态的中文描述
export function getTaskStatusText(status: MockTask['status']): string {
  const statusMap = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '失败',
  };
  return statusMap[status];
}

// 辅助函数：获取任务类型的中文描述
export function getTaskTypeText(type: MockTask['type']): string {
  const typeMap = {
    stt: '语音转写',
    ppt: 'PPT 生成',
    image: '图像生成',
  };
  return typeMap[type];
}

// 辅助函数：获取任务状态的颜色
export function getTaskStatusColor(status: MockTask['status']): string {
  const colorMap = {
    pending: 'bg-gray-100 text-gray-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };
  return colorMap[status];
}
