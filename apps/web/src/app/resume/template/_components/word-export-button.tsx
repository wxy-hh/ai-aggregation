'use client';

import { motion } from 'framer-motion';
import { Loader2, FileText } from 'lucide-react';
import { useState } from 'react';
import { useResumeEditorStore } from '@/stores/resume-editor-store';
import type { ResumeDocument } from '@/types/resume-editor';

/**
 * Word 导出按钮组件属性
 */
export interface WordExportButtonProps {
  /** 是否禁用 */
  disabled?: boolean;
  /** 简历标题（用于文件名） */
  resumeTitle?: string;
}

/**
 * 生成 Word 文档
 */
async function generateWordDocument(doc: ResumeDocument, fileName: string) {
  // 动态导入 docx 库
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    BorderStyle,
    Tab,
    TabStopType,
    TabStopPosition,
    convertMillimetersToTwip,
  } = await import('docx');

  const BODY_COLOR = '475569';
  const TITLE_COLOR = '0F172A';
  const DIVIDER_COLOR = 'E2E8F0';
  const FONT_FAMILY = 'Microsoft YaHei';
  const BODY_FONT_SIZE = 21;
  const SECTION_TITLE_SIZE = 30;
  const ITEM_TITLE_SIZE = 27;
  const MAIN_TITLE_SIZE = 44;
  const LINE_SPACING = 360;
  const PAGE_PADDING = convertMillimetersToTwip(20);
  const RIGHT_ALIGN_TAB = TabStopPosition.MAX;
  const INFO_COLUMN_TAB = 6200;

  const children: InstanceType<typeof Paragraph>[] = [];

  const createRun = (text: string, overrides: Record<string, unknown> = {}) =>
    new TextRun({
      text,
      font: FONT_FAMILY,
      size: BODY_FONT_SIZE,
      color: BODY_COLOR,
      ...overrides,
    });

  const createTabRun = () =>
    new TextRun({
      children: [new Tab()],
      font: FONT_FAMILY,
      size: BODY_FONT_SIZE,
      color: BODY_COLOR,
    });

  const createBodyParagraph = (
    paragraphChildren: InstanceType<typeof TextRun>[] = [],
    spacing: { before?: number; after?: number } = {}
  ) =>
    new Paragraph({
      children: paragraphChildren,
      spacing: { line: LINE_SPACING, ...spacing },
    });

  const createSectionTitle = (text: string, before = 280) =>
    createBodyParagraph(
      [
        createRun(text, {
          bold: true,
          size: SECTION_TITLE_SIZE,
          color: TITLE_COLOR,
        }),
      ],
      { before, after: 120 }
    );

  const createPeriodHeading = (leftText: string, rightText?: string) =>
    new Paragraph({
      children: rightText
        ? [
            createRun(leftText, {
              bold: true,
              size: ITEM_TITLE_SIZE,
              color: TITLE_COLOR,
            }),
            createTabRun(),
            createRun(rightText, {
              color: BODY_COLOR,
            }),
          ]
        : [
            createRun(leftText, {
              bold: true,
              size: ITEM_TITLE_SIZE,
              color: TITLE_COLOR,
            }),
          ],
      tabStops: rightText
        ? [
            {
              type: TabStopType.RIGHT,
              position: RIGHT_ALIGN_TAB,
            },
          ]
        : undefined,
      spacing: { line: LINE_SPACING, after: 90 },
    });

  const createLabelParagraph = (label: string) =>
    createBodyParagraph([createRun(label, { bold: true, color: TITLE_COLOR })], {
      after: 40,
    });

  const createLabelValueParagraph = (label: string, value: string, after = 180) =>
    createBodyParagraph([createRun(label, { bold: true, color: TITLE_COLOR }), createRun(value)], {
      after,
    });

  const splitTextBlock = (value: string) => {
    const normalized = value.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const lineItems = normalized
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lineItems.length > 1) {
      return lineItems;
    }

    const inlineNumberedItems = normalized
      .split(/(?=\d+\.\s*)/)
      .map((line) => line.trim())
      .filter(Boolean);

    return inlineNumberedItems.length > 1 ? inlineNumberedItems : [normalized];
  };

  const pushTextBlock = (value: string, spacingAfter = 60, finalSpacingAfter = 160) => {
    const items = splitTextBlock(value);

    items.forEach((item, index) => {
      children.push(
        createBodyParagraph([createRun(item)], {
          after: index === items.length - 1 ? finalSpacingAfter : spacingAfter,
        })
      );
    });
  };

  children.push(
    new Paragraph({
      children: [
        createRun('个人简历', {
          bold: true,
          size: MAIN_TITLE_SIZE,
          color: TITLE_COLOR,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { line: LINE_SPACING, after: 420 },
    })
  );

  const infoItems = [
    doc.personalInfo.name ? `姓名: ${doc.personalInfo.name}` : '',
    doc.personalInfo.title ? `求职意向: ${doc.personalInfo.title}` : '',
    doc.personalInfo.email ? `邮箱: ${doc.personalInfo.email}` : '',
    doc.personalInfo.phone ? `电话: ${doc.personalInfo.phone}` : '',
    doc.personalInfo.location ? `现居地: ${doc.personalInfo.location}` : '',
    doc.personalInfo.education ? `学历: ${doc.personalInfo.education}` : '',
    doc.personalInfo.major ? `专业: ${doc.personalInfo.major}` : '',
    doc.personalInfo.currentStatus ? `目前状态: ${doc.personalInfo.currentStatus}` : '',
    doc.personalInfo.politicalStatus ? `政治面貌: ${doc.personalInfo.politicalStatus}` : '',
  ].filter(Boolean);

  for (let index = 0; index < infoItems.length; index += 2) {
    const leftItem = infoItems[index];
    const rightItem = infoItems[index + 1];

    children.push(
      new Paragraph({
        children: rightItem
          ? [createRun(leftItem), createTabRun(), createRun(rightItem)]
          : [createRun(leftItem)],
        tabStops: rightItem
          ? [
              {
                type: TabStopType.LEFT,
                position: INFO_COLUMN_TAB,
              },
            ]
          : undefined,
        spacing: { line: LINE_SPACING, after: 60 },
      })
    );
  }

  if (doc.personalInfo.summary) {
    children.push(createSectionTitle('专业技能', 220));
    pushTextBlock(doc.personalInfo.summary, 40, 180);
  }

  const hasDetailSections =
    doc.workExperiences.length > 0 || doc.projects.length > 0 || doc.educations.length > 0;

  if (hasDetailSections) {
    children.push(
      new Paragraph({
        border: {
          bottom: {
            color: DIVIDER_COLOR,
            style: BorderStyle.SINGLE,
            size: 6,
            space: 1,
          },
        },
        spacing: { before: 160, after: 260 },
      })
    );
  }

  if (doc.workExperiences.length > 0) {
    children.push(createSectionTitle('工作经历', 0));

    doc.workExperiences.forEach((exp, index) => {
      const heading =
        exp.company && exp.position
          ? `${exp.company} - ${exp.position}`
          : exp.company || exp.position;
      children.push(createPeriodHeading(heading, exp.period));

      if (exp.description) {
        children.push(createLabelValueParagraph('岗位职责: ', exp.description, 0));
      }

      if (index < doc.workExperiences.length - 1) {
        children.push(createBodyParagraph([], { after: 120 }));
      }
    });
  }

  if (doc.projects.length > 0) {
    children.push(createSectionTitle('项目经历'));

    doc.projects.forEach((project, index) => {
      children.push(createPeriodHeading(`项目名称: ${project.name}`, project.period));

      if (project.description) {
        children.push(createLabelParagraph('项目介绍:'));
        pushTextBlock(project.description);
      }

      if (project.responsibilities) {
        children.push(createLabelParagraph('项目职责:'));
        pushTextBlock(project.responsibilities);
      }

      if (project.highlights) {
        children.push(createLabelParagraph('项目亮点:'));
        pushTextBlock(project.highlights);
      }

      if (project.techStack) {
        children.push(createLabelParagraph('技术栈:'));
        pushTextBlock(project.techStack, 40, 160);
      }

      if (index < doc.projects.length - 1) {
        children.push(createBodyParagraph([], { after: 120 }));
      }
    });
  }

  if (doc.educations.length > 0) {
    children.push(createSectionTitle('教育背景'));

    doc.educations.forEach((edu, index) => {
      children.push(createPeriodHeading(edu.school, edu.period));

      const meta = [edu.degree, edu.major].filter(Boolean).join(' · ');
      if (meta) {
        children.push(createBodyParagraph([createRun(meta)], { after: 140 }));
      }

      if (index < doc.educations.length - 1) {
        children.push(createBodyParagraph([], { after: 80 }));
      }
    });
  }

  // 创建文档
  const wordDoc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: PAGE_PADDING,
              right: PAGE_PADDING,
              bottom: PAGE_PADDING,
              left: PAGE_PADDING,
            },
          },
        },
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: FONT_FAMILY,
            size: BODY_FONT_SIZE,
            color: BODY_COLOR,
          },
          paragraph: {
            spacing: {
              line: LINE_SPACING,
            },
          },
        },
      },
    },
  });

  // 生成 Blob
  const blob = await Packer.toBlob(wordDoc);

  // 下载文件
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Word 导出按钮组件
 */
