// ============ 导入 React Hooks ============
import { useState, useRef, useCallback, useEffect } from 'react';
// useState: 管理组件内部状态（如输入内容、弹窗显示状态）
// useRef: 引用 DOM 元素（如文本框、文件输入框）
// useCallback: 缓存函数，避免不必要的重新创建

// ============ 导入 UI 组件 ============
import { Button } from '@/components/ui/button'; // 按钮组件
import { Textarea } from '@/components/ui/textarea'; // 多行文本输入框组件
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'; // 弹出层组件（用于附件选择菜单）

// ============ 导入状态管理 ============
import { useChatStore, type Attachment } from '@/stores/chat-store';
import { authFetch } from '@/lib/api/client';
// useChatStore: 聊天状态管理 Store
// Attachment: 附件类型定义（图片或文件）

// ============ 导入图标组件 ============
import {
  Image,
  FileText,
  X,
  Loader2,
  AlertCircle,
  FileWarning,
  Paperclip,
  Send,
} from 'lucide-react';
// Image: 图片图标
// FileText: 文件图标
// X: 关闭/删除图标
// Loader2: 加载动画图标
// AlertCircle: 警告图标
// FileWarning: 文件警告图标

// ============ 导入提示组件 ============
import { toast } from 'sonner'; // 用于显示提示消息（如错误提示、成功提示）
import { cn } from '@/lib/utils';

// ============ 文件上传常量配置 ============
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 图片最大大小：10MB（10 * 1024KB * 1024B）
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 文件最大大小：5MB
const UPLOAD_TIMEOUT = 20000; // 上传超时时间：20秒（20000毫秒）
/** 输入框自动增高上限（px） */
const TEXTAREA_MAX_HEIGHT = 120;

// ============ 组件属性类型定义 ============
interface ChatInputProps {
  onSend: (message: string) => void; // 发送消息的回调函数（父组件传入）
  isLoading?: boolean; // 是否正在加载（可选，用于禁用输入）
  // 跨模态接力：外部草稿预填（仅写入输入框，不自动发送；id 变化才消费一次）
  externalDraft?: { id: string; text: string } | null;
  // 预填被消费后的回调（父组件清除活动草稿）
  onExternalDraftConsumed?: (id: string) => void;
}

