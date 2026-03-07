/**
 * 简历编辑器初始化 API
 *
 * 提供并发加载多个资源的功能
 * 演示 Promise.all 在实际场景中的应用
 */

/**
 * 模拟加载用户偏好设置
 * 在实际应用中，这可能是从 API 或 localStorage 加载
 */
export async function loadUserPreferences(): Promise<{
  theme: string;
  language: string;
  autoSave: boolean;
}> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 从 localStorage 加载
  const stored = localStorage.getItem('user-preferences');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // 解析失败，返回默认值
    }
  }

  return {
    theme: 'light',
    language: 'zh-CN',
    autoSave: true,
  };
}

/**
 * 模拟加载模板配置
 * 在实际应用中，这可能是从 CDN 或 API 加载
 */
export async function loadTemplateConfig(): Promise<{
  templates: Array<{ id: string; name: string }>;
  defaultTemplateId: string;
}> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 150));

  return {
    templates: [
      { id: 'default', name: '默认模板' },
      { id: 'modern', name: '现代模板' },
      { id: 'classic', name: '经典模板' },
    ],
    defaultTemplateId: 'default',
  };
}

/**
 * 模拟加载最近使用的文档
 * 在实际应用中，这可能是从 API 加载
 */
export async function loadRecentDocuments(): Promise<
  Array<{ id: string; title: string; updatedAt: string }>
> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 120));

  const stored = localStorage.getItem('recent-documents');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      // 解析失败，返回空数组
    }
  }

  return [];
}

/**
 * 并发加载所有初始化数据
 *
 * 使用 Promise.all 并发执行，显著减少总等待时间
 *
 * 串行执行总时间：100ms + 150ms + 120ms = 370ms
 * 并发执行总时间：max(100ms, 150ms, 120ms) = 150ms
 * 性能提升：约 2.5 倍
 *
 * @example
 * const { preferences, templates, recentDocs } = await loadInitialData();
 */
export async function loadInitialData() {
  // 使用 Promise.all 并发执行三个独立的加载任务
  const [preferences, templates, recentDocs] = await Promise.all([
    loadUserPreferences(),
    loadTemplateConfig(),
    loadRecentDocuments(),
  ]);

  return {
    preferences,
    templates,
    recentDocs,
  };
}

/**
 * 并发加载初始化数据（容错版本）
 *
 * 使用 Promise.allSettled 确保即使部分加载失败，其他数据仍然可用
 * 这在网络不稳定或部分服务不可用时特别有用
 *
 * @example
 * const results = await loadInitialDataSettled();
 *
 * if (results.preferences.status === 'fulfilled') {
 *   console.log('偏好设置:', results.preferences.value);
 * } else {
 *   console.error('加载偏好设置失败:', results.preferences.reason);
 * }
 */
export async function loadInitialDataSettled() {
  const [preferencesResult, templatesResult, recentDocsResult] = await Promise.allSettled([
    loadUserPreferences(),
    loadTemplateConfig(),
    loadRecentDocuments(),
  ]);

  return {
    preferences: preferencesResult,
    templates: templatesResult,
    recentDocs: recentDocsResult,
  };
}

/**
 * 批量加载多个简历文档
 *
 * 演示如何使用 Promise.all 批量处理多个异步操作
 *
 * @param documentIds - 文档 ID 数组
 * @returns 文档数据数组
 *
 * @example
 * const docs = await batchLoadDocuments(['doc1', 'doc2', 'doc3']);
 */
export async function batchLoadDocuments(
  documentIds: string[]
): Promise<Array<{ id: string; data: unknown } | null>> {
  // 并发加载所有文档
  return Promise.all(
    documentIds.map(async (id) => {
      try {
        // 模拟从 API 加载文档
        await new Promise((resolve) => setTimeout(resolve, 100));

        const stored = localStorage.getItem(`resume-doc:${id}`);
        if (stored) {
          return { id, data: JSON.parse(stored) };
        }
        return null;
      } catch (error) {
        console.error(`加载文档 ${id} 失败:`, error);
        return null;
      }
    })
  );
}
