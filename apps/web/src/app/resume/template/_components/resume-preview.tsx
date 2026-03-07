'use client';

import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ResumeDocument } from '@/types/resume-editor';

/**
 * 简历预览组件属性
 */
interface ResumePreviewProps {
  /** 简历文档数据 */
  document: ResumeDocument;
  /** 最近更新的字段路径，用于高亮动画 */
  recentlyUpdatedPath?: string;
}

/**
 * 文本高亮包装组件
 * 当内容更新时显示短暂的闪烁效果
 */
const HighlightText = memo(
  ({ children, isHighlighted }: { children: React.ReactNode; isHighlighted?: boolean }) => {
    return (
      <AnimatePresence mode="wait">
        {isHighlighted ? (
          <motion.span
            key="highlighted"
            initial={{ backgroundColor: 'rgba(47, 107, 255, 0.2)' }}
            animate={{ backgroundColor: 'rgba(47, 107, 255, 0)' }}
            transition={{ duration: 0.2 }}
            className="inline-block"
          >
            {children}
          </motion.span>
        ) : (
          <span key="normal">{children}</span>
        )}
      </AnimatePresence>
    );
  }
);

HighlightText.displayName = 'HighlightText';

/**
 * 简历预览组件
 *
 * 实时渲染简历内容，支持局部更新和高亮动画
 * - 订阅 store 的简历数据
 * - 使用增量渲染避免整页重绘
 * - 更新时显示 200ms 闪烁效果
 */
