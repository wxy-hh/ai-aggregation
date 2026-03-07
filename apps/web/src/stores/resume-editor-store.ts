/**
 * 简历编辑器状态管理 Store
 *
 * 使用 Zustand 管理简历编辑器的全局状态，包括：
 * - 编辑状态：当前活动模块、简历文档数据
 * - 保存状态：保存状态、最后保存时间
 * - AI 状态：AI 处理状态、评分、优化建议
 * - 隐私配置：用户隐私选项
 *
 * 持久化策略：
 * - 使用 localStorage 持久化关键数据
 * - key: resume-editor:v1
 * - 仅持久化必要字段，临时 UI 状态不持久化
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ResumeDocument,
  EditModule,
  SaveStatus,
  AIStatus,
  ResumeSuggestion,
  PrivacyOptions,
  ResumeTemplate,
} from '@/types/resume-editor';
import { RESUME_TEMPLATES, getDefaultTemplate } from '@/data/resume-templates';

/**
 * 简历编辑器状态接口
 */
interface ResumeEditorState {
  // ========== 编辑状态 ==========
  /** 当前活动的编辑模块 */
  activeModule: EditModule;

  /** 简历文档数据 */
  doc: ResumeDocument;

  // ========== 模板状态 ==========
  /** 当前使用的模板 */
  currentTemplate: ResumeTemplate;

  /** 可用模板列表 */
  templates: ResumeTemplate[];

  // ========== 保存状态 ==========
  /** 保存状态 */
  saveStatus: SaveStatus;

  /** 最后保存时间 (ISO 8601 格式) */
  lastSavedAt: string | null;

  // ========== AI 状态 ==========
  /** AI 处理状态 */
  aiStatus: AIStatus;

  /** 简历综合评分 (0-100) */
  score: number;

  /** AI 优化建议列表 */
  suggestions: ResumeSuggestion[];

  // ========== 隐私配置 ==========
  /** 隐私选项 */
  privacyOptions: PrivacyOptions;

  /** 是否已显示过隐私告知弹窗 */
  hasShownPrivacyNotice: boolean;

  /** 需要高亮的目标路径（用于 pulse 动画） */
  highlightTargetPath: string | null;

  /** 是否正在导出 PDF（用于冻结编辑状态） */
  isExporting: boolean;

  // ========== Actions ==========
  /** 设置当前活动模块 */
  setActiveModule: (module: EditModule) => void;

  /** 更新简历文档 */
  updateDoc: (doc: ResumeDocument) => void;

  /**
   * 更新字段值（支持深层路径）
   * @param path - 字段路径，如 "personalInfo.name" 或 "workExperiences[0].company"
   * @param value - 新值
   */
  updateField: (path: string, value: unknown) => void;

  // ========== 模板操作 ==========
  /**
   * 切换模板
   * @param templateId - 模板 ID
   */
  setTemplate: (templateId: string) => void;

  // ========== 工作经历操作 ==========
  /** 添加工作经历 */
  addWorkExperience: (
    experience: Omit<import('@/types/resume-editor').ResumeWorkExperience, 'id'>
  ) => void;

  /** 更新工作经历 */
  updateWorkExperience: (
    id: string,
    updates: Partial<import('@/types/resume-editor').ResumeWorkExperience>
  ) => void;

  /** 删除工作经历 */
  removeWorkExperience: (id: string) => void;

  /** 重新排序工作经历 */
  reorderWorkExperiences: (fromIndex: number, toIndex: number) => void;

  // ========== 教育背景操作 ==========
  /** 添加教育背景 */
  addEducation: (education: Omit<import('@/types/resume-editor').ResumeEducation, 'id'>) => void;

  /** 更新教育背景 */
  updateEducation: (
    id: string,
    updates: Partial<import('@/types/resume-editor').ResumeEducation>
  ) => void;

  /** 删除教育背景 */
  removeEducation: (id: string) => void;

  /** 重新排序教育背景 */
  reorderEducations: (fromIndex: number, toIndex: number) => void;

  // ========== 项目经历操作 ==========
  /** 添加项目经历 */
  addProject: (project: Omit<import('@/types/resume-editor').ResumeProject, 'id'>) => void;

  /** 更新项目经历 */
  updateProject: (
    id: string,
    updates: Partial<import('@/types/resume-editor').ResumeProject>
  ) => void;

  /** 删除项目经历 */
  removeProject: (id: string) => void;

  /** 重新排序项目经历 */
  reorderProjects: (fromIndex: number, toIndex: number) => void;

  // ========== 技能操作 ==========
  /** 添加技能 */
  addSkill: (skill: Omit<import('@/types/resume-editor').ResumeSkill, 'id'>) => void;

