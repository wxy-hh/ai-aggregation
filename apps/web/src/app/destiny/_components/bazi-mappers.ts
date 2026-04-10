import type { BaziFormData } from './bazi-types';

// 创建默认表单数据
export function createDefaultBaziFormData(): BaziFormData {
  const now = new Date();
  return {
    name: '',
    gender: 'male',
    birthDate: {
      year: now.getFullYear() - 25,
      month: 1,
      day: 1,
    },
    birthTime: {
      hour: '12',
      minute: '00',
    },
    location: {
      name: '',
      lat: null,
      lon: null,
    },
  };
}

// 表单数据映射到 API 请求（直接返回，与现有 API 兼容）
export function mapFormToBaziRequest(formData: BaziFormData): BaziFormData {
  return formData;
}
