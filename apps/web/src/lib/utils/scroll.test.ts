import { describe, it, expect } from 'vitest';
import { isNearBottom } from './scroll';

describe('isNearBottom（滚动吸底判定）', () => {
  it('容器为空或未就绪时返回 true（默认允许吸底）', () => {
    expect(isNearBottom(null)).toBe(true);
    expect(isNearBottom(undefined)).toBe(true);
  });

  it('恰好滚动到最底部时返回 true', () => {
    // 容器总高度 1000px，可视高度 400px，当前滚动 600px，距离底部 0px
    const el = { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 };
    expect(isNearBottom(el)).toBe(true);
  });

  it('距离底部小于默认阈值 80px 时返回 true', () => {
    // 距离底部 50px
    const el = { scrollHeight: 1000, scrollTop: 550, clientHeight: 400 };
    expect(isNearBottom(el)).toBe(true);
  });

  it('距离底部恰好等于默认阈值 80px 时返回 true', () => {
    // 距离底部 80px
    const el = { scrollHeight: 1000, scrollTop: 520, clientHeight: 400 };
    expect(isNearBottom(el)).toBe(true);
  });

  it('距离底部大于默认阈值 80px 时返回 false', () => {
    // 距离底部 81px
    const el = { scrollHeight: 1000, scrollTop: 519, clientHeight: 400 };
    expect(isNearBottom(el)).toBe(false);

    // 距离底部 200px
    const elFar = { scrollHeight: 1000, scrollTop: 400, clientHeight: 400 };
    expect(isNearBottom(elFar)).toBe(false);
  });

  it('支持自定义阈值', () => {
    // 距离底部 60px
    const el = { scrollHeight: 1000, scrollTop: 540, clientHeight: 400 };
    // 在 50px 阈值下不满足吸底
    expect(isNearBottom(el, 50)).toBe(false);
    // 在 100px 阈值下满足吸底
    expect(isNearBottom(el, 100)).toBe(true);
  });
});
