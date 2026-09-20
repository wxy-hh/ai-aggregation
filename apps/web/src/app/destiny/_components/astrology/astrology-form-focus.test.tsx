/**
 * astrology-form-focus.test.tsx —— 表单校验失败后的焦点归位（可访问性）
 *
 * 锁定的外部行为：
 * - 第一步校验失败：焦点落到出生年份选择器（第一个出错控件）；
 * - 第二步校验失败：按本步字段顺序聚焦第一个出错控件（出生时刻 → 大约时段 → 出生城市）；
 * - 没有对应错误时不抢焦点（焦点留在用户点击的提交按钮上）。
 */

import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AstrologyFormStep1 } from './astrology-form-step1';
import { AstrologyFormStep2 } from './astrology-form-step2';
import { createDefaultAstrologyFormData } from '../astrology-types';

const baseForm = createDefaultAstrologyFormData();

function renderStep1(fieldErrors: Record<string, string> = {}) {
  return render(
    <AstrologyFormStep1 formData={baseForm} fieldErrors={fieldErrors} disabled={false} onPatch={vi.fn()} />
  );
}

describe('第一步：校验失败聚焦第一个出错控件', () => {
  it('出生日期出错：焦点落到出生年份选择器（aria-label 出生年份）', () => {
    renderStep1({ birthDate: '请选择阳历出生日期' });

    const year = document.querySelector('#astrology-birth-year');
    expect(year).not.toBeNull();
    expect(document.activeElement).toBe(year);
  });

  it('无错误时不抢焦点', () => {
    renderStep1({});
    expect(document.activeElement).toBe(document.body);
  });
});

describe('第二步：校验失败按字段顺序聚焦第一个出错控件', () => {
  const accurateForm = { ...baseForm, timePrecision: 'accurate' as const };
  const approximateForm = { ...baseForm, timePrecision: 'approximate' as const };

  it('出生时刻出错：焦点落到出生小时选择器', () => {
    render(
      <AstrologyFormStep2
        formData={accurateForm}
        fieldErrors={{ birthTime: '请选择出生时刻（时与分）' }}
        disabled={false}
        onPatch={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(document.querySelector('#astrology-birth-hour'));
  });

  it('城市出错（无时刻错误）：焦点落到城市搜索输入框', () => {
    render(
      <AstrologyFormStep2
        formData={accurateForm}
        fieldErrors={{ location: '请从候选列表中精确选择出生城市' }}
        disabled={false}
        onPatch={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(document.querySelector('#astrology-city-input'));
  });

  it('时刻与城市同时出错：时刻在前，焦点落在出生小时', () => {
    render(
      <AstrologyFormStep2
        formData={accurateForm}
        fieldErrors={{ birthTime: '请选择出生时刻（时与分）', location: '请从候选列表中精确选择出生城市' }}
        disabled={false}
        onPatch={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(document.querySelector('#astrology-birth-hour'));
  });

  it('大约时段出错：焦点落到时段单选里的第一个单选项', () => {
    render(
      <AstrologyFormStep2
        formData={approximateForm}
        fieldErrors={{ approximateSlot: '请选择一个大约时段' }}
        disabled={false}
        onPatch={vi.fn()}
      />
    );

    const group = document.querySelector('[role="radiogroup"][aria-label="大约时段"]');
    expect(group).not.toBeNull();
    const firstRadio = group!.querySelector('[role="radio"]');
    expect(document.activeElement).toBe(firstRadio);
  });

  it('出生日期错（第一步的字段，提交时已切回第一步）：本步不抢焦点', () => {
    render(
      <AstrologyFormStep2
        formData={accurateForm}
        fieldErrors={{ birthDate: '请选择阳历出生日期' }}
        disabled={false}
        onPatch={vi.fn()}
      />
    );

    expect(document.activeElement).toBe(document.body);
  });
});
