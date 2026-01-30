# 语音转写功能开发指南

## ✅ 已完成功能

### 1. 模式切换功能

- ✅ 在页面顶部添加了 Tab 切换组件
- ✅ 支持"实时录音"和"上传音频"两种模式
- ✅ 切换时保持侧边栏和基础布局不变
- ✅ 根据模式显示不同的内容区域

### 2. 上传音频组件 (100% 还原设计图)

- ✅ 拖拽上传区域（虚线边框）
- ✅ 蓝色上传图标（云朵+箭头）
- ✅ 标题和说明文字
- ✅ 蓝色"选择文件"按钮
- ✅ 文件类型和大小验证
- ✅ 上传进度条显示
- ✅ 已选文件卡片展示
- ✅ 文件删除功能

### 3. UI/UX 优化

- ✅ 响应式设计
- ✅ 深色模式支持
- ✅ 平滑过渡动画
- ✅ 拖拽悬停效果
- ✅ 错误提示处理

## 🎨 设计规范遵循

### 遵循的 Skills

1. **frontend-design** - 创建独特的、生产级的前端界面
2. **react-best-practices** - React 性能优化最佳实践
3. **ui-ux-pro-max** - UI/UX 设计智能指南

### 设计特点

- 使用 Tailwind CSS 实用类
- 遵循现有的设计系统（颜色、间距、圆角）
- 保持与现有组件的视觉一致性
- 优化的交互反馈

## 📁 文件结构

```
apps/web/src/
├── app/
│   └── voice/
│       ├── page.tsx              # ✅ 更新：添加模式切换
│       └── README.md             # ✅ 新增：功能文档
└── components/
    └── voice/
        ├── waveform.tsx          # 保持不变
        ├── transcript-list.tsx   # 保持不变
        ├── recording-library.tsx # 保持不变
        └── upload-audio.tsx      # ✅ 新增：上传组件
```

## 🔧 技术实现

### 状态管理

```typescript
const [mode, setMode] = useState<VoiceMode>('realtime');
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [uploadProgress, setUploadProgress] = useState(0);
```

### 文件验证

- 支持格式：MP3, WAV, AAC
- 最大文件大小：50MB
- 客户端验证，防止无效上传

### 拖拽功能

- `onDragOver` - 显示拖拽悬停效果
- `onDragLeave` - 移除悬停效果
- `onDrop` - 处理文件放置

## 🚀 下一步开发

### 后端集成

1. 创建 API 路由 `/api/voice/transcribe`
2. 集成 SiliconFlow API
3. 处理文件上传和存储
4. 返回转录结果

### 前端增强

1. 实际的音频录制功能
2. 音频播放器组件
3. 转录结果编辑功能
4. 导出多种格式（TXT, SRT, JSON）

### 用户体验

1. 添加音频预览播放
2. 显示音频时长和波形
3. 支持批量上传
4. 转录历史记录管理

## 📝 使用示例

### 切换到上传模式

```typescript
// 用户点击"上传音频" Tab
setMode('upload');
// 页面自动切换到上传界面
```

### 上传文件

```typescript
// 方式 1: 拖拽文件
// 用户拖拽文件到上传区域

// 方式 2: 点击选择
// 用户点击"选择文件"按钮
// 打开文件选择对话框
```

### 文件处理

```typescript
const handleFileSelection = (file: File) => {
  // 1. 验证文件类型
  // 2. 验证文件大小
  // 3. 设置选中文件
  // 4. 模拟上传进度
  // 5. 调用回调函数
  onFileSelect?.(file);
};
```

## 🎯 性能优化

### 已实现的优化

- ✅ 使用 `useRef` 避免不必要的重渲染
- ✅ 条件渲染减少 DOM 节点
- ✅ CSS 过渡动画而非 JS 动画
- ✅ 文件验证在客户端完成

### 建议的优化

- [ ] 使用 Web Workers 处理大文件
- [ ] 实现文件分片上传
- [ ] 添加上传取消功能
- [ ] 使用虚拟滚动优化历史记录列表

## 🧪 测试建议

### 功能测试

- [ ] 测试文件拖拽上传
- [ ] 测试文件选择上传
- [ ] 测试文件类型验证
- [ ] 测试文件大小验证
- [ ] 测试模式切换
- [ ] 测试深色模式

### 兼容性测试

- [ ] Chrome/Edge
- [ ] Firefox
- [ ] Safari
- [ ] 移动端浏览器

## 📚 相关文档

- [SiliconFlow API 文档](https://docs.siliconflow.cn/cn/api-reference/audio/create-audio-transcriptions)
- [React Best Practices](.claude/skills/react-best-practices/SKILL.md)
- [UI/UX Pro Max](.claude/skills/ui-ux-pro-max/SKILL.md)
- [Frontend Design](.claude/skills/frontend-design/SKILL.md)

## 🐛 已知问题

目前没有已知问题。

## 💡 提示

1. 确保 `.env.local` 中配置了 SiliconFlow API Key
2. 上传的文件会暂存在客户端，需要实现服务器端存储
3. 转录功能需要后端 API 支持
4. 建议添加错误边界处理异常情况
