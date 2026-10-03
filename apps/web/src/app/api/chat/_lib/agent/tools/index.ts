/**
 * 默认工具注册表入口
 *
 * 新增工具只需在此追加一条 createXxxTool()，编排层与 handler 无需改动。
 */

import { createToolRegistry, type ToolRegistry } from '@/lib/agent/registry';
import { createWebFetchTool } from './web-fetch';
import { createImageGenerateTool } from './image-generate';

let cached: ToolRegistry | null = null;

/** 进程内单例：工具 spec 无状态，可安全复用（避免每请求重复构造） */
export function getDefaultToolRegistry(): ToolRegistry {
  if (!cached) {
    cached = createToolRegistry([createWebFetchTool(), createImageGenerateTool()]);
  }
  return cached;
}
