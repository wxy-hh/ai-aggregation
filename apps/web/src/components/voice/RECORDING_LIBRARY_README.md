# RecordingLibrary Component Documentation

## Overview

The `RecordingLibrary` component displays and manages the history of uploaded audio files. It provides a comprehensive interface for viewing, searching, filtering, editing, and deleting audio history records.

## Features

### 1. History Record Display

The component displays a list of all uploaded audio files with the following information for each record:

- **File Name**: Original name of the uploaded audio file
- **Upload Time**: Timestamp when the file was uploaded
- **File Size**: Size of the audio file in human-readable format (KB, MB)
- **Processing Status**: Current status of the audio processing
  - `uploading`: File is being uploaded
  - `transcribing`: Audio is being transcribed
  - `translating`: Transcription is being translated
  - `completed`: All processing is complete
  - `error`: An error occurred during processing
- **Custom Title**: User-defined title for the recording (editable)
- **Tags**: User-defined tags for organization (editable)
- **Transcription Text**: The transcribed text from the audio (if available)
- **Translation Text**: The translated text (if available)

### 2. Search and Filter Functionality

#### Search by Keyword

Users can search through their audio history using the search input box. The search matches against:

- File names
- Custom titles
- Transcription text content
- Tags

The search is **case-insensitive** and updates in real-time as the user types (with debouncing for performance).

#### Filter by Date Range

Users can filter records by selecting a date range:

```typescript
// Example: Filter records from the last 7 days
const startDate = new Date();
startDate.setDate(startDate.getDate() - 7);
const endDate = new Date();

setFilter({ dateRange: { start: startDate, end: endDate } });
```

#### Filter by Tags

Users can filter records by selecting one or more tags. Records matching any of the selected tags will be displayed.

#### Filter by Status

Users can filter records by their processing status to quickly find:

- Completed recordings
- Recordings with errors
- Recordings still being processed

### 3. Edit Functionality

Users can edit the following fields for each history record:

#### Edit Title

- Click the edit button on a history record
- Modify the title in the edit dialog
- Title should be descriptive and meaningful
- **Validation**: Title length should not exceed 100 characters (recommended)

#### Manage Tags

- Add new tags by typing and pressing Enter
- Remove tags by clicking the X button on each tag
- Tags help organize and categorize recordings
- Tags are searchable and filterable

**Example Tags:**

- `meeting`
- `interview`
- `personal-memo`
- `important`
- `work`
- `project-alpha`

### 4. Delete Functionality

#### Single Delete

1. Click the delete button on a history record
2. A confirmation dialog will appear
3. Confirm the deletion to permanently remove the record
4. The record will be removed from the list immediately

#### Batch Delete

1. Select multiple records using checkboxes
2. Click the "Delete Selected" button
3. Confirm the batch deletion in the dialog
4. All selected records will be permanently removed

**Warning**: Deletion is permanent and cannot be undone. Make sure you want to delete the records before confirming.

### 5. History Record Click Restore

Clicking on a history record will restore the previous transcription/translation results:

1. Click on any history record in the list
2. The system will load the stored transcription and translation
3. The results will be displayed in the main view
4. You can review the previous results without re-uploading the file

**Note**: The original audio file is not stored, so you cannot replay the audio from history. Only the transcription and translation results are preserved.

## Usage Example

```typescript
import { RecordingLibrary } from '@/components/voice/recording-library';

function VoicePage() {
  const handleHistoryItemClick = (item: AudioHistoryItem) => {
    // Restore the transcription/translation results
    console.log('Restoring item:', item);
    // Update your state to display the results
  };

  return (
    <div className="flex">
      <main className="flex-1">
        {/* Main content area */}
      </main>

      <aside className="w-80">
        <RecordingLibrary onItemClick={handleHistoryItemClick} />
      </aside>
    </div>
  );
}
```

## Component Props

```typescript
interface RecordingLibraryProps {
  onItemClick?: (item: AudioHistoryItem) => void;
  className?: string;
}
```

### Props Description

- **onItemClick** (optional): Callback function called when a history item is clicked. Receives the full history item object.
- **className** (optional): Additional CSS classes to apply to the component container.

## State Management

The component uses Zustand for state management through the `useAudioHistoryStore` hook:

```typescript
const {
  items, // Array of history items
  isLoading, // Loading state
  error, // Error message if any
  filter, // Current filter settings
  selectedIds, // IDs of selected items
  loadItems, // Function to load items
  updateItem, // Function to update an item
  deleteItem, // Function to delete an item
  deleteSelectedItems, // Function to delete multiple items
  setFilter, // Function to set filter
  toggleSelection, // Function to toggle item selection
  clearSelection, // Function to clear all selections
} = useAudioHistoryStore();
```

