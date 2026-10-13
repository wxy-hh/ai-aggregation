import { describe, it, expect } from 'vitest';
import {
  AGENT_PROVIDER,
  AGENT_MODEL,
  AGENT_PROVIDER_LEGACY_DOUBAO,
  AGENT_MODEL_LEGACY_DOUBAO,
  AGENT_MAX_STEPS,
  AGENT_MIN_STEPS,
  AGENT_STEP_OUTPUT_LIMIT,
  resolveAgentStepBudget,
  fullAgentStepBudget,
} from './agent-config';

describe('Agent 默认底座模型配置 (ADR-0016 / 工单 02)', () => {
  it('默认 Provider 为 deepseek，默认 Model 为 deepseek-flash，且保留 doubao legacy 常量', () => {
    expect(AGENT_PROVIDER).toBe('deepseek');
    expect(AGENT_MODEL).toBe('deepseek-flash');
    expect(AGENT_PROVIDER_LEGACY_DOUBAO).toBe('doubao');
    expect(AGENT_MODEL_LEGACY_DOUBAO).toBe('doubao-seed-evolving');
  });
});

describe('Agent 步数预算与配额换算 (ADR-0014 / 工单 01)', () => {
  describe('默认基线步数 (5 步)', () => {
    it('额度充沛时，默认按 5 步上限封顶并计算 reserveOutputLimit', () => {
      // 假设可用 100,000 token，输入 1,000 token，远超 5 步所需
      const budget = resolveAgentStepBudget(100_000, 1_000);
      expect(budget.steps).toBe(AGENT_MAX_STEPS);
      expect(budget.steps).toBe(5);
      expect(budget.reserveOutputLimit).toBe(5 * AGENT_STEP_OUTPUT_LIMIT);
      expect(budget.reserveOutputLimit).toBe(10240);
    });

    it('fullAgentStepBudget() 默认返回 5 步满配预算', () => {
      const budget = fullAgentStepBudget();
      expect(budget.steps).toBe(5);
      expect(budget.reserveOutputLimit).toBe(10240);
    });
  });

  describe('能力包 8 步扩容 (深度调研)', () => {
    it('显式传入 maxSteps = 8 且额度充沛时，计算 8 步预算与 16384 token 预留上限', () => {
      // 可用 50,000 token，输入 1,000 token，充足支撑 8 步
      const budget = resolveAgentStepBudget(50_000, 1_000, 8);
      expect(budget.steps).toBe(8);
      expect(budget.reserveOutputLimit).toBe(8 * AGENT_STEP_OUTPUT_LIMIT);
      expect(budget.reserveOutputLimit).toBe(16384);
    });

    it('fullAgentStepBudget(8) 返回 8 步满配预算', () => {
      const budget = fullAgentStepBudget(8);
      expect(budget.steps).toBe(8);
      expect(budget.reserveOutputLimit).toBe(16384);
    });

    it('显式传入 maxSteps = 8 但额度只够 4 步时，按实际可负担 4 步计算', () => {
      // 净可用 2048 * 4.5 = 9216 token
      const availableQuota = 10_000;
      const inputEstimate = 10_000 - 9216;
      const budget = resolveAgentStepBudget(availableQuota, inputEstimate, 8);
      expect(budget.steps).toBe(4);
      expect(budget.reserveOutputLimit).toBe(4 * AGENT_STEP_OUTPUT_LIMIT);
    });
  });

  describe('低余额边界判定', () => {
    it('净可用仅够 1 步时，返回 steps = 1（调用方据 steps < AGENT_MIN_STEPS 拒绝）', () => {
      const budget = resolveAgentStepBudget(3000, 500, 8);
      expect(budget.steps).toBe(1);
      expect(budget.steps).toBeLessThan(AGENT_MIN_STEPS);
      expect(budget.reserveOutputLimit).toBe(AGENT_STEP_OUTPUT_LIMIT);
    });

    it('余额透支或不足 0 步时，返回 steps = 0', () => {
      const budget = resolveAgentStepBudget(100, 500, 8);
      expect(budget.steps).toBe(0);
      expect(budget.reserveOutputLimit).toBe(0);
    });
  });
});
