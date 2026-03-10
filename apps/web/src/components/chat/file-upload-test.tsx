'use client';

import { useState } from 'react';
import { FileUpload } from './file-upload';
import type { Attachment } from '@/stores/chat-store';

// 简单的测试组件，用于验证文件上传功能
export function FileUploadTest() {
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleFilesSelected = (newAttachments: Attachment[]) => {
    setAttachments((prev) => [...prev, ...newAttachments]);
    console.log('文件已选择:', newAttachments);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
    console.log('文件已移除:', id);
  };

  const handleTestSend = () => {
    console.log('模拟发送消息，附件:', attachments);
    alert(`准备发送 ${attachments.length} 个附件`);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">文件上传功能测试</h2>

      <FileUpload
        onFilesSelected={handleFilesSelected}
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
      />

      {attachments.length > 0 && (
        <div className="flex justify-between items-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
          <span className="text-sm text-blue-700 dark:text-blue-300">
            已选择 {attachments.length} 个文件
          </span>
          <button
            onClick={handleTestSend}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            测试发送
          </button>
        </div>
      )}

      {/* 调试信息 */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-400">
          调试信息
        </summary>
        <pre className="mt-2 p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs overflow-auto">
          {JSON.stringify(attachments, null, 2)}
        </pre>
      </details>
    </div>
  );
}