  /** 更新技能 */
  updateSkill: (id: string, updates: Partial<import('@/types/resume-editor').ResumeSkill>) => void;

  /** 删除技能 */
  removeSkill: (id: string) => void;

  /** 重新排序技能 */
  reorderSkills: (fromIndex: number, toIndex: number) => void;

  // ========== 其他操作 ==========
  /** 设置保存状态 */
  setSaveStatus: (status: SaveStatus) => void;

  /** 设置最后保存时间 */
  setLastSavedAt: (timestamp: string) => void;

  /** 设置 AI 状态 */
  setAIStatus: (status: AIStatus) => void;

  /** 设置评分和建议 */
  setScoreAndSuggestions: (score: number, suggestions: ResumeSuggestion[]) => void;

  /** 更新隐私选项 */
  updatePrivacyOptions: (options: Partial<PrivacyOptions>) => void;

  /** 设置已显示隐私告知 */
  setHasShownPrivacyNotice: (shown: boolean) => void;

  /**
   * 设置需要高亮的目标路径
   * @param targetPath - 目标字段路径，如 "personalInfo.name" 或 "workExperiences[0].description"
   */
  setHighlightTargetPath: (targetPath: string | null) => void;

  /**
   * 设置是否正在导出 PDF
   * @param isExporting - 是否正在导出
   */
  setIsExporting: (isExporting: boolean) => void;

  /** 重置 store 到初始状态 */
  reset: () => void;
}

/**
 * 创建默认简历文档
 */
const createDefaultDocument = (): ResumeDocument => ({
  schemaVersion: 'v1',
  templateId: getDefaultTemplate().id,
  personalInfo: {
    name: '',
    title: '',
    email: '',
    phone: '',
    location: '',
    education: '',
    major: '',
    politicalStatus: '',
    currentStatus: '',
    summary: '',
  },
  workExperiences: [],
  educations: [],
  projects: [],
  skills: [],
  updatedAt: new Date().toISOString(),
});

/**
 * 生成唯一 ID
 */
const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * 设置嵌套对象的值
 * @param obj - 目标对象
 * @param path - 路径字符串，如 "personalInfo.name" 或 "workExperiences[0].company"
 * @param value - 要设置的值
 */
