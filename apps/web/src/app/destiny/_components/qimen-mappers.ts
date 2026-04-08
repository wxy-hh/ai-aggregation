import type { QimenAnalyzeRequest, QimenFormData } from './qimen-types';

function toLocalDateTimeInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function createDefaultQimenFormData(): QimenFormData {
  return {
    datetime: toLocalDateTimeInputValue(new Date()),
    location: '',
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
      location: formData.location,
      chartMethod: formData.chartMethod,
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