export function WordExportButton({
  disabled = false,
  resumeTitle = '简历',
}: WordExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const doc = useResumeEditorStore((state) => state.doc);
  const setStoreExporting = useResumeEditorStore((state) => state.setIsExporting);

  const handleExport = async () => {
    if (disabled || isExporting) return;

    try {
      setIsExporting(true);
      setStoreExporting(true);

      const fileName = `${resumeTitle || '简历'}_${new Date().toISOString().split('T')[0]}.docx`;
      await generateWordDocument(doc, fileName);
    } catch (error) {
      console.error('Word 导出失败:', error);
      alert('Word 导出失败，请重试');
    } finally {
      setIsExporting(false);
      setStoreExporting(false);
    }
  };

  return (
    <motion.button
      onClick={handleExport}
      disabled={disabled || isExporting}
      whileHover={!disabled && !isExporting ? { scale: 1.02 } : {}}
      whileTap={!disabled && !isExporting ? { scale: 0.98 } : {}}
      className="
        px-4 py-2 rounded-xl
        bg-white dark:bg-slate-800
        border border-slate-200 dark:border-slate-700
        text-slate-700 dark:text-slate-300
        text-sm font-medium
        hover:bg-slate-50 dark:hover:bg-slate-700
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-150
        flex items-center gap-2
        shadow-sm
        focus:outline-none focus:ring-2 focus:ring-[#2F6BFF] focus:ring-offset-2
      "
      title="导出为 Word 文档"
      aria-label="导出 Word 文档"
      aria-busy={isExporting}
    >
      {isExporting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          生成中...
        </>
      ) : (
        <>
          <FileText className="w-4 h-4" aria-hidden="true" />
          下载 Word
        </>
      )}
    </motion.button>
  );
}
