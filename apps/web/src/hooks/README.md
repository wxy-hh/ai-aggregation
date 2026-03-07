# Hooks 使用文档

## useAutoSave

自动保存 Hook，用于监听数据变化并自动触发保存操作。

### 功能特性

- ✅ **2 秒防抖**：用户停止编辑 2 秒后自动保存
- ✅ **数据变化检测**：仅在数据实际变化时触发保存
- ✅ **保存状态管理**：自动更新保存状态（idle/saving/saved/error）
- ✅ **失败重试**：保存失败时自动重试（默认最多 3 次）
- ✅ **手动保存**：支持手动触发保存操作

### 基本用法

```tsx
import { useAutoSave } from '@/hooks/use-auto-save';

function MyComponent() {
  // 启用自动保存（使用默认配置）
  useAutoSave();

  return <div>我的组件</div>;
}
```

### 自定义配置

```tsx
import { useAutoSave } from '@/hooks/use-auto-save';

function MyComponent() {
  // 自定义配置
  const { triggerSave } = useAutoSave({
    debounceMs: 3000, // 防抖时间：3 秒
    maxRetries: 5, // 最大重试次数：5 次
    retryDelayMs: 2000, // 重试延迟：2 秒
  });

  // 手动触发保存
  const handleSave = () => {
    triggerSave();
  };

  return (
    <div>
      <button onClick={handleSave}>立即保存</button>
    </div>
  );
}
```

### 配置选项

| 参数           | 类型     | 默认值 | 说明                     |
| -------------- | -------- | ------ | ------------------------ |
| `debounceMs`   | `number` | `2000` | 防抖延迟时间（毫秒）     |
| `maxRetries`   | `number` | `3`    | 保存失败时的最大重试次数 |
| `retryDelayMs` | `number` | `1000` | 重试延迟时间（毫秒）     |

### 返回值

| 属性          | 类型         | 说明               |
| ------------- | ------------ | ------------------ |
| `triggerSave` | `() => void` | 手动触发保存的函数 |

### 配合保存状态指示器使用

```tsx
import { useAutoSave } from '@/hooks/use-auto-save';
import { SaveStatusIndicator } from '@/components/save-status-indicator';
import { useResumeEditorStore } from '@/stores/resume-editor-store';

function MyComponent() {
  // 启用自动保存
  useAutoSave();

  // 获取保存状态
  const saveStatus = useResumeEditorStore((state) => state.saveStatus);
  const lastSavedAt = useResumeEditorStore((state) => state.lastSavedAt);

  return (
    <div>
      {/* 显示保存状态 */}
      <SaveStatusIndicator
        status={saveStatus}
        lastSavedAt={lastSavedAt ? new Date(lastSavedAt) : undefined}
        errorMessage={saveStatus === 'error' ? '保存失败，请检查网络连接' : undefined}
      />

      {/* 你的内容 */}
    </div>
  );
}
```

### 工作原理

1. **监听数据变化**：Hook 订阅 Zustand store 中的 `doc` 字段
2. **变化检测**：通过 JSON 序列化比较，检测数据是否真的发生了变化
3. **防抖处理**：使用 `setTimeout` 实现防抖，避免频繁保存
4. **执行保存**：调用保存函数，更新保存状态
5. **错误处理**：保存失败时自动重试，重试次数用尽后显示错误状态

### 注意事项

1. **首次加载**：首次加载时不会触发保存，只保存数据快照
2. **防抖重置**：连续修改会重置防抖计时器
3. **状态自动重置**：保存成功 3 秒后，状态自动从 `saved` 重置为 `idle`
4. **重试机制**：每次重试之间有延迟，避免频繁请求

### 对应需求

- **需求 11.1**：用户修改内容后 2 秒自动保存
- **需求 11.3**：显示保存状态指示器
- **需求 11.4**：保存失败时显示错误提示
- **需求 11.8**：仅在数据变化时触发保存
