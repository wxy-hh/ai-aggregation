/**
 * MCP 模型侧工具命名与原始工具名映射测试（工单 01 / ADR-0064 §7）
 *
 * 覆盖的外部可观察行为：
 * - 模型侧工具名由 Server 稳定标识与原始工具名确定性派生；
 * - 跨 Server 重名工具不互相覆盖；
 * - 模型名可反解回 Server 与原始工具名（用于 tools/call）。
 */

import { describe, it, expect } from 'vitest';
import {
  buildMcpToolName,
  parseMcpToolName,
  MCP_TOOL_NAME_PREFIX,
} from '../naming';

describe('MCP 工具命名', () => {
  it('模型侧工具名由 Server 标识与原始工具名确定性派生', () => {
    const name = buildMcpToolName('github', 'search_issues');

    expect(name.startsWith(MCP_TOOL_NAME_PREFIX)).toBe(true);
    expect(name).toContain('github');
    expect(name).toContain('search_issues');
  });

  it('相同输入得到相同工具名', () => {
    expect(buildMcpToolName('github', 'search_issues')).toBe(
      buildMcpToolName('github', 'search_issues')
    );
  });

  it('不同 Server 的同名工具得到不同模型侧名称', () => {
    const github = buildMcpToolName('github', 'search');
    const gitlab = buildMcpToolName('gitlab', 'search');

    expect(github).not.toBe(gitlab);
  });

  it('模型侧名称可反解回 Server 与原始工具名', () => {
    const name = buildMcpToolName('github', 'search_issues');
    const parsed = parseMcpToolName(name);

    expect(parsed).not.toBeNull();
    expect(parsed?.serverKey).toBe('github');
    expect(parsed?.toolName).toBe('search_issues');
  });

  it('非 MCP 前缀的工具名反解返回 null', () => {
    expect(parseMcpToolName('web_search')).toBeNull();
  });

  it('Server 标识与工具名中的非法字符被归一化为安全字符', () => {
    const name = buildMcpToolName('My Server!', 'create issue');

    expect(name).toMatch(/^[a-z0-9_]+$/);
  });

  it('长 Server 标识与长工具名仍生成不超过 64 字符的确定性唯一名称', () => {
    const serverKey = 'cmwvh5rzg000l1yepwsxirqxi';
    const first = buildMcpToolName(serverKey, 'list_pull_request_reviews_with_a_very_long_suffix');
    const second = buildMcpToolName(serverKey, 'list_pull_request_reviews_with_another_long_suffix');

    expect(first).toMatch(/^[a-z0-9_]{1,64}$/);
    expect(first.length).toBeLessThanOrEqual(64);
    expect(second.length).toBeLessThanOrEqual(64);
    expect(first).not.toBe(second);
    expect(buildMcpToolName(serverKey, 'list_pull_request_reviews_with_a_very_long_suffix')).toBe(
      first
    );
  });
});