export const ResumePreview = memo(({ document, recentlyUpdatedPath }: ResumePreviewProps) => {
  const { personalInfo, workExperiences, educations, projects, skills } = document;

  // 检查字段是否最近更新
  const isFieldUpdated = (path: string) => {
    return recentlyUpdatedPath?.startsWith(path);
  };

  return (
    <div className="w-full h-full p-12 space-y-6">
      {/* 简历标题 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">个人简历</h1>
      </div>

      {/* 个人信息区域 */}
      <section className="space-y-3">
        {/* 联系方式和基本信息 - 使用网格布局，一行两列 */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
          {personalInfo.name && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.name')}>
              <span>姓名: {personalInfo.name}</span>
            </HighlightText>
          )}
          {personalInfo.title && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.title')}>
              <span>求职意向: {personalInfo.title}</span>
            </HighlightText>
          )}
          {personalInfo.email && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.email')}>
              <span>邮箱: {personalInfo.email}</span>
            </HighlightText>
          )}
          {personalInfo.phone && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.phone')}>
              <span>电话: {personalInfo.phone}</span>
            </HighlightText>
          )}
          {personalInfo.location && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.location')}>
              <span>现居地: {personalInfo.location}</span>
            </HighlightText>
          )}
          {personalInfo.education && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.education')}>
              <span>学历: {personalInfo.education}</span>
            </HighlightText>
          )}
          {personalInfo.major && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.major')}>
              <span>专业: {personalInfo.major}</span>
            </HighlightText>
          )}
          {personalInfo.politicalStatus && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.politicalStatus')}>
              <span>政治面貌: {personalInfo.politicalStatus}</span>
            </HighlightText>
          )}
          {personalInfo.currentStatus && (
            <HighlightText isHighlighted={isFieldUpdated('personalInfo.currentStatus')}>
              <span>目前状态: {personalInfo.currentStatus}</span>
            </HighlightText>
          )}
        </div>

        {/* 专业技能 */}
        {personalInfo.summary && (
          <HighlightText isHighlighted={isFieldUpdated('personalInfo.summary')}>
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                专业技能
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {personalInfo.summary}
              </p>
            </div>
          </HighlightText>
        )}
      </section>

      {/* 分隔线 */}
      <div className="h-px bg-slate-200 dark:bg-slate-700" />

      {/* 工作经历 */}
      {workExperiences.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">工作经历</h2>
          <div className="space-y-6">
            {workExperiences.map((exp, index) => (
              <div key={exp.id} className="space-y-2">
                <div className="flex justify-between items-start gap-4">
                  <HighlightText
                    isHighlighted={
                      isFieldUpdated(`workExperiences[${index}].company`) ||
                      isFieldUpdated(`workExperiences[${index}].position`)
                    }
                  >
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                      {exp.company}
                      {exp.company && exp.position && ' - '}
                      {exp.position}
                    </h3>
                  </HighlightText>
                  <HighlightText isHighlighted={isFieldUpdated(`workExperiences[${index}].period`)}>
                    <span className="text-sm text-slate-500 dark:text-slate-500 whitespace-nowrap flex-shrink-0">
                      {exp.period}
                    </span>
                  </HighlightText>
                </div>
                {exp.description && (
                  <HighlightText
                    isHighlighted={isFieldUpdated(`workExperiences[${index}].description`)}
                  >
                    <div>
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        岗位职责:
                      </span>
                      <span className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                        {exp.description}
                      </span>
                    </div>
                  </HighlightText>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 项目经历 */}
      {projects.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">项目经历</h2>
          <div className="space-y-6">
            {projects.map((proj, index) => (
              <div key={proj.id} className="space-y-2">
                <div className="flex justify-between items-start">
                  <HighlightText isHighlighted={isFieldUpdated(`projects[${index}].name`)}>
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                      项目名称: {proj.name}
                    </h3>
                  </HighlightText>
                  {proj.period && (
                    <HighlightText isHighlighted={isFieldUpdated(`projects[${index}].period`)}>
                      <span className="text-sm text-slate-500 dark:text-slate-500">
                        {proj.period}
                      </span>
                    </HighlightText>
                  )}
                </div>
                {proj.description && (
                  <div className="mt-2">
                    <HighlightText isHighlighted={isFieldUpdated(`projects[${index}].description`)}>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        项目介绍:
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                        {proj.description}
                      </p>
                    </HighlightText>
                  </div>
                )}
                {proj.responsibilities && (
                  <div className="mt-2">
                    <HighlightText
                      isHighlighted={isFieldUpdated(`projects[${index}].responsibilities`)}
                    >
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        项目职责:
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                        {proj.responsibilities}
                      </p>
                    </HighlightText>
                  </div>
                )}
                {proj.highlights && (
                  <div className="mt-2">
                    <HighlightText isHighlighted={isFieldUpdated(`projects[${index}].highlights`)}>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        项目亮点:
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                        {proj.highlights}
                      </p>
                    </HighlightText>
                  </div>
                )}
                {proj.techStack && (
                  <div className="mt-2">
                    <HighlightText isHighlighted={isFieldUpdated(`projects[${index}].techStack`)}>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        技术栈:
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        {proj.techStack}
                      </p>
                    </HighlightText>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 教育背景 */}
      {educations.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">教育背景</h2>
          <div className="space-y-4">
            {educations.map((edu, index) => (
              <div key={edu.id} className="space-y-1">
                <div className="flex justify-between items-start">
                  <HighlightText isHighlighted={isFieldUpdated(`educations[${index}].school`)}>
                    <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200">
                      {edu.school}
                    </h3>
                  </HighlightText>
                  <HighlightText isHighlighted={isFieldUpdated(`educations[${index}].period`)}>
                    <span className="text-sm text-slate-500 dark:text-slate-500">{edu.period}</span>
                  </HighlightText>
                </div>
                <div className="flex gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <HighlightText isHighlighted={isFieldUpdated(`educations[${index}].degree`)}>
                    <span>{edu.degree}</span>
                  </HighlightText>
                  <span>·</span>
                  <HighlightText isHighlighted={isFieldUpdated(`educations[${index}].major`)}>
                    <span>{edu.major}</span>
                  </HighlightText>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 技能 */}
      {skills.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">专业技能</h2>
          <div className="flex flex-wrap gap-2">
            {skills.map((skill, index) => (
              <HighlightText key={skill.id} isHighlighted={isFieldUpdated(`skills[${index}]`)}>
                <span className="px-3 py-1 text-sm bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full">
                  {skill.name}
                  {skill.level && ` · ${skill.level}`}
                </span>
              </HighlightText>
            ))}
          </div>
        </section>
      )}
    </div>
  );
});

ResumePreview.displayName = 'ResumePreview';
