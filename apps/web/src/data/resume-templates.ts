/**
 * 简历模板数据
 *
 * 定义预设的简历模板配置，包括：
 * - 现代简约 (modern)
 * - 经典商务 (classic)
 * - 创意设计 (creative)
 *
 * 每个模板包含完整的样式配置，用于渲染不同风格的简历
 */

import type { ResumeTemplate } from '@/types/resume-editor';

/**
 * 预设简历模板列表
 */
export const RESUME_TEMPLATES: ResumeTemplate[] = [
  {
    id: 'modern',
    name: '现代简约',
    description: '简洁大方的现代风格，适合互联网、科技行业',
    styleConfig: {
      primaryColor: '#2F6BFF',
      accentColor: '#1E40AF',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      baseFontSize: 14,
      lineHeight: 1.6,
      padding: 32,
      moduleSpacing: 24,
      showAvatar: false,
      layout: 'single-column',
      useGlassmorphism: true,
    },
    isDefault: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'classic',
    name: '经典商务',
    description: '传统专业的商务风格，适合金融、咨询、传统企业',
    styleConfig: {
      primaryColor: '#1F2937',
      accentColor: '#374151',
      fontFamily: 'Georgia, serif',
      baseFontSize: 13,
      lineHeight: 1.7,
      padding: 40,
      moduleSpacing: 20,
      showAvatar: true,
      layout: 'two-column',
      useGlassmorphism: false,
    },
    isDefault: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: 'creative',
    name: '创意设计',
    description: '富有创意的设计风格，适合设计、艺术、创意行业',
    styleConfig: {
      primaryColor: '#8B5CF6',
      accentColor: '#7C3AED',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      baseFontSize: 15,
      lineHeight: 1.5,
      padding: 36,
      moduleSpacing: 28,
      showAvatar: true,
      layout: 'sidebar',
      useGlassmorphism: true,
    },
    isDefault: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

/**
 * 根据 ID 获取模板
 */
export function getTemplateById(id: string): ResumeTemplate | undefined {
  return RESUME_TEMPLATES.find((template) => template.id === id);
}

/**
 * 获取默认模板
 */
export function getDefaultTemplate(): ResumeTemplate {
  return RESUME_TEMPLATES.find((template) => template.isDefault) || RESUME_TEMPLATES[0];
}

/**
 * 获取所有模板列表
 */
export function getAllTemplates(): ResumeTemplate[] {
  return RESUME_TEMPLATES;
}