## Performance Optimizations

### Virtual Scrolling

For large numbers of history records (1000+), the component implements virtual scrolling using `react-window`:

- Only visible items are rendered
- Smooth scrolling performance
- Minimal memory footprint

### Search Debouncing

Search input is debounced with a 300ms delay to avoid excessive filtering operations:

```typescript
const debouncedSearch = useDebouncedValue(searchQuery, 300);
```

### Optimistic Updates

When editing or deleting items, the UI updates immediately (optimistically) before the storage operation completes, providing a snappy user experience.

## Empty States

The component handles various empty states gracefully:

### No History Records

When there are no history records at all:

```
📝 暂无历史记录
开始上传音频文件以创建历史记录
```

### No Search Results

When a search returns no results:

```
🔍 未找到匹配记录
尝试使用不同的搜索关键词
```

### No Filter Results

When filters return no results:

```
🔍 没有符合条件的记录
尝试调整筛选条件
```

## Error Handling

The component displays user-friendly error messages when operations fail:

- **Load Error**: "加载历史记录失败，请刷新页面重试"
- **Update Error**: "更新历史记录失败，请重试"
- **Delete Error**: "删除历史记录失败，请重试"
- **Storage Error**: "浏览器存储不可用，历史记录功能暂时无法使用"

Errors are displayed as toast notifications and do not block the UI.

## Accessibility

The component follows accessibility best practices:

- Semantic HTML elements
- ARIA labels for interactive elements
- Keyboard navigation support
- Focus management in dialogs
- Screen reader friendly

## Browser Compatibility

The component requires:

- Modern browser with IndexedDB support
- JavaScript enabled
- Minimum 100MB available storage space (recommended)

**Supported Browsers:**

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Storage Management

### Storage Limits

- IndexedDB typically allows 50MB - 1GB+ depending on browser and available disk space
- The component monitors storage usage and warns when approaching limits

### Clearing Old Records

To free up storage space:

1. Use the search/filter to find old records
2. Select multiple old records
3. Use batch delete to remove them

### Storage Information

Check storage usage in the browser DevTools:

- Chrome: DevTools → Application → Storage
- Firefox: DevTools → Storage → IndexedDB

## Troubleshooting

### History Records Not Loading

**Problem**: The history list is empty even though you've uploaded files.

**Solutions**:

1. Check browser console for errors
2. Verify IndexedDB is enabled in browser settings
3. Clear browser cache and reload
4. Check if storage quota is exceeded

### Search Not Working

**Problem**: Search doesn't return expected results.

**Solutions**:

1. Ensure you're searching for exact text from the transcription
2. Try different keywords
3. Check if filters are applied that might exclude results
4. Clear all filters and try again

### Cannot Delete Records

**Problem**: Delete operation fails or records reappear.

**Solutions**:

1. Check browser console for errors
2. Ensure you have sufficient permissions
3. Try closing other tabs using the same site
4. Clear browser cache and try again

### Performance Issues

**Problem**: The component is slow with many records.

**Solutions**:

1. Delete old unnecessary records
2. Use filters to reduce displayed items
3. Ensure virtual scrolling is working (check console)
4. Close other browser tabs to free memory

## Best Practices

### Organizing Records

1. **Use Descriptive Titles**: Change default titles to something meaningful
2. **Tag Consistently**: Use a consistent tagging system (e.g., `meeting-2024-01`, `interview-john`)
3. **Regular Cleanup**: Delete old records you no longer need
4. **Search Before Upload**: Check if you've already uploaded similar content

### Performance Tips

1. **Limit Visible Records**: Use filters to show only relevant records
2. **Batch Operations**: Delete multiple records at once instead of one by one
3. **Regular Maintenance**: Clean up old records monthly
4. **Monitor Storage**: Keep an eye on storage usage

### Data Management

1. **Backup Important Records**: Copy important transcriptions to external storage
2. **Don't Rely Solely on History**: History is for convenience, not long-term storage
3. **Export Important Data**: Copy transcriptions to documents for permanent storage

## Related Components

- **UploadAudio**: Component for uploading and processing audio files
- **HistoryEditDialog**: Dialog for editing history record details
- **HistoryDeleteDialog**: Confirmation dialog for deleting records
- **TranscriptionResult**: Component for displaying transcription results

## API Reference

See the [Audio History Service Documentation](../../lib/services/AUDIO_HISTORY_SERVICE_README.md) for details on the underlying service layer.

## Change Log

### Version 1.0.0 (Current)

- Initial release with full CRUD functionality
- Search and filter capabilities
- Virtual scrolling for performance
- Batch operations support
- Integration with UploadAudio component
