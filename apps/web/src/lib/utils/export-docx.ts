/**
 * Word Document Export Utilities
 *
 * Exports transcription results to .docx format with support for:
 * - Original text only
 * - Translation only
 * - Bilingual (side-by-side)
 */

import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';

export type ExportMode = 'original' | 'translation' | 'bilingual';

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  speaker: string;
  speakerLabel: 'Speaker A' | 'Speaker B' | 'Speaker C';
  originalText: string;
  translatedText: string;
  startTime: number;
  endTime: number;
}

export interface ExportOptions {
  fileName: string;
  language: string;
  targetLanguage: string;
  segments: TranscriptSegment[];
  mode: ExportMode;
}

/**
 * Export transcription to Word document
 */
export async function exportToWord(options: ExportOptions): Promise<void> {
  const { fileName, language, targetLanguage, segments, mode } = options;

  // Create document sections
  const children: Paragraph[] = [];

  // Add title
  children.push(
    new Paragraph({
      text: fileName,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  // Add metadata
  const modeText = {
    original: '原文',
    translation: '译文',
    bilingual: '双语对照',
  }[mode];

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `语言: ${language} → ${targetLanguage} | 模式: ${modeText}`,
          size: 20,
          color: '666666',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      border: {
        bottom: {
          color: 'CCCCCC',
          space: 1,
          style: BorderStyle.SINGLE,
          size: 6,
        },
      },
    })
  );

  // Add segments
  segments.forEach((segment, index) => {
    // Add speaker and timestamp header
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `[${segment.timestamp}] ${segment.speaker}`,
            bold: true,
            size: 20,
            color: '1E40AF', // blue-800
          }),
        ],
        spacing: { before: index === 0 ? 200 : 400, after: 100 },
      })
    );

    // Add original text
    if (mode === 'original' || mode === 'bilingual') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: segment.originalText,
              size: 24,
              font: 'Microsoft YaHei',
            }),
          ],
          spacing: { after: mode === 'bilingual' ? 100 : 200 },
        })
      );
    }

    // Add translation
    if (mode === 'translation' || mode === 'bilingual') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: segment.translatedText,
              size: 24,
              color: mode === 'bilingual' ? '64748B' : '000000', // slate-500 or black
              italics: mode === 'bilingual',
              font: 'Microsoft YaHei',
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }
  });

  // Create document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch = 1440 twips
              right: 1440,
              bottom: 1440,
              left: 1440,
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
            font: 'Microsoft YaHei',
            size: 24,
          },
          paragraph: {
            spacing: {
              line: 360, // 1.5 line spacing
            },
          },
        },
      },
    },
  });

  // Generate and download
  const blob = await Packer.toBlob(doc);
  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  saveAs(blob, `${fileNameWithoutExt}_${modeText}.docx`);
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
