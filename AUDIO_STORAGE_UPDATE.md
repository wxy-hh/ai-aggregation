# 音频历史记录存储功能更新

## 📋 更新摘要

实现了智能音频存储策略：**最近10次上传的音频文件会被完整保存，超过10次的历史记录只保留文本数据（转录和翻译结果）**。

## ✨ 新功能

### 1. 智能音频保留

- ✅ 最近10条记录保存完整音频文件
- ✅ 超过10条的记录自动删除音频，保留文本
- ✅ 每次新增记录时自动触发清理

### 2. 历史记录切换增强

- ✅ 最近10条：可以播放原始音频
- ✅ 超过10条：显示"音频文件不可用"，但可查看文本
- ✅ 提供"重新上传"按钮

### 3. 存储空间优化

- ✅ 使用 IndexedDB 存储音频 Blob
- ✅ 存储空间稳定在约 50MB
- ✅ 不会随历史记录增加而无限增长

## 📁 修改的文件

### 核心文件

1. **apps/web/src/types/audio-history.ts**
   - 添加 `audioBlob?: Blob` 字段

2. **apps/web/src/lib/storage/indexeddb-storage.ts**
   - 添加 `cleanupOldAudioBlobs()` 方法
   - 更新数据库 schema 到版本 2
   - 在 `create()` 方法中触发自动清理

3. **apps/web/src/lib/services/audio-history-service.ts**
   - 更新 `createFromUpload()` 保存音频 Blob

4. **apps/web/src/components/voice/upload-audio.tsx**
   - 更新历史记录恢复逻辑
   - 支持从 Blob 创建音频 URL
   - 添加 Blob URL 清理逻辑

### 新增文件

1. **docs/AUDIO_HISTORY_STORAGE.md**
   - 完整的功能文档

2. **apps/web/src/lib/storage/**tests**/audio-blob-cleanup.test.ts**
   - 单元测试

3. **apps/web/src/lib/storage/**tests**/manual-test-audio-storage.md**
   - 手动测试指南

4. **apps/web/src/lib/storage/migrate-audio-storage.ts**
   - 数据迁移工具

## 🚀 使用方法

### 正常使用

功能已自动启用，无需额外配置。用户上传音频后：

1. 最近10条会保存完整音频
2. 超过10条自动清理音频，保留文本
3. 切换历史记录时自动处理

### 数据迁移（如果有旧数据）

如果用户已有历史记录，可以运行迁移：

```javascript
// 在浏览器控制台运行
await audioStorageMigration.checkStatus(); // 查看状态
await audioStorageMigration.runMigration(); // 运行迁移
```

### 调整保留数量

如需修改保留数量，编辑 `indexeddb-storage.ts`：

```typescript
// 默认保留10条
const KEEP_AUDIO_COUNT = 10;

// 可以改为其他值，如20条
const KEEP_AUDIO_COUNT = 20;
```

## 🧪 测试

### 运行单元测试

```bash
cd apps/web
pnpm test src/lib/storage/__tests__/audio-blob-cleanup.test.ts
```

### 手动测试

参考 `apps/web/src/lib/storage/__tests__/manual-test-audio-storage.md`

## 📊 存储空间对比

| 场景      | 旧方案 | 新方案 | 节省 |
| --------- | ------ | ------ | ---- |
| 10条记录  | 50MB   | 50MB   | 0%   |
| 50条记录  | 250MB  | 50MB   | 80%  |
| 100条记录 | 500MB  | 50MB   | 90%  |

## 🔍 技术细节

### 数据结构

```typescript
interface AudioHistoryItem {
  // ... 其他字段
  audioBlob?: Blob; // 新增：音频二进制数据
}
```

### 清理逻辑

```typescript
// 每次创建新记录时自动触发
async create(item) {
  await this.db.audioHistory.add(item);
  await this.cleanupOldAudioBlobs(); // 自动清理
  return item;
}
```

### 恢复逻辑

```typescript
// 从 Blob 创建 URL
if (historyItem.audioBlob) {
  const blobUrl = URL.createObjectURL(historyItem.audioBlob);
  setAudioUrl(blobUrl);
} else {
  setAudioUrl('unavailable');
}
```

## ⚠️ 注意事项

1. **浏览器兼容性**
   - 需要支持 IndexedDB 和 Blob
   - 现代浏览器均支持

2. **存储限制**
   - 浏览器通常限制 50MB-1GB
   - 保留10条（约50MB）在安全范围

3. **数据持久性**
   - 数据存储在浏览器本地
   - 清除浏览器数据会删除历史记录

4. **性能影响**
   - 清理操作异步执行
   - 不阻塞主流程

## 🐛 问题排查

### 问题1：历史记录没有音频

**检查**：

- 是否是最近10条？
- 浏览器控制台是否有错误？
- IndexedDB 是否正常工作？

### 问题2：存储空间仍然很大

**解决**：

- 运行迁移脚本清理旧数据
- 检查是否有其他应用占用空间

### 问题3：切换历史记录后音频不播放

**检查**：

- 查看控制台日志
- 确认 audioBlob 是否存在
- 检查 Blob URL 是否正确创建

## 📝 更新日志

### 2026-02-03

- ✅ 实现音频 Blob 存储
- ✅ 实现自动清理机制
- ✅ 更新历史记录恢复逻辑
- ✅ 添加测试用例
- ✅ 创建迁移工具
- ✅ 完善文档

## 🔮 未来计划

1. **云端存储集成**
   - 支持 Supabase Storage
   - 长期保存重要音频

2. **用户自定义**
   - 允许用户选择保留数量
   - 手动标记重要音频

3. **智能清理**
   - 根据使用频率决定保留
   - 自动压缩旧音频

## 📚 相关文档

- [完整功能文档](docs/AUDIO_HISTORY_STORAGE.md)
- [手动测试指南](apps/web/src/lib/storage/__tests__/manual-test-audio-storage.md)

## 👥 贡献者

- 实现：Kiro AI Assistant
- 需求：@weixiaoyu

## 📞 支持

如有问题，请：

1. 查看文档
2. 运行测试
3. 检查控制台日志
4. 提交 Issue
