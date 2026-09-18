/**
 * cities.ts —— 出生城市搜索的数据源（前端先行期）
 *
 * 设计文档 §6.3：城市必须精确匹配选中（保存城市、经纬度与 IANA 时区），
 * 禁止仅以国家名或当前位置作为精确出生地。生产接入地点服务后仅替换本表。
 *
 * 组成：手写 curated 表（主要城市 + 国际城市 + 拼音别名）+ 生成的中国地级行政区表
 * （cities-china.ts，覆盖周口、蚌埠等地级市）。搜索按中文名包含或拼音前缀匹配。
 */

import { CHINA_PREFECTURE_CITIES } from './cities-china';

export interface AstroCity {
  /** 城市中文名 */
  name: string;
  /** 纬度（度，北正） */
  lat: number;
  /** 经度（度，东正） */
  lon: number;
  /** IANA 时区 */
  timezone: string;
  /** 搜索别名（拼音/英文/常用写法） */
  aliases: string[];
}

/** 国内主要城市 + 常用国际城市（中国统一 UTC+8，IANA 口径；含拼音别名，手写维护） */
const CURATED_CITIES: AstroCity[] = [
  { name: '北京', lat: 39.9042, lon: 116.4074, timezone: 'Asia/Shanghai', aliases: ['beijing', 'bj'] },
  { name: '上海', lat: 31.2304, lon: 121.4737, timezone: 'Asia/Shanghai', aliases: ['shanghai', 'sh'] },
  { name: '广州', lat: 23.1291, lon: 113.2644, timezone: 'Asia/Shanghai', aliases: ['guangzhou', 'gz'] },
  { name: '深圳', lat: 22.5431, lon: 114.0579, timezone: 'Asia/Shanghai', aliases: ['shenzhen', 'sz'] },
  { name: '成都', lat: 30.5728, lon: 104.0668, timezone: 'Asia/Shanghai', aliases: ['chengdu', 'cd'] },
  { name: '重庆', lat: 29.563, lon: 106.5516, timezone: 'Asia/Shanghai', aliases: ['chongqing', 'cq'] },
  { name: '杭州', lat: 30.2741, lon: 120.1551, timezone: 'Asia/Shanghai', aliases: ['hangzhou', 'hz'] },
  { name: '武汉', lat: 30.5928, lon: 114.3055, timezone: 'Asia/Shanghai', aliases: ['wuhan', 'wh'] },
  { name: '西安', lat: 34.3416, lon: 108.9398, timezone: 'Asia/Shanghai', aliases: ['xian', 'xa'] },
  { name: '南京', lat: 32.0603, lon: 118.7969, timezone: 'Asia/Shanghai', aliases: ['nanjing', 'nj'] },
  { name: '天津', lat: 39.3434, lon: 117.3616, timezone: 'Asia/Shanghai', aliases: ['tianjin', 'tj'] },
  { name: '苏州', lat: 31.2989, lon: 120.5853, timezone: 'Asia/Shanghai', aliases: ['suzhou', 'suz'] },
  { name: '长沙', lat: 28.2282, lon: 112.9388, timezone: 'Asia/Shanghai', aliases: ['changsha', 'cs'] },
  { name: '郑州', lat: 34.7466, lon: 113.6254, timezone: 'Asia/Shanghai', aliases: ['zhengzhou', 'zz'] },
  { name: '青岛', lat: 36.0671, lon: 120.3826, timezone: 'Asia/Shanghai', aliases: ['qingdao', 'qd'] },
  { name: '沈阳', lat: 41.8057, lon: 123.4315, timezone: 'Asia/Shanghai', aliases: ['shenyang', 'sy'] },
  { name: '哈尔滨', lat: 45.8038, lon: 126.5349, timezone: 'Asia/Shanghai', aliases: ['haerbin', 'harbin', 'heb'] },
  { name: '昆明', lat: 24.8797, lon: 102.8332, timezone: 'Asia/Shanghai', aliases: ['kunming', 'km'] },
  { name: '福州', lat: 26.0745, lon: 119.2965, timezone: 'Asia/Shanghai', aliases: ['fuzhou', 'fz'] },
  { name: '厦门', lat: 24.4798, lon: 118.0894, timezone: 'Asia/Shanghai', aliases: ['xiamen', 'xm'] },
  { name: '合肥', lat: 31.8206, lon: 117.2272, timezone: 'Asia/Shanghai', aliases: ['hefei', 'hf'] },
  { name: '济南', lat: 36.6512, lon: 117.1201, timezone: 'Asia/Shanghai', aliases: ['jinan', 'jn'] },
  { name: '大连', lat: 38.914, lon: 121.6147, timezone: 'Asia/Shanghai', aliases: ['dalian', 'dl'] },
  { name: '宁波', lat: 29.8683, lon: 121.544, timezone: 'Asia/Shanghai', aliases: ['ningbo', 'nb'] },
  { name: '贵阳', lat: 26.647, lon: 106.6302, timezone: 'Asia/Shanghai', aliases: ['guiyang', 'gy'] },
  { name: '兰州', lat: 36.0611, lon: 103.8343, timezone: 'Asia/Shanghai', aliases: ['lanzhou', 'lz'] },
  { name: '海口', lat: 20.044, lon: 110.1999, timezone: 'Asia/Shanghai', aliases: ['haikou', 'hk'] },
  { name: '拉萨', lat: 29.652, lon: 91.1721, timezone: 'Asia/Shanghai', aliases: ['lasa', 'lhasa', 'ls'] },
  { name: '乌鲁木齐', lat: 43.8256, lon: 87.6168, timezone: 'Asia/Shanghai', aliases: ['wulumuqi', 'urumqi', 'wlmq'] },
  { name: '香港', lat: 22.3193, lon: 114.1694, timezone: 'Asia/Hong_Kong', aliases: ['xianggang', 'hongkong', 'hk', 'xg'] },
  { name: '澳门', lat: 22.1987, lon: 113.5439, timezone: 'Asia/Macau', aliases: ['aomen', 'macau', 'am'] },
  { name: '台北', lat: 25.033, lon: 121.5654, timezone: 'Asia/Taipei', aliases: ['taibei', 'taipei', 'tb'] },
  { name: '东京', lat: 35.6762, lon: 139.6503, timezone: 'Asia/Tokyo', aliases: ['dongjing', 'tokyo', 'dj'] },
  { name: '首尔', lat: 37.5665, lon: 126.978, timezone: 'Asia/Seoul', aliases: ['shouer', 'seoul', 'se'] },
  { name: '新加坡', lat: 1.3521, lon: 103.8198, timezone: 'Asia/Singapore', aliases: ['xinjiapo', 'singapore', 'sg', 'xjp'] },
  { name: '伦敦', lat: 51.5074, lon: -0.1278, timezone: 'Europe/London', aliases: ['lundun', 'london', 'ld'] },
  { name: '巴黎', lat: 48.8566, lon: 2.3522, timezone: 'Europe/Paris', aliases: ['bali', 'paris', 'bl'] },
  { name: '柏林', lat: 52.52, lon: 13.405, timezone: 'Europe/Berlin', aliases: ['bolin', 'berlin'] },
  { name: '纽约', lat: 40.7128, lon: -74.006, timezone: 'America/New_York', aliases: ['niuyue', 'newyork', 'ny'] },
  { name: '洛杉矶', lat: 34.0522, lon: -118.2437, timezone: 'America/Los_Angeles', aliases: ['luoshanji', 'losangeles', 'la'] },
  { name: '旧金山', lat: 37.7749, lon: -122.4194, timezone: 'America/Los_Angeles', aliases: ['jiujinshan', 'sanfrancisco', 'sf'] },
  { name: '温哥华', lat: 49.2827, lon: -123.1207, timezone: 'America/Vancouver', aliases: ['wengehua', 'vancouver'] },
  { name: '悉尼', lat: -33.8688, lon: 151.2093, timezone: 'Australia/Sydney', aliases: ['xini', 'sydney', 'xn'] },
];

/** 全量城市表：手写 curated（含拼音别名与国际城市）+ 生成的中国地级行政区 */
export const ASTRO_CITIES: AstroCity[] = [...CURATED_CITIES, ...CHINA_PREFECTURE_CITIES];

/**
 * 城市搜索：中文名包含或拼音前缀匹配；返回前 8 条候选。
 * 「市」后缀归一化：用户常输「周口市」「北京市」——数据里存的是不带后缀的短名，
 * 先按原样匹配，没有结果时去掉尾部「市」再匹配一轮。
 */
export function searchCities(query: string): AstroCity[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  const queries = raw.endsWith('市') ? [raw, raw.slice(0, -1)] : [raw];
  const matched: AstroCity[] = [];
  for (const q of queries) {
    for (const c of ASTRO_CITIES) {
      if (matched.includes(c)) continue;
      if (c.name.includes(q) || c.aliases.some((a) => a.startsWith(q))) matched.push(c);
    }
  }
  return matched.slice(0, 8);
}
