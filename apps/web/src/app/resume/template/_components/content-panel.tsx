'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Briefcase, GraduationCap, Sparkles, FolderKanban } from 'lucide-react';
import { authHeaders } from '@/lib/api/client';
import { ModuleCard } from './module-card';
import { ResumeInput } from './resume-input';
import { ResumeTextarea } from './resume-textarea';
import { WorkExperienceList } from './work-experience-list';
import { EducationList } from './education-list';
import { ProjectList } from './project-list';
import { AIPolishLayer } from './ai-polish-layer';
import { PrivacyNoticeDialog } from './privacy-notice-dialog';
import { useResumeEditorStore } from '@/stores/resume-editor-store';
import type { EditModule } from '@/types/resume-editor';

/**
 * AI 润色状态接口
 */
interface PolishState {
  isOpen: boolean;
  fieldPath: string; // 字段路径，如 "personalInfo.name"
  originalText: string;
  optimizedText?: string;
  isLoading: boolean;
  error?: string;
}

export function ContentPanel() {
  // 优化：只订阅需要的状态，避免过度订阅
  const activeModule = useResumeEditorStore((state) => state.activeModule);
  const setActiveModule = useResumeEditorStore((state) => state.setActiveModule);

  // 只订阅 personalInfo，而不是整个 doc
  const personalInfo = useResumeEditorStore((state) => state.doc.personalInfo);

  // 订阅工作经历列表
  const workExperiences = useResumeEditorStore((state) => state.doc.workExperiences);
  const addWorkExperience = useResumeEditorStore((state) => state.addWorkExperience);
  const updateWorkExperience = useResumeEditorStore((state) => state.updateWorkExperience);
  const removeWorkExperience = useResumeEditorStore((state) => state.removeWorkExperience);

  // 订阅教育背景列表
  const educations = useResumeEditorStore((state) => state.doc.educations);
  const addEducation = useResumeEditorStore((state) => state.addEducation);
  const updateEducation = useResumeEditorStore((state) => state.updateEducation);
  const removeEducation = useResumeEditorStore((state) => state.removeEducation);

  // 订阅项目经历列表
  const projects = useResumeEditorStore((state) => state.doc.projects);
  const addProject = useResumeEditorStore((state) => state.addProject);
  const updateProject = useResumeEditorStore((state) => state.updateProject);
  const removeProject = useResumeEditorStore((state) => state.removeProject);

  const updateField = useResumeEditorStore((state) => state.updateField);
  const highlightTargetPath = useResumeEditorStore((state) => state.highlightTargetPath);
  const setHighlightTargetPath = useResumeEditorStore((state) => state.setHighlightTargetPath);
  const hasShownPrivacyNotice = useResumeEditorStore((state) => state.hasShownPrivacyNotice);
  const setHasShownPrivacyNotice = useResumeEditorStore((state) => state.setHasShownPrivacyNotice);
  const updatePrivacyOptions = useResumeEditorStore((state) => state.updatePrivacyOptions);

  // 隐私告知弹窗状态
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [pendingPolishAction, setPendingPolishAction] = useState<{
    fieldPath: string;
    text: string;
  } | null>(null);

  // AI 润色状态
  const [polishState, setPolishState] = useState<PolishState>({
    isOpen: false,
    fieldPath: '',
    originalText: '',
    optimizedText: undefined,
    isLoading: false,
    error: undefined,
  });

  /**
   * 根据目标路径判断应该高亮哪个模块
   * @param targetPath - 目标字段路径
   * @returns 对应的模块名称
   */
  const getModuleFromPath = (targetPath: string): EditModule => {
    if (targetPath.startsWith('personalInfo')) return 'personal';
    if (targetPath.startsWith('workExperiences')) return 'work';
    if (targetPath.startsWith('educations')) return 'education';
    if (targetPath.startsWith('projects')) return 'project';
    if (targetPath.startsWith('skills')) return 'skills';
    return 'personal'; // 默认返回个人信息模块
  };

  /**
   * 处理 pulse 动画完成
   */
  const handlePulseComplete = () => {
    // 清除高亮状态
    setHighlightTargetPath(null);
  };

  // 当 highlightTargetPath 变化时，自动切换到对应的模块
  useEffect(() => {
    if (highlightTargetPath) {
      const targetModule = getModuleFromPath(highlightTargetPath);
      if (targetModule !== activeModule) {
        setActiveModule(targetModule);
      }
    }
  }, [highlightTargetPath, activeModule, setActiveModule]);

  /**
   * 处理模块点击事件
   * 点击已展开的模块不会折叠,点击其他模块会切换到该模块
   */
  const handleModuleClick = (module: EditModule) => {
    setActiveModule(module);
  };

  /**
   * 打开 AI 润色浮层
   * @param fieldPath - 字段路径
   * @param text - 原始文本
   */
  const handleOpenPolish = async (fieldPath: string, text: string) => {
    // 如果是首次使用 AI 功能，先显示隐私告知弹窗
    if (!hasShownPrivacyNotice) {
      setPendingPolishAction({ fieldPath, text });
      setShowPrivacyDialog(true);
      return;
    }

    // 直接打开润色浮层
    setPolishState({
      isOpen: true,
      fieldPath,
      originalText: text,
      optimizedText: undefined,
      isLoading: true,
      error: undefined,
    });

    // 调用 AI 润色 API
    await callPolishAPI(fieldPath, text);
  };

  /**
   * 处理隐私告知弹窗同意
   */
  const handlePrivacyAccept = (allowContactFields: boolean) => {
    // 更新隐私选项
    updatePrivacyOptions({ allowContactFieldsToAI: allowContactFields });

    // 标记已显示过隐私告知
    setHasShownPrivacyNotice(true);

    // 关闭弹窗
    setShowPrivacyDialog(false);

    // 如果有待处理的润色操作，执行它
    if (pendingPolishAction) {
      const { fieldPath, text } = pendingPolishAction;
      setPendingPolishAction(null);

      setPolishState({
        isOpen: true,
        fieldPath,
        originalText: text,
        optimizedText: undefined,
        isLoading: true,
        error: undefined,
      });

      callPolishAPI(fieldPath, text);
    }
  };

  /**
   * 处理隐私告知弹窗关闭
   */
  const handlePrivacyClose = () => {
    setShowPrivacyDialog(false);
    setPendingPolishAction(null);
  };

  /**
   * 调用 AI 润色 API
   * @param fieldPath - 字段路径
   * @param text - 原始文本
   */
  const callPolishAPI = async (fieldPath: string, text: string) => {
    try {
      // 构建上下文信息
      const context: { position?: string; industry?: string; company?: string } = {};

      // 如果是职位字段，添加职位上下文
      if (fieldPath.includes('title') || fieldPath.includes('position')) {
        context.position = personalInfo.title || undefined;
      }

      const response = await fetch('/api/resume/polish', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          target: fieldPath,
          text,
          context,
          style: 'professional',
          language: 'zh-CN',
          privacy: {
            allowContactFields: false,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || '请求失败');
      }

      const data = await response.json();

      setPolishState((prev) => ({
        ...prev,
        isLoading: false,
        optimizedText: data.optimizedText,
        error: undefined,
      }));
    } catch (error) {
      console.error('AI 润色失败:', error);
      setPolishState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : '请求失败，请重试',
      }));
    }
  };

  /**
   * 应用优化后的文本
   */
  const handleApplyPolish = () => {
    if (polishState.optimizedText) {
      updateField(polishState.fieldPath, polishState.optimizedText);
    }
    handleClosePolish();
  };

  /**
   * 取消润色或点击外部关闭
   */
  const handleClosePolish = () => {
    setPolishState({
      isOpen: false,
      fieldPath: '',
      originalText: '',
      optimizedText: undefined,
      isLoading: false,
      error: undefined,
    });
  };

  /**
   * 重试 AI 润色
   */
  const handleRetryPolish = () => {
    setPolishState((prev) => ({
      ...prev,
      isLoading: true,
      error: undefined,
    }));
    callPolishAPI(polishState.fieldPath, polishState.originalText);
  };

  return (
    <div className="h-full p-6 space-y-4 overflow-y-auto">
      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">简历编辑</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          填写您的个人信息和工作经历
        </p>
      </motion.div>

      {/* 欢迎提示卡片 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="
          relative rounded-2xl p-6
          bg-gradient-to-br from-[#2F6BFF]/10 to-[#2F6BFF]/5
          dark:from-[#2F6BFF]/20 dark:to-[#2F6BFF]/10
          backdrop-blur-[28px]
          border border-[#2F6BFF]/20 dark:border-[#2F6BFF]/30
          shadow-[0_8px_32px_rgba(47,107,255,0.1)]
        "
      >
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 p-3 rounded-xl bg-[#2F6BFF]/10">
            <Sparkles className="w-6 h-6 text-[#2F6BFF]" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
              开始创建您的专业简历
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              点击下方模块卡片开始填写信息。AI
              助手将实时为您提供优化建议,帮助您打造更具竞争力的简历。
            </p>
          </div>
        </div>
      </motion.div>

      {/* 模块卡片列表 */}
      <div className="space-y-4">
        {/* 个人信息模块 */}
        <ModuleCard
          icon={User}
          title="个人信息"
          description="姓名、联系方式等基本信息"
          isActive={activeModule === 'personal'}
          onClick={() => handleModuleClick('personal')}
          shouldPulse={!!highlightTargetPath && highlightTargetPath.startsWith('personal')}
          onPulseComplete={handlePulseComplete}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResumeInput
                label="姓名"
                placeholder="请输入您的姓名"
                required
                maxLength={100}
                showCount
                value={personalInfo.name}
                onChange={(e) => updateField('personalInfo.name', e.target.value)}
              />
              <ResumeInput
                label="求职意向"
                placeholder="例如:高级前端工程师"
                maxLength={100}
                showCount
                value={personalInfo.title}
                onChange={(e) => updateField('personalInfo.title', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResumeInput
                label="邮箱"
                type="email"
                placeholder="your.email@example.com"
                maxLength={200}
                showCount
                value={personalInfo.email}
                onChange={(e) => updateField('personalInfo.email', e.target.value)}
              />
              <ResumeInput
                label="电话"
                type="tel"
                placeholder="138-0000-0000"
                maxLength={30}
                showCount
                value={personalInfo.phone}
                onChange={(e) => updateField('personalInfo.phone', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResumeInput
                label="现居地"
                placeholder="例如:北京市朝阳区"
                maxLength={100}
                showCount
                value={personalInfo.location}
                onChange={(e) => updateField('personalInfo.location', e.target.value)}
              />
              <ResumeInput
                label="学历"
                placeholder="例如:本科/硕士/博士"
                maxLength={50}
                showCount
                value={personalInfo.education}
                onChange={(e) => updateField('personalInfo.education', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ResumeInput
                label="专业"
                placeholder="例如:计算机科学与技术"
                maxLength={100}
                showCount
                value={personalInfo.major}
                onChange={(e) => updateField('personalInfo.major', e.target.value)}
              />
              <ResumeInput
                label="政治面貌"
                placeholder="例如:中共党员/群众"
                maxLength={50}
                showCount
                value={personalInfo.politicalStatus}
                onChange={(e) => updateField('personalInfo.politicalStatus', e.target.value)}
              />
            </div>

            <ResumeInput
              label="目前状态"
              placeholder="例如:在岗/离职"
              maxLength={50}
              showCount
              value={personalInfo.currentStatus}
              onChange={(e) => updateField('personalInfo.currentStatus', e.target.value)}
            />

            <ResumeTextarea
              label="专业技能"
              placeholder="列举您的核心技能,如:React、TypeScript、Node.js、Python 等..."
              rows={4}
              helperText="建议列举 5-10 项核心技能,可包含技术栈、工具、语言等"
              maxLength={2000}
              showCount
              value={personalInfo.summary}
              onChange={(e) => updateField('personalInfo.summary', e.target.value)}
              showPolishButton
              onPolishClick={() =>
                handleOpenPolish('personalInfo.summary', personalInfo.summary || '')
              }
            />
          </div>
        </ModuleCard>

        {/* 工作经历模块 */}
        <ModuleCard
          icon={Briefcase}
          title="工作经历"
          description="您的职业经历和成就"
          isActive={activeModule === 'work'}
          onClick={() => handleModuleClick('work')}
          shouldPulse={!!highlightTargetPath && highlightTargetPath.startsWith('work')}
          onPulseComplete={handlePulseComplete}
        >
          <WorkExperienceList
            experiences={workExperiences}
            onAdd={addWorkExperience}
            onUpdate={updateWorkExperience}
            onRemove={removeWorkExperience}
          />
        </ModuleCard>

        {/* 项目经历模块 */}
        <ModuleCard
          icon={FolderKanban}
          title="项目经历"
          description="项目经验和技术成果"
          isActive={activeModule === 'project'}
          onClick={() => handleModuleClick('project')}
          shouldPulse={!!highlightTargetPath && highlightTargetPath.startsWith('projects')}
          onPulseComplete={handlePulseComplete}
        >
          <ProjectList
            projects={projects}
            onAdd={addProject}
            onUpdate={updateProject}
            onRemove={removeProject}
          />
        </ModuleCard>

        {/* 教育背景模块 */}
        <ModuleCard
          icon={GraduationCap}
          title="教育背景"
          description="学历和专业信息"
          isActive={activeModule === 'education'}
          onClick={() => handleModuleClick('education')}
          shouldPulse={!!highlightTargetPath && highlightTargetPath.startsWith('education')}
          onPulseComplete={handlePulseComplete}
        >
          <EducationList
            educations={educations}
            onAdd={addEducation}
            onUpdate={updateEducation}
            onRemove={removeEducation}
          />
        </ModuleCard>
      </div>

      {/* AI 润色浮层 */}
      <AIPolishLayer
        isOpen={polishState.isOpen}
        originalText={polishState.originalText}
        optimizedText={polishState.optimizedText}
        isLoading={polishState.isLoading}
        error={polishState.error}
        onApply={handleApplyPolish}
        onCancel={handleClosePolish}
        onRetry={handleRetryPolish}
        onClickOutside={handleClosePolish}
      />

      {/* 隐私告知弹窗 */}
      <PrivacyNoticeDialog
        isOpen={showPrivacyDialog}
        onClose={handlePrivacyClose}
        onAccept={handlePrivacyAccept}
      />
    </div>
  );
}
