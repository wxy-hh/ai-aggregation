/**
 * 文档生命周期状态契约测试 (ADR-0053, C7)
 *
 * 只验证四态运行时清单与边界守卫；不触碰数据库或投影实现。
 */
import { describe, expect, it } from 'vitest';
import { DOCUMENT_STATUSES, isDocumentStatus } from '../document-status';

describe('document-status 文档生命周期状态契约', () => {
  it('四态清单与状态机一致', () => {
    expect(DOCUMENT_STATUSES).toEqual(['pending', 'processing', 'ready', 'failed']);
  });

  it('守卫接受四个合法状态', () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(isDocumentStatus(status), status).toBe(true);
    }
  });

  it('守卫拒绝非四态值，不做模糊匹配', () => {
    for (const value of ['archived', 'READY', '', 'pending ', null, undefined, 1, {}]) {
      expect(isDocumentStatus(value), String(value)).toBe(false);
    }
  });
});
