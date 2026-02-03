# 音频历史记录存储策略

## 概述

音频历史记录功能现在支持智能存储策略：**最近10次上传的音频文件会被完整保存（包括音频文件本身），超过10次的历史记录只保留文本数据（转录和翻译结果）**。

## 功能特性

### ✅ 已实现

1. **智能音频保留**
   - 最近10条记录：保存完整音频文件（Blob格式）
   - 超过10条的记录：自动删除音频文件，仅保留文本数据
   - 自动清理机制：每次新增记录时自动触发

2. **历史记录切换**
   - 最近10条：可以播放原始音频
   - 超过10条：显示"音频文件不可用"提示，但可以查看转录和翻译结果

3. **存储优化**
   - 使用 IndexedDB 存储音频 Blob
   - 自动管理存储空间
   - 避免浏览器存储配额溢出

## 技术实现

### 数据结构

```typescript
interface AudioHistoryItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileMimeType: string;
  uploadTime: Date;
  transcriptionText?: string;
  translationText?: string;
  processingStatus: ProcessingStatus;
  tags: string[];
  title: string;
  duration?: number;
  audioBlob?: Blob; // 🆕 新增：音频二进制数据（仅最近10条）
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### 清理逻辑

```typescript
// 在 IndexedDBStorage 中实现
private async cleanupOldAudioBlobs(): Promise<void> {
  const allItems = await this.db.audioHistory
    .orderBy('createdAt')
    .reverse()
    .toArray();

  const KEEP_AUDIO_COUNT = 10;

  if (allItems.length > KEEP_AUDIO_COUNT) {
    const itemsToCleanup = allItems.slice(KEEP_AUDIO_COUNT);

    for (const item of itemsToCleanup) {
      if (item.audioBlob) {
        await this.db.audioHistory.update(item.id, {
          audioBlob: undefined
        });
      }
    }
  }
}
```

### 触发时机

清理操作在以下情况自动触发：

- 创建新的历史记录时（`storage.create()`）
- 确保始终只保留最近10条的音频文件

## 用户体验

### 最近10条记录

```
┌─────────────────────────────────────┐
│ 🎵 test-audio.mp3                   │
│ ▶️ [播放器控制]                      │
│ 📝 转录文本...                       │
│ 🌐 翻译文本...                       │
└─────────────────────────────────────┘
```

### 超过10条的记录

```
┌─────────────────────────────────────┐
│ 🎵 old-audio.mp3                    │
│ ⚠️ 音频文件不可用                    │
│    历史记录中未保存音频文件，        │
│    但转录和翻译结果已保留            │
│ 📝 转录文本...                       │
│ 🌐 翻译文本...                       │
│ [重新上传] 按钮                      │
└─────────────────────────────────────┘
```

## 存储空间估算

假设平均每个音频文件 5MB：

| 记录数量 | 音频存储 | 文本存储 | 总计    |
| -------- | -------- | -------- | ------- |
| 10条     | 50MB     | ~100KB   | ~50MB   |
| 50条     | 50MB     | ~500KB   | ~50.5MB |
| 100条    | 50MB     | ~1MB     | ~51MB   |

**优势**：

- 存储空间稳定在 50MB 左右
- 不会随着历史记录增加而无限增长
- 文本数据占用空间极小，可以保留大量历史记录

## 配置选项

如果需要调整保留数量，修改 `indexeddb-storage.ts` 中的常量：

```typescript
// 当前默认值：10
const KEEP_AUDIO_COUNT = 10;

// 可以根据需求调整为其他值
// 例如：保留最近 20 条
const KEEP_AUDIO_COUNT = 20;
```

## 注意事项

1. **浏览器兼容性**
   - 需要支持 IndexedDB 和 Blob 存储
   - 现代浏览器（Chrome、Firefox、Edge、Safari）均支持

2. **存储限制**
   - 浏览器通常限制 IndexedDB 存储在 50MB-1GB 之间
   - 保留10条音频（约50MB）在安全范围内

3. **数据持久性**
   - 数据存储在浏览器本地
   - 清除浏览器数据会删除所有历史记录
   - 建议重要内容及时导出

4. **性能考虑**
   - 清理操作异步执行，不阻塞主流程
   - 即使清理失败，也不影响新记录的创建

## 未来扩展

可能的增强功能：

1. **云端存储集成**
   - 支持上传到 Supabase Storage
   - 长期保存重要音频

2. **用户自定义**
   - 允许用户选择保留数量
   - 手动标记重要音频永久保留

3. **智能清理**
   - 根据使用频率决定保留策略
   - 自动压缩旧音频文件

## 测试

运行测试验证功能：

```bash
cd apps/web
pnpm test src/lib/storage/__tests__/audio-blob-cleanup.test.ts
```

## 相关文件

- `apps/web/src/types/audio-history.ts` - 类型定义
- `apps/web/src/lib/storage/indexeddb-storage.ts` - 存储实现
- `apps/web/src/lib/services/audio-history-service.ts` - 业务逻辑
- `apps/web/src/components/voice/upload-audio.tsx` - UI 组件
- `apps/web/src/components/voice/transcription-result.tsx` - 结果展示

## 更新日志

### 2026-02-03

- ✅ 实现音频 Blob 存储
- ✅ 实现自动清理机制（保留最近10条）
- ✅ 更新历史记录恢复逻辑
- ✅ 添加测试用例
- ✅ 更新文档
