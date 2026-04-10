// 八字表单数据类型（复用 OnboardingInput 的结构）
export type BaziFormData = {
  name: string;
  gender: 'male' | 'female';
  birthDate: { year: number; month: number; day: number };
  birthTime: { hour: string; minute: string };
  location: { name: string; lat: number | null; lon: number | null };
};

// API 请求类型（与现有 API 兼容）
export type BaziAnalyzeRequest = BaziFormData;

// API 响应类型
export type BaziAnalyzeResponse = {
  success?: boolean;
  report?: unknown; // 使用 DestinyReport 类型
  error?: string;
};
