import type { QimenAnalyzeRequest, QimenFormData } from './qimen-types';

export function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function createDefaultQimenFormData(): QimenFormData {
  return {
    datetime: toLocalDateTimeInputValue(new Date()),
    location: { name: '', lat: null, lon: null },
    category: 'decision',
    description: '',
    chartMethod: 'time',
    focus: 'short_term',
    outputStyle: 'professional',
    outputLength: 'detailed',
  };
}

export function mapFormToQimenRequest(formData: QimenFormData): QimenAnalyzeRequest {
  return {
    context: {
      datetime: formData.datetime,
      location: formData.location.name,
      chartMethod: formData.chartMethod,
      longitude: formData.location.lon ?? undefined,
    },
    question: {
      category: formData.category,
      description: formData.description,
      focus: formData.focus,
      outputStyle: formData.outputStyle,
      outputLength: formData.outputLength,
    },
  };
}
