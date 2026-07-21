import { describe, expect, it } from 'vitest';
import type { DestinyReport } from '../types';
import {
  buildBaziShareCardData,
  buildBaziShareUrl,
  sanitizeShareFileName,
  truncateNickname,
} from './share-card-data';

/** 构造一份带隐私字段的完整报告（隐私值使用易识别的哨兵字符串） */
function createFullReport(): DestinyReport {
  return {
    profile: {
      name: '测试用户',
      genderLabel: '乾造（男命）',
      birthText: 'SENTINEL_BIRTH_1993年8月16日 09:30',
      locationText: 'SENTINEL_LOCATION_杭州',
      lunarText: 'SENTINEL_LUNAR_癸酉年六月廿九',
    },
    coreTone: {
      tag: '核心命理定调',
      chartSummary: '乾造：甲子 丙寅 戊辰 庚申',
      headline: '先稳后发，厚积见成',
      description: '整体节奏偏稳，适合在复杂环境里靠耐心和结构感逐步拉开差距。',
    },
    pillars: [
      { stem: '甲', branch: '子', label: '年柱', element: 'wood', tooltip: '' },
      { stem: '丙', branch: '寅', label: '月柱', element: 'fire', tooltip: '' },
      { stem: '戊', branch: '辰', label: '日柱', element: 'earth', tooltip: '' },
      { stem: '庚', branch: '申', label: '时柱', element: 'metal', tooltip: '' },
    ],
    tenGods: [],
    elements: [],
    balanceInsight: { title: '', value: '', tooltip: '' },
    patternHighlights: [],
    lifeDimensions: [
      { key: 'career', label: '事业', value: 88 },
      { key: 'love', label: '感情', value: 54 },
      { key: 'wealth', label: '财运', value: 44 },
      { key: 'wisdom', label: '智慧', value: 44 },
      { key: 'health', label: '健康', value: 59 },
    ],
    modules: {
      career: { title: '', summary: '' },
      love: { title: '', summary: '' },
      wealth: { title: '', summary: '' },
      health: { title: '', summary: '' },
      personality: { title: '', summary: '' },
    },
    timeline: [],
  };
}

describe('buildBaziShareUrl', () => {
  it('拼接 /destiny 并附完整 UTM 参数', () => {
    const url = buildBaziShareUrl('https://example.com');
    expect(url).toBe(
      'https://example.com/destiny?utm_source=share_card&utm_medium=qrcode&utm_campaign=bazi'
    );
  });

  it('origin 末尾斜杠不产生双斜杠', () => {
    const url = buildBaziShareUrl('https://example.com/');
    expect(url).toContain('https://example.com/destiny?');
  });
});

describe('truncateNickname', () => {
  it('短昵称原样返回', () => {
    expect(truncateNickname('笑雨')).toBe('笑雨');
  });

  it('超长昵称截断并追加省略号', () => {
    const result = truncateNickname('一个超级超级长的昵称甲乙丙');
    expect(result).toBe('一个超级超级长的…');
    expect(result.endsWith('…')).toBe(true);
  });
});

describe('sanitizeShareFileName', () => {
  it('剥离文件系统非法字符与空白', () => {
    expect(sanitizeShareFileName('张/三:李')).toBe('张三李');
    expect(sanitizeShareFileName('a b*c?')).toBe('abc');
  });

  it('全部剥离后回退默认名', () => {
    expect(sanitizeShareFileName('/:*?')).toBe('未知');
  });
});

describe('buildBaziShareCardData', () => {
  it('构建白名单数据：昵称、钩子、四柱、五维、分享链接', () => {
    const data = buildBaziShareCardData(createFullReport(), {
      origin: 'https://example.com',
    });
    expect(data).not.toBeNull();
    expect(data!.nickname).toBe('测试用户');
    expect(data!.headline).toBe('先稳后发，厚积见成');
    expect(data!.pillars).toHaveLength(4);
    expect(data!.pillars[2]).toMatchObject({ stem: '戊', branch: '辰', label: '日柱' });
    expect(data!.dimensions).toHaveLength(5);
    expect(data!.shareUrl).toContain('utm_campaign=bazi');
  });

  it('隐私字段在构建期被剥离：产物中不含出生时间/地点/农历/性别哨兵值', () => {
    const data = buildBaziShareCardData(createFullReport(), {
      origin: 'https://example.com',
    });
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('SENTINEL_BIRTH');
    expect(serialized).not.toContain('SENTINEL_LOCATION');
    expect(serialized).not.toContain('SENTINEL_LUNAR');
    expect(serialized).not.toContain('乾造');
  });

  it('headline 缺失时回退 coreTone.tag', () => {
    const report = createFullReport();
    report.coreTone.headline = '';
    const data = buildBaziShareCardData(report, { origin: 'https://example.com' });
    expect(data!.headline).toBe('核心命理定调');
  });

  it('缺少五维数据时返回 null（调用方应隐藏入口）', () => {
    const report = createFullReport();
    delete report.lifeDimensions;
    delete report.baziBasis;
    expect(buildBaziShareCardData(report, { origin: 'https://example.com' })).toBeNull();
  });

  it('四柱不足时返回 null', () => {
    const report = createFullReport();
    report.pillars = report.pillars.slice(0, 3);
    expect(buildBaziShareCardData(report, { origin: 'https://example.com' })).toBeNull();
  });

  it('昵称为空时返回 null', () => {
    const report = createFullReport();
    report.profile.name = '   ';
    expect(buildBaziShareCardData(report, { origin: 'https://example.com' })).toBeNull();
  });
});
