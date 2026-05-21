/**
 * 中国城市经纬度数据类型定义
 */

export interface ChinaCity {
  /** 城市名称 (如: "朝阳区", "三里屯街道") */
  name: string;

  /** 完整地名 (如: "北京市北京城区朝阳区", "北京市北京城区朝阳区三里屯街道") */
  fullName: string;

  /** 纬度 (北纬,精确到小数点后6位) */
  lat: number;

  /** 经度 (东经,精确到小数点后6位) */
  lon: number;

  /** 行政级别: 2=区县, 3=街道 */
  level: 2 | 3;

  /** 行政区划代码 (高德地图 adcode) */
  id: string;
}

export interface ChinaCitiesData {
  /** 数据版本 */
  version: string;

  /** 数据说明 */
  description: string;

  /** 数据来源 */
  source: string;

  /** 总数量 */
  totalCount: number;

  /** 各级别数量统计 */
  levelCount: {
    /** 区县级数量 */
    district: number;
    /** 街道级数量 */
    street: number;
  };

  /** 城市列表 */
  cities: ChinaCity[];
}
