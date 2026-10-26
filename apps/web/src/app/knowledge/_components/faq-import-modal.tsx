'use client';

/**
 * FAQ CSV 批量导入模态框 (FaqImportModal)
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parseCsvRows, mapCsvToFaqItems, type ParsedFaqRow } from '@/lib/rag/csv-parser';

export interface FaqImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (csvText: string) => Promise<{
    total: number;
    successCount: number;
    failureCount: number;
    errors: Array<{ line: number; message: string }>;
  }>;
}

export function FaqImportModal({ isOpen, onClose, onImport }: FaqImportModalProps) {
  const [csvContent, setCsvContent] = React.useState<string>('');
  const [fileName, setFileName] = React.useState<string>('');
  const [parsedItems, setParsedItems] = React.useState<ParsedFaqRow[]>([]);
  const [parseErrors, setParseErrors] = React.useState<Array<{ line: number; message: string }>>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [resultSummary, setResultSummary] = React.useState<{
    successCount: number;
    failureCount: number;
  } | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) {
      setCsvContent('');
      setFileName('');
      setParsedItems([]);
      setParseErrors([]);
      setSubmitting(false);
      setResultSummary(null);
    }
  }, [isOpen]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const text = await file.text();
      setCsvContent(text);
      const rows = parseCsvRows(text);
      const { items, errors } = mapCsvToFaqItems(rows);
      setParsedItems(items);
      setParseErrors(errors);
    } catch {
      setParseErrors([{ line: 0, message: '读取文件失败，请确保文件编码为 UTF-8' }]);
    }
  };

  const handleDownloadTemplate = () => {
    const templateContent =
      '﻿标准问题,标准答案,相似问(以分号分隔)\n' +
      '如何申请退款？,请在个人订单中心点击申请退款，工作日24小时内原路退回。,怎么退钱;退款流程;我要退货\n' +
      '如何索取发票？,进入财务结算面板点击索取电子发票即可。,发票怎么开;报销凭证;需要开票\n';

    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'faq-template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleStartImport = async () => {
    if (!csvContent || parsedItems.length === 0) return;

    try {
      setSubmitting(true);
      const res = await onImport(csvContent);
      setResultSummary({
        successCount: res.successCount,
        failureCount: res.failureCount,
      });
      if (res.errors && res.errors.length > 0) {
        setParseErrors(res.errors);
      }
    } catch (err) {
      setParseErrors([
        {
          line: 0,
          message: err instanceof Error ? err.message : '批量导入执行异常',
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-w-xl max-h-[90vh] overflow-y-auto w-[95vw]">
        <DialogHeader>
          <DialogTitle>批量导入问答对 (CSV)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* 模板指引 */}
          <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground flex items-center justify-between">
            <div>
              <p className="font-medium text-foreground">导入格式要求：</p>
              <p>标准 CSV 格式，包含列：标准问题、标准答案、相似问（分号分隔）</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="min-h-[44px] min-w-[44px] text-xs shrink-0"
            >
              下载标准模板
            </Button>
          </div>

          {/* 文件选择区 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-6 text-center cursor-pointer bg-muted/10 flex flex-col items-center justify-center gap-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={submitting}
            />
            <div className="p-3 bg-primary/10 rounded-full text-primary">
              <Upload className="w-5 h-5" />
            </div>
            <div className="text-sm font-medium">
              {fileName ? fileName : '点击选择 CSV 文件'}
            </div>
            <p className="text-xs text-muted-foreground">单次最多批量导入 100 条问答对</p>
          </div>

          {/* 解析结果预览 */}
          {parsedItems.length > 0 && !resultSummary && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  已解析就绪：<strong className="text-foreground">{parsedItems.length}</strong> 条
                </span>
                {parseErrors.length > 0 && (
                  <span className="text-destructive">
                    格式警告：{parseErrors.length} 处
                  </span>
                )}
              </div>

              <div className="border rounded-md max-h-48 overflow-y-auto divide-y text-xs">
                {parsedItems.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="p-2 space-y-1">
                    <div className="font-medium flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{item.question}</span>
                      {item.similarQuestions.length > 0 && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1">
                          +{item.similarQuestions.length} 相似问
                        </Badge>
                      )}
                    </div>
                    <div className="text-muted-foreground line-clamp-1 pl-5.5">
                      {item.answer}
                    </div>
                  </div>
                ))}
                {parsedItems.length > 5 && (
                  <div className="p-2 text-center text-muted-foreground bg-muted/20">
                    ... 及其余 {parsedItems.length - 5} 条问答
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 导入成功报告 */}
          {resultSummary && (
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CheckCircle2 className="w-5 h-5" />
                <span>批量导入执行完毕</span>
              </div>
              <p className="text-xs text-muted-foreground">
                成功入库并完成向量化：{resultSummary.successCount} 条；
                {resultSummary.failureCount > 0 && (
                  <span className="text-destructive ml-1">
                    失败：{resultSummary.failureCount} 条
                  </span>
                )}
              </p>
            </div>
          )}

          {/* 错误提示列表 */}
          {parseErrors.length > 0 && (
            <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20 text-xs text-destructive space-y-1 max-h-32 overflow-y-auto">
              <div className="flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>错误明细：</span>
              </div>
              {parseErrors.map((err, i) => (
                <div key={i}>
                  {err.line > 0 ? `第 ${err.line} 行：` : ''}
                  {err.message}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="min-h-[44px] min-w-[44px]"
          >
            {resultSummary ? '完成' : '取消'}
          </Button>
          {!resultSummary && (
            <Button
              type="button"
              disabled={submitting || parsedItems.length === 0}
              onClick={handleStartImport}
              className="min-h-[44px] min-w-[44px]"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              开始导入 ({parsedItems.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
