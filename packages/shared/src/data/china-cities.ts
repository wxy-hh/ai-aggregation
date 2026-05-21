/**
 * 中国城市经纬度数据加载和搜索工具
 */

import type { ChinaCitiesData, ChinaCity } from './china-cities.types';
import citiesData from './china-cities-bazi.json';

// 类型断言
const data = citiesData as ChinaCitiesData;

/**
 * 获取所有城市数据
 */
export function getAllCities(): ChinaCity[] {
  return data.cities;
}

/**
 * 根据名称搜索城市 (支持模糊匹配)
 *
 * @param query 搜索关键词
 * @param limit 返回结果数量限制 (默认 20)
 * @returns 匹配的城市列表
 */
export function searchCities(query: string, limit = 20, level?: number): ChinaCity[] {
  if (!query || query.trim() === '') {
    return [];
  }

  const pool = level != null ? data.cities.filter((city) => city.level === level) : data.cities;
  const normalizedQuery = query.trim().toLowerCase();

  // 优先匹配完整地名
  const exactMatches = pool.filter((city) =>
    city.fullName.toLowerCase().includes(normalizedQuery)
  );

  // 如果完整地名匹配不足,再匹配城市名称
  if (exactMatches.length < limit) {
    const nameMatches = pool.filter(
      (city) => !exactMatches.includes(city) && city.name.toLowerCase().includes(normalizedQuery)
    );

    return [...exactMatches, ...nameMatches].slice(0, limit);
  }

  return exactMatches.slice(0, limit);
}

/**
 * 根据 ID 获取城市
 *
 * @param id 行政区划代码
 * @returns 城市信息,如果不存在返回 null
 */
export function getCityById(id: string): ChinaCity | null {
  return data.cities.find((city) => city.id === id) || null;
}

/**
 * 获取数据统计信息
 */
export function getDataInfo() {
  return {
    version: data.version,
    description: data.description,
    source: data.source,
    totalCount: data.totalCount,
    levelCount: data.levelCount,
  };
}

/**
 * 获取热门城市 (预定义列表)
 */
export function getPopularCities(): ChinaCity[] {
  const popularCityNames = [
    '北京市北京城区东城区',
    '北京市北京城区西城区',
    '北京市北京城区朝阳区',
    '北京市北京城区海淀区',
    '上海市上海城区黄浦区',
    '上海市上海城区徐汇区',
    '上海市上海城区浦东新区',
    '广东省广州市天河区',
    '广东省广州市越秀区',
    '广东省深圳市福田区',
    '广东省深圳市南山区',
    '浙江省杭州市西湖区',
    '浙江省杭州市滨江区',
    '四川省成都市武侯区',
    '四川省成都市锦江区',
  ];

  return popularCityNames
    .map((name) => data.cities.find((city) => city.fullName === name))
    .filter((city): city is ChinaCity => city !== undefined);
}