// ============ 聊天输入组件 ============
// 这是聊天页面底部的输入区域，负责：
// 1. 接收用户输入的文本消息
// 2. 上传图片和文件附件（仅豆包模型支持）
// 3. 处理键盘事件（如 Enter 发送）
// 4. 显示附件预览和删除
export function ChatInput({ onSend, isLoading, externalDraft, onExternalDraftConsumed }: ChatInputProps) {
  // ============ 组件内部状态 ============

  // 输入框的文本内容
  const [input, setInput] = useState('');

  // 是否正在使用输入法（如中文拼音输入）
  // 输入法激活时，按 Enter 不应该发送消息，而是确认输入法的选择
  const [isComposing, setIsComposing] = useState(false);

  // 附件选择弹窗的显示状态
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  // ============ DOM 元素引用 ============

  // 引用多行文本输入框元素
  // 用于：1. 自动调整高度  2. 发送后重置高度
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 引用隐藏的图片文件选择器
  // 用户点击"上传图片"按钮时，触发这个隐藏的 input 元素
  const imageInputRef = useRef<HTMLInputElement>(null);

  // 引用隐藏的文件选择器
  // 用户点击"上传文件"按钮时，触发这个隐藏的 input 元素
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============ 从 Store 获取状态和方法 ============

  // provider: 当前使用的 AI 提供商（如 'xunfei'、'doubao'）
  // attachment: 当前附件对象（图片或文件）
  // setAttachment: 设置附件的方法
  const { provider, attachment, setAttachment } = useChatStore();

  // ============ 附件功能开关 ============
  // 只有豆包（doubao）模型支持附件功能
  // 其他模型（如讯飞星火）不支持，按钮会显示为禁用状态
  const showAttachment = provider === 'doubao';

  // ============ 键盘事件处理 ============
  // 处理用户按下键盘按键的事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // 检查是否按下 Enter 键，且没有同时按下 Shift 键，且不在输入法激活状态
    // - Enter: 发送消息
    // - Shift + Enter: 换行（不发送）
    // - 输入法激活时（如正在输入拼音）: 不发送
    if (e.key === 'Enter' && !e.shiftKey && !isComposing) {
      e.preventDefault(); // 阻止默认行为（防止换行）
      handleSend(); // 调用发送函数
    }
  };

  // ============ 输入法事件处理 ============
  // 这两个函数用于处理中文、日文等需要输入法的语言

  // 输入法开始工作（如开始输入拼音）
  const handleCompositionStart = () => {
    setIsComposing(true); // 标记输入法激活
  };

  // 输入法结束工作（如选择了汉字）
  const handleCompositionEnd = () => {
    setIsComposing(false); // 标记输入法关闭
  };

  // ============ 发送消息处理 ============
  const handleSend = () => {
    // 发送条件检查：
    // 1. 如果没有附件，必须有文本内容（去除空格后不为空）
    // 2. 如果有附件，可以没有文本内容
    // 3. 不能在加载状态下发送
    if ((!input.trim() && !attachment) || isLoading) return;

    // 如果有附件，必须在 ready（准备就绪）状态才能发送
    // 其他状态：uploading（上传中）、error（错误）都不能发送
    if (attachment && attachment.status !== 'ready') return;

    // 调用父组件传入的发送函数
    onSend(input);

    // 清空输入框
    setInput('');

    // 重置输入框高度为初始高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // ============ 输入框内容变化处理 ============
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 更新输入内容
    setInput(e.target.value);

    // 自动调整输入框高度
    // 1. 先重置为 auto，让浏览器计算实际需要的高度
    e.target.style.height = 'auto';

    // 2. 设置为内容的实际高度，但最大不超过 200px
    //    scrollHeight 是元素内容的实际高度（包括滚动区域）
    e.target.style.height = `${Math.min(e.target.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
  };

  // ============ 跨模态接力：外部草稿预填（仅写入，不自动发送） ============
  useEffect(() => {
    if (!externalDraft) return;
    const el = textareaRef.current;
    setInput(externalDraft.text);
    // 触发与 handleInput 一致的高度重算，避免预填后高度不变
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
    }
    onExternalDraftConsumed?.(externalDraft.id);
    // 仅在草稿 id 变化时消费一次
     
  }, [externalDraft?.id]);

  // ============ 图片上传处理 ============
  // useCallback 用于缓存函数，避免每次渲染都创建新函数
  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      // 获取用户选择的文件
      const file = e.target.files?.[0];

      // 立即关闭附件选择弹窗，无论上传是否成功
      setIsPopoverOpen(false);

      // 如果没有选择文件，直接返回
      if (!file) return;

      // ============ 验证文件类型 ============
      // 只允许图片类型（MIME type 以 'image/' 开头）
      if (!file.type.startsWith('image/')) {
        // 显示自定义的错误提示（磨玻璃效果）
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 磨玻璃背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效装饰 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 提示内容 */}
              <div className="relative p-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <Image className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    请选择图片文件
                  </h3>
                  <p className="text-sm text-slate-500">支持 JPG、PNG、GIF、WebP 格式</p>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>
          ),
          { duration: 3000, position: 'top-center' }
        );

        // 清空文件选择器，允许重新选择同一个文件
        e.target.value = '';
        return;
      }

      // ============ 验证文件大小 ============
      // 图片不能超过 10MB
      if (file.size > MAX_IMAGE_SIZE) {
        // 计算当前文件大小（MB）
        const currentSize = (file.size / (1024 * 1024)).toFixed(1);

        // 显示文件过大的错误提示
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 磨玻璃背景 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4 pb-5">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <Image className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    图片大小超出限制
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-500">
                      当前图片: <span className="font-medium text-slate-700">{currentSize} MB</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      限制大小: <span className="font-medium text-slate-700">10 MB</span>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              {/* 进度条（显示文件大小占比） */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
                <div
                  className="h-full bg-blue-400/70 rounded-full"
                  style={{ width: `${Math.min((parseFloat(currentSize) / 10) * 100, 100)}%` }}
                />
              </div>
            </div>
          ),
          { duration: 4000, position: 'top-center' }
        );

        // 清空文件选择器
        e.target.value = '';
        return;
      }

      // ============ 创建临时附件对象 ============
      // 在图片读取完成前，先创建一个临时对象显示在界面上
      const tempAttachment: Attachment = {
        id: `img-${Date.now()}`, // 使用时间戳生成唯一 ID
        type: 'image', // 附件类型：图片
        name: file.name, // 文件名
        size: file.size, // 文件大小（字节）
        status: 'uploading', // 状态：上传中
      };

      // 将临时附件设置到 Store 中，界面会显示上传中的状态
      setAttachment(tempAttachment);

      try {
        // ============ 将图片转换为 base64 格式 ============
        // base64 是一种将二进制数据编码为文本的方式
        // 可以直接在 HTML 中显示，也可以发送给 AI 模型

        const reader = new FileReader(); // 创建文件读取器

        // 读取成功的回调
        reader.onload = () => {
          const base64 = reader.result as string; // 获取 base64 字符串

          // 更新附件状态为准备就绪
          setAttachment({
            ...tempAttachment, // 保留其他属性
            imageUrl: base64, // 添加图片的 base64 数据
            status: 'ready', // 状态改为准备就绪，可以发送了
          });
        };

        // 读取失败的回调
        reader.onerror = () => {
          setAttachment({
            ...tempAttachment,
            status: 'error', // 状态改为错误
            error: '图片读取失败', // 错误信息
          });
        };

        // 开始读取文件为 base64 格式
        reader.readAsDataURL(file);
      } catch (error) {
        // 捕获其他可能的错误
        setAttachment({
          ...tempAttachment,
          status: 'error',
          error: error instanceof Error ? error.message : '未知错误',
        });
      }

      // 清空文件选择器，允许重新选择同一个文件
      e.target.value = '';
    },
    [setAttachment] // 依赖项：setAttachment 方法
  );

  // 文件上传处理
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];

      // 立即关闭 popover，无论是否成功
      setIsPopoverOpen(false);

      if (!file) return;

      // 验证文件类型 - 只支持 PDF
      const allowedTypes = ['application/pdf'];
      if (!allowedTypes.includes(file.type)) {
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <AlertCircle className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    不支持的文件格式
                  </h3>
                  <p className="text-sm text-slate-500">
                    请选择 <span className="font-medium text-slate-700">PDF</span> 格式的文档
                  </p>
                </div>
                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </div>
          ),
          {
            duration: 4000,
            position: 'top-center',
          }
        );

        e.target.value = '';
        return;
      }

      // 验证文件大小
      if (file.size > MAX_FILE_SIZE) {
        const currentSize = (file.size / (1024 * 1024)).toFixed(1);

        // 自定义磨玻璃渐变主题 toast
        toast.custom(
          (t) => (
            <div
              className="relative rounded-2xl shadow-2xl overflow-hidden"
              style={{ boxShadow: '0 25px 50px -12px rgba(59, 130, 246, 0.12)' }}
            >
              {/* 背景层 */}
              <div
                className="absolute inset-0 backdrop-blur-xl"
                style={{
                  background:
                    'linear-gradient(135deg, rgba(219, 234, 254, 0.6) 0%, rgba(191, 219, 254, 0.55) 50%, rgba(147, 197, 253, 0.6) 100%)',
                }}
              />
              {/* 内边框 */}
              <div className="absolute inset-0 rounded-2xl border border-white/60" />

              {/* 光效 */}
              <div
                className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.7) 0%, transparent 70%)',
                }}
              />
              <div
                className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full blur-2xl pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,0.5) 0%, transparent 70%)',
                }}
              />

              {/* 内容 */}
              <div className="relative p-4 flex items-start gap-4 pb-5">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/40 backdrop-blur-sm border border-white/50 shadow-sm">
                    <FileWarning className="h-6 w-6 text-blue-600" strokeWidth={2} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-700 mb-1 tracking-tight">
                    文件大小超出限制
                  </h3>
                  <div className="space-y-1">
                    <p className="text-sm text-slate-500">
                      当前文件: <span className="font-medium text-slate-700">{currentSize} MB</span>
                    </p>
                    <p className="text-sm text-slate-500">
                      限制大小: <span className="font-medium text-slate-700">5 MB</span>
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">请压缩文件或选择较小的文档</p>
                </div>

                <button
                  onClick={() => toast.dismiss(t)}
                  className="flex-shrink-0 p-1.5 rounded-lg bg-white/30 hover:bg-white/50 transition-colors border border-white/40"
                >
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>

              {/* 进度条 - 基于 5MB 限制计算 */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/40">
                <div
                  className="h-full bg-blue-400/70 rounded-full"
                  style={{ width: `${Math.min((parseFloat(currentSize) / 5) * 100, 100)}%` }}
                />
              </div>
            </div>
          ),
          {
            duration: 5000,
            position: 'top-center',
          }
        );

        // 清空 input
        e.target.value = '';
        return;
      }

      // 创建临时附件对象
      const tempAttachment: Attachment = {
        id: `file-${Date.now()}`,
        type: 'file',
        name: file.name,
        size: file.size,
        status: 'uploading',
      };
      setAttachment(tempAttachment);

      try {
        // 上传到服务器
        const formData = new FormData();
        formData.append('file', file);

        // 创建 AbortController 用于超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT);

        const response = await authFetch('/api/files', {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || '上传失败');
        }

        setAttachment({
          ...tempAttachment,
          fileId: result.fileId,
          status: 'ready',
        });
      } catch (error) {
        let displayError = '上传失败';

        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            displayError = '上传超时，请检查网络连接或稍后重试';
          } else if (
            error.message.includes('processing') ||
            error.message.includes('timeout') ||
            error.message.includes('超时')
          ) {
            displayError = '文件处理中，请稍后重试。大文件需要更长的处理时间。';
          } else if (
            error.message.includes('InvalidParameter') ||
            error.message.includes('file type')
          ) {
            displayError = '文件格式不支持，请上传 PDF 文档。';
          } else {
            displayError = error.message;
          }
        }

        setAttachment({
          ...tempAttachment,
          status: 'error',
          error: displayError,
        });
      }

      // 清空 input
      e.target.value = '';
    },
    [setAttachment]
  );

  // ============ 删除附件处理 ============
  // 用户点击附件预览上的删除按钮时调用
  const handleRemoveAttachment = useCallback(async () => {
    // ============ 删除云端文件 ============
    // 如果附件有 fileId（说明已上传到服务器），需要先删除云端文件
    if (attachment?.fileId) {
      try {
        console.log('[ChatInput] 删除远程文件:', attachment.fileId);

        // 调用删除 API
        const response = await authFetch(
          `/api/files?fileId=${encodeURIComponent(attachment.fileId)}`,
          {
            method: 'DELETE',
          }
        );

        if (response.ok) {
          console.log('[ChatInput] 远程文件删除成功');
        } else {
          console.warn('[ChatInput] 远程文件删除失败:', response.status);
        }
      } catch (error) {
        // 远程删除失败不影响本地清理
        // 用户可能已经离线，或者服务器出错
        console.error('[ChatInput] 删除远程文件出错:', error);
      }
    }

    // ============ 清除本地附件状态 ============
    // 无论远程删除是否成功，都要清除本地状态
    // 这样用户界面会立即更新，不会看到附件预览
    setAttachment(null);
  }, [attachment, setAttachment]); // 依赖项：attachment 和 setAttachment

  // ============ 格式化文件大小显示 ============
  // 将字节数转换为人类可读的格式（B、KB、MB）
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''; // 如果没有大小信息，返回空字符串

    if (bytes < 1024) return `${bytes} B`; // 小于 1KB，显示字节

    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; // 小于 1MB，显示 KB

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; // 否则显示 MB
  };

  const attachButton = showAttachment ? (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl text-slate-400 hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
          aria-label="添加附件"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-48 rounded-2xl border-slate-200/80 bg-white/95 p-1.5 shadow-lg backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Image className="h-4 w-4 text-green-500" />
            上传图片
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <FileText className="h-4 w-4 text-blue-500" />
            上传文件
          </button>
          <p className="px-3 pb-1 pt-1 text-[10px] text-slate-400">PDF，≤ 5MB</p>
        </div>
      </PopoverContent>
    </Popover>
  ) : (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 cursor-not-allowed rounded-xl text-slate-300 dark:text-slate-600"
      disabled
      aria-label="当前模型不支持附件"
    >
      <Paperclip className="h-4 w-4" />
    </Button>
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* 附件预览：仅在有附件时占用额外高度 */}
      {attachment && (
        <div className="mb-2 flex items-center gap-2 px-1">
          <div className="inline-flex max-w-full items-center gap-2 rounded-xl bg-white/50 px-2 py-1 backdrop-blur-md dark:bg-slate-800/50">
            {attachment.status === 'uploading' ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />
            ) : attachment.type === 'image' ? (
              <div className="h-7 w-7 shrink-0 overflow-hidden rounded-md bg-slate-200 dark:bg-slate-600">
                {attachment.imageUrl && (
                  <img
                    src={attachment.imageUrl}
                    alt={attachment.name}
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            ) : (
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
            )}
            <span className="truncate text-xs text-slate-700 dark:text-slate-200 max-w-[140px] sm:max-w-[200px]">
              {attachment.name}
            </span>
            {attachment.size ? (
              <span className="shrink-0 text-[10px] text-slate-400">
                {formatFileSize(attachment.size)}
              </span>
            ) : null}
            {(attachment.status === 'ready' || attachment.status === 'error') && (
              <button
                type="button"
                onClick={handleRemoveAttachment}
                className="shrink-0 rounded-md p-0.5 hover:bg-slate-200 dark:hover:bg-slate-600"
                aria-label="删除附件"
              >
                <X className="h-3.5 w-3.5 text-slate-500" />
              </button>
            )}
            {attachment.status === 'error' && (
              <span className="truncate text-[10px] text-red-500" title={attachment.error}>
                {attachment.error || '失败'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* G-2 输入坞：与聊天卡片同系磨砂玻璃，单容器无嵌套描边（DESIGN.md §8.2） */}
      <div
        className={cn(
          'flex items-end gap-1 rounded-2xl p-1.5',
          'border border-white/60 bg-white/60 shadow-sm backdrop-blur-xl',
          'transition-all duration-200',
          'hover:border-slate-300/80 dark:border-white/10 dark:bg-slate-900/60 dark:hover:border-slate-700/80',
          'focus-within:border-blue-500/50 focus-within:bg-white/70 focus-within:shadow-[0_0_0_2px_rgba(59,130,246,0.12),0_4px_12px_-2px_rgba(59,130,246,0.15)]',
          'dark:focus-within:border-blue-500/40 dark:focus-within:bg-slate-950/75'
        )}
      >
        {attachButton}

        <Textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder={attachment ? '补充说明…' : '输入消息…'}
          title="Enter 发送，Shift + Enter 换行"
          className="min-h-[36px] max-h-[120px] flex-1 resize-none border-0 bg-transparent px-2 py-1.5 text-sm leading-5 text-slate-800 shadow-none placeholder:text-slate-400 focus-visible:ring-0 focus-visible:ring-offset-0 dark:text-slate-100"
          disabled={isLoading}
        />

        <Button
          type="button"
          onClick={handleSend}
          disabled={
            (!input.trim() && !attachment) || isLoading || attachment?.status === 'uploading'
          }
          className="mb-0.5 mr-0.5 h-9 w-9 shrink-0 rounded-xl border border-blue-400/20 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 p-0 text-white shadow-[0_4px_12px_-2px_rgba(59,130,246,0.35)] transition duration-200 hover:brightness-105 active:scale-[0.98] disabled:border-slate-200 disabled:bg-slate-200 disabled:from-slate-200 disabled:via-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none dark:disabled:border-slate-700 dark:disabled:from-slate-700 dark:disabled:via-slate-700 dark:disabled:to-slate-700"
          size="icon"
          aria-label={isLoading ? '发送中' : '发送'}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageSelect}
        className="hidden"
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* 辅助说明：无额外边框，弱对比融入底板 */}
      <p className="mt-1.5 px-1 text-center text-[10px] leading-tight text-slate-400/75 dark:text-slate-500/80">
        <span className="hidden sm:inline">
          {isLoading ? 'AI 正在回复… · ' : ''}
          Enter 发送 · Shift+Enter 换行 ·{' '}
        </span>
        生成内容请自行核实
      </p>
    </div>
  );
}
