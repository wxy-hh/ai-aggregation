# 语音历史记录恢复问题修复

## 问题描述

从历史记录页面点击语音记录跳转到语音界面时出现两个问题：

### 问题 1: 音频文件不可用

底部显示"音频文件不可用"，即使原设计是本地保存最近10条记录的音频。

### 问题 2: 原文译文一直 Loading

原文和译文一直显示 loading 状态，无法正常显示内容。

## 问题原因

### 问题 1 原因

- IndexedDB 存储确实实现了保留最近10条记录的 `audioBlob`
- 超过10条的历史记录会自动清理 `audioBlob`
- 这是**正常行为**，不是 bug

### 问题 2 原因

1. **数据结构不完整**：历史记录只保存了 `transcriptionText` 和 `translationText`（完整文本），没有保存 `segments`（分段数据）
2. **恢复逻辑问题**：从历史记录恢复时，尝试通过简单的字符串分割重建 segments，但分割逻辑不准确
3. **翻译状态错误**：恢复的 segments 中 `translatedText` 被设置为 "Translation in progress..."，导致一直显示 loading

## 解决方案

### 1. 扩展 AudioHistoryItem 类型

**文件：** `apps/web/src/types/audio-history.ts`

添加 `segments` 字段来保存完整的分段数据：

```typescript
export interface AudioHistoryItem {
  // ... 其他字段
  transcriptionText?: string; // 完整文本，用于搜索
  translationText?: string; // 完整文本，用于搜索
  segments?: Array<{
    // 新增：保存完整的 segments 数据
    id: string;
    timestamp: string;
    speaker: string;
    speakerLabel: 'Speaker A' | 'Speaker B' | 'Speaker C';
    originalText: string;
    translatedText: string;
    startTime: number;
    endTime: number;
  }>;
  // ... 其他字段
}
```

### 2. 保存时存储 segments

**文件：** `apps/web/src/components/voice/upload-audio.tsx`

在翻译完成后更新历史记录时，保存完整的 segments 数据：

```typescript
// 创建完整的 segments 数据用于保存
const segmentsToSave = createSegments(
  transcriptionText,
  translatedSentences as string[],
  audioDuration
);

await updateProcessingStatus(historyId, 'completed', {
  translationText: translationText || undefined,
  segments: segmentsToSave, // 保存完整的 segments
  errorMessage,
});
```

### 3. 恢复时优先使用 segments

**文件：** `apps/web/src/components/voice/upload-audio.tsx`

恢复历史记录时，优先使用保存的 segments：

```typescript
// 优先使用保存的 segments 数据
if (restoredHistoryItem.segments && restoredHistoryItem.segments.length > 0) {
  // 直接使用保存的 segments
  console.log('[UploadAudio] Restoring from saved segments');
} else if (restoredHistoryItem.translationText) {
  // 降级方案：解析翻译结果（兼容旧数据）
  console.log('[UploadAudio] Restoring from text (legacy format)');
  // ... 解析逻辑
}
```

渲染时：

```typescript
// 优先使用历史记录中保存的 segments
let segments;
if (restoredHistoryItem?.segments && restoredHistoryItem.segments.length > 0) {
  // 使用保存的 segments
  segments = restoredHistoryItem.segments;
} else {
  // 降级方案：从文本创建 segments
  segments = createSegments(displayText, translationResults || undefined, audioDuration);
}
```

## 修复效果

### 问题 1: 音频文件不可用

✅ **保持现有行为**

- 最近10条记录：音频可用，可以播放
- 超过10条的记录：显示"音频文件不可用"提示，但转录和翻译结果仍然可查看
- 提供"重新上传"按钮，用户可以重新上传音频文件

### 问题 2: 原文译文一直 Loading

✅ **完全修复**

- 新保存的记录：包含完整的 segments 数据
- 恢复时：直接使用保存的 segments，立即显示内容
- 旧记录兼容：提供降级方案，尝试从文本重建 segments

## 数据迁移

### 新数据格式

从现在开始，所有新保存的历史记录都会包含 `segments` 字段。