const setNestedValue = (obj: unknown, path: string, value: unknown): unknown => {
  const keys = path.split(/[.[\]]+/).filter(Boolean);

  if (keys.length === 0) return obj;

  const result = JSON.parse(JSON.stringify(obj)); // 深拷贝
  let current = result;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current)) {
      // 如果下一个键是数字，创建数组，否则创建对象
      current[key] = /^\d+$/.test(keys[i + 1] || '') ? [] : {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return result;
};

/**
 * 数组重新排序
 */
const reorderArray = <T>(array: T[], fromIndex: number, toIndex: number): T[] => {
  const result = [...array];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
};

/**
 * 初始状态
 */
const initialState = {
  activeModule: 'personal' as EditModule,
  doc: createDefaultDocument(),
  currentTemplate: getDefaultTemplate(),
  templates: RESUME_TEMPLATES,
  saveStatus: 'idle' as SaveStatus,
  lastSavedAt: null,
  aiStatus: 'idle' as AIStatus,
  score: 0,
  suggestions: [],
  privacyOptions: {
    allowContactFieldsToAI: false,
  },
  hasShownPrivacyNotice: false,
  highlightTargetPath: null,
  isExporting: false,
};

/**
 * 简历编辑器 Store
 */
export const useResumeEditorStore = create<ResumeEditorState>()(
  persist(
    (set) => ({
      ...initialState,

      // ========== Actions ==========
      setActiveModule: (module) => set({ activeModule: module }),

      updateDoc: (doc) =>
        set({
          doc: {
            ...doc,
            updatedAt: new Date().toISOString(),
          },
        }),

      updateField: (path, value) =>
        set((state) => ({
          doc: {
            ...(setNestedValue(state.doc, path, value) as ResumeDocument),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ========== 模板操作 ==========
      setTemplate: (templateId) =>
        set((state) => {
          const template = state.templates.find((t) => t.id === templateId);
          if (!template) {
            console.warn(`模板 ${templateId} 不存在`);
            return state;
          }
          return {
            currentTemplate: template,
            doc: {
              ...state.doc,
              templateId: template.id,
              updatedAt: new Date().toISOString(),
            },
          };
        }),

      // ========== 工作经历操作 ==========
      addWorkExperience: (experience) =>
        set((state) => ({
          doc: {
            ...state.doc,
            workExperiences: [...state.doc.workExperiences, { ...experience, id: generateId() }],
            updatedAt: new Date().toISOString(),
          },
        })),

      updateWorkExperience: (id, updates) =>
        set((state) => ({
          doc: {
            ...state.doc,
            workExperiences: state.doc.workExperiences.map((exp) =>
              exp.id === id ? { ...exp, ...updates } : exp
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeWorkExperience: (id) =>
        set((state) => ({
          doc: {
            ...state.doc,
            workExperiences: state.doc.workExperiences.filter((exp) => exp.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      reorderWorkExperiences: (fromIndex, toIndex) =>
        set((state) => ({
          doc: {
            ...state.doc,
            workExperiences: reorderArray(state.doc.workExperiences, fromIndex, toIndex),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ========== 教育背景操作 ==========
      addEducation: (education) =>
        set((state) => ({
          doc: {
            ...state.doc,
            educations: [...state.doc.educations, { ...education, id: generateId() }],
            updatedAt: new Date().toISOString(),
          },
        })),

      updateEducation: (id, updates) =>
        set((state) => ({
          doc: {
            ...state.doc,
            educations: state.doc.educations.map((edu) =>
              edu.id === id ? { ...edu, ...updates } : edu
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeEducation: (id) =>
        set((state) => ({
          doc: {
            ...state.doc,
            educations: state.doc.educations.filter((edu) => edu.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      reorderEducations: (fromIndex, toIndex) =>
        set((state) => ({
          doc: {
            ...state.doc,
            educations: reorderArray(state.doc.educations, fromIndex, toIndex),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ========== 项目经历操作 ==========
      addProject: (project) =>
        set((state) => ({
          doc: {
            ...state.doc,
            projects: [...state.doc.projects, { ...project, id: generateId() }],
            updatedAt: new Date().toISOString(),
          },
        })),

      updateProject: (id, updates) =>
        set((state) => ({
          doc: {
            ...state.doc,
            projects: state.doc.projects.map((proj) =>
              proj.id === id ? { ...proj, ...updates } : proj
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeProject: (id) =>
        set((state) => ({
          doc: {
            ...state.doc,
            projects: state.doc.projects.filter((proj) => proj.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      reorderProjects: (fromIndex, toIndex) =>
        set((state) => ({
          doc: {
            ...state.doc,
            projects: reorderArray(state.doc.projects, fromIndex, toIndex),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ========== 技能操作 ==========
      addSkill: (skill) =>
        set((state) => ({
          doc: {
            ...state.doc,
            skills: [...state.doc.skills, { ...skill, id: generateId() }],
            updatedAt: new Date().toISOString(),
          },
        })),

      updateSkill: (id, updates) =>
        set((state) => ({
          doc: {
            ...state.doc,
            skills: state.doc.skills.map((skill) =>
              skill.id === id ? { ...skill, ...updates } : skill
            ),
            updatedAt: new Date().toISOString(),
          },
        })),

      removeSkill: (id) =>
        set((state) => ({
          doc: {
            ...state.doc,
            skills: state.doc.skills.filter((skill) => skill.id !== id),
            updatedAt: new Date().toISOString(),
          },
        })),

      reorderSkills: (fromIndex, toIndex) =>
        set((state) => ({
          doc: {
            ...state.doc,
            skills: reorderArray(state.doc.skills, fromIndex, toIndex),
            updatedAt: new Date().toISOString(),
          },
        })),

      // ========== 其他操作 ==========
      setSaveStatus: (status) => set({ saveStatus: status }),

      setLastSavedAt: (timestamp) => set({ lastSavedAt: timestamp }),

      setAIStatus: (status) => set({ aiStatus: status }),

      setScoreAndSuggestions: (score, suggestions) => set({ score, suggestions }),

      updatePrivacyOptions: (options) =>
        set((state) => ({
          privacyOptions: {
            ...state.privacyOptions,
            ...options,
          },
        })),

      setHasShownPrivacyNotice: (shown) => set({ hasShownPrivacyNotice: shown }),

      setHighlightTargetPath: (targetPath) => set({ highlightTargetPath: targetPath }),

      setIsExporting: (isExporting) => set({ isExporting }),

      reset: () =>
        set({
          ...initialState,
          doc: createDefaultDocument(),
          currentTemplate: getDefaultTemplate(),
          templates: RESUME_TEMPLATES,
        }),
    }),
    {
      name: 'resume-editor:v1',
      // 仅持久化必要字段
      partialize: (state) => ({
        doc: state.doc,
        currentTemplate: state.currentTemplate,
        privacyOptions: state.privacyOptions,
        hasShownPrivacyNotice: state.hasShownPrivacyNotice,
        lastSavedAt: state.lastSavedAt,
      }),
    }
  )
);
