/**
 * 应用启动台注册表测试：验证「我的工具」入口的注册与定位
 *
 * 覆盖的规格行为（docs/features/2026-11-25-tools-workbench-ia-migration/spec.md §3）：
 * 1. 「我的工具」条目存在且指向 /tools；
 * 2. 归入「专业生产力」分组，且在同分组内排在「知识库」之后；
 * 3. 描述文案为「接入 Webhook 与 MCP 服务，扩展智能体能力。」；
 * 4. 该注册表是启动台、移动端抽屉、移动端顶栏标题、桌面侧边栏置顶的共用数据源，
 *    因此新增条目即可让四处入口同时生效；
 * 5. 启动台的模糊搜索可按标签命中该条目。
 */

import { describe, it, expect } from 'vitest';
import { APP_CONFIGS, isSidebarPinAllowed, type AppId } from './apps-modal';

describe('应用启动台注册表：我的工具入口', () => {
  it('注册了「我的工具」条目并指向 /tools 路由', () => {
    const entry = APP_CONFIGS.find((app) => app.id === 'tools');

    expect(entry).toBeDefined();
    expect(entry?.label).toBe('我的工具');
    expect(entry?.href).toBe('/tools');
    expect(entry?.description).toBe('接入 Webhook 与 MCP 服务，扩展智能体能力。');
  });

  it('归入「专业生产力」分组，并在同分组内排在「知识库」之后', () => {
    const entry = APP_CONFIGS.find((app) => app.id === 'tools');
    expect(entry?.category).toBe('productivity');

    const productivityOrder = APP_CONFIGS.filter((app) => app.category === 'productivity').map(
      (app) => app.id
    );
    expect(productivityOrder).toEqual(['knowledge', 'tools', 'resume']);
  });

  it('该条目允许侧边栏置顶（未列入禁用清单）', () => {
    expect(isSidebarPinAllowed('tools' as AppId)).toBe(true);
  });

  it('启动台模糊搜索可按标签「工具」命中该条目', () => {
    const query = '工具';
    const matched = APP_CONFIGS.filter(
      (app) =>
        app.label.toLowerCase().includes(query.toLowerCase()) ||
        app.description.toLowerCase().includes(query.toLowerCase())
    );

    expect(matched.some((app) => app.id === 'tools')).toBe(true);
  });

  it('应用标识符联合类型包含 tools', () => {
    const ids: AppId[] = APP_CONFIGS.map((app) => app.id);
    expect(ids).toContain('tools');
  });
});