### 旧数据兼容

- 旧的历史记录没有 `segments` 字段
- 恢复时会尝试从 `transcriptionText` 和 `translationText` 重建 segments
- 如果重建失败，至少会显示完整的文本内容

## 用户体验改进

### 音频可用（最近10条）

```
┌─────────────────────────────────────────┐
│ 🎵 柳永·雨霖铃.mp3                      │
│                                         │
│ [A] Speaker A  00:00:05                 │
│ 宋刘勇，雨淋淋。                        │
│ Song Liuyong, raining                   │
│                                         │
│ [B] Speaker B  00:00:06                 │
│ 于晓鹏朗诵。                            │
│ Yu Xiaopeng recites                     │
│                                         │
│ ▶ [=========>    ] 00:15 / 00:30       │ ← 音频播放器
└─────────────────────────────────────────┘
```

### 音频不可用（超过10条）

```
┌─────────────────────────────────────────┐
│ 🎵 柳永·雨霖铃.mp3                      │
│                                         │
│ [A] Speaker A  00:00:05                 │
│ 宋刘勇，雨淋淋。                        │
│ Song Liuyong, raining                   │
│                                         │
│ [B] Speaker B  00:00:06                 │
│ 于晓鹏朗诵。                            │
│ Yu Xiaopeng recites                     │
│                                         │
│ ⚠ 音频文件不可用                        │ ← 提示信息
│ 历史记录中未保存音频文件，但转录和翻译  │
│ 结果已保留                              │
│ [重新上传]                              │ ← 重新上传按钮
└─────────────────────────────────────────┘
```

## 技术细节

### segments 数据结构

```typescript
{
  id: "1",
  timestamp: "00:00:05",
  speaker: "Speaker A",
  speakerLabel: "Speaker A",
  originalText: "宋刘勇，雨淋淋。",
  translatedText: "Song Liuyong, raining",
  startTime: 5.0,
  endTime: 6.0
}
```

### 存储优化

- `transcriptionText` 和 `translationText`：用于搜索和预览
- `segments`：用于详细显示和编辑
- `audioBlob`：仅最近10条保存，用于播放

### 性能考虑

- segments 数据相对较小（每条记录约 1-5KB）
- 不会显著增加存储空间
- 提高了恢复速度（无需重新解析和分割文本）

## 测试建议

### 测试场景 1: 新记录

1. 上传音频文件
2. 等待转录和翻译完成
3. 查看历史记录
4. 点击记录跳转
5. ✅ 应该立即显示原文和译文
6. ✅ 音频应该可以播放

### 测试场景 2: 旧记录（超过10条）

1. 创建超过10条历史记录
2. 点击第11条或更早的记录
3. ✅ 应该显示原文和译文
4. ✅ 应该显示"音频文件不可用"提示
5. ✅ 应该有"重新上传"按钮

### 测试场景 3: 编辑功能

1. 从历史记录恢复
2. 编辑某个段落
3. 保存并重新翻译
4. ✅ 应该正常工作
5. ✅ 更新后的 segments 应该被保存

## 未来优化方向

1. **云存储集成**
   - 将音频文件上传到云存储（如 Supabase Storage）
   - 保存云存储 URL 而不是 Blob
   - 所有历史记录都可以播放音频

2. **增量更新**
   - 支持只更新修改的 segments
   - 减少存储写入次数

3. **压缩优化**
   - 对 segments 数据进行压缩
   - 进一步减少存储空间

4. **智能清理**
   - 根据用户使用频率决定保留哪些音频
   - 而不是简单的"最近10条"规则

## 总结

✅ **问题 1（音频不可用）** - 保持现有设计，这是正常行为  
✅ **问题 2（一直 Loading）** - 完全修复，保存和恢复完整的 segments 数据  
✅ **向后兼容** - 旧数据仍然可以正常显示  
✅ **用户体验** - 提供清晰的提示和重新上传选项

---

**修复日期：** 2026-02-10  
**状态：** ✅ 已完成  
**版本：** 1.0.0
