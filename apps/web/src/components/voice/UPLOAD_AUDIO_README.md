# UploadAudio Component Documentation

## Overview

The `UploadAudio` component provides a user interface for uploading audio files, transcribing them using the SiliconFlow API, and optionally translating the transcription results. It integrates seamlessly with the audio history system to automatically save processing results.

## Features

### 1. Audio File Upload

- **Drag and Drop**: Drag audio files directly onto the upload area
- **File Browser**: Click to open file browser and select audio files
- **Supported Formats**: MP3, WAV, M4A, OGG, FLAC, AAC
- **File Size Limit**: Maximum 25MB per file (configurable)
- **Validation**: Automatic validation of file type and size

### 2. Audio Transcription

The component uses the SiliconFlow API to transcribe audio files:

- **Automatic Processing**: Transcription starts immediately after upload
- **Progress Indication**: Real-time progress updates during transcription
- **Error Handling**: Graceful error handling with retry options
- **Result Display**: Transcription results displayed with timestamps

### 3. Translation (Optional)

After transcription, users can optionally translate the text:

- **Language Selection**: Choose target language for translation
- **Sentence-by-Sentence**: Translation processes each sentence individually
- **Progressive Display**: Translation results appear progressively as they complete
- **Bilingual Display**: Shows both original and translated text side-by-side

### 4. History Integration

The component automatically integrates with the audio history system:

#### On Upload

When a file is uploaded, the component:

1. Creates a new history record with status `transcribing`
2. Stores file metadata (name, size, type, upload time)
3. Generates a unique ID for tracking

```typescript
const historyItem = await createItem(file, undefined, undefined);
setCurrentHistoryId(historyItem.id);
```

#### On Transcription Complete

When transcription finishes, the component:

1. Updates the history record with transcription text
2. Changes status to `translating` (if translation enabled) or `completed`
3. Stores audio duration if available

```typescript
await updateItem(currentHistoryId, {
  transcriptionText: result.text,
  processingStatus: needsTranslation ? 'translating' : 'completed',
  audioDuration: duration,
});
```

#### On Translation Complete

When translation finishes, the component:

1. Updates the history record with translation text
2. Changes status to `completed`
3. Handles partial translation failures gracefully

```typescript
await updateItem(currentHistoryId, {
  translationText: combinedTranslation,
  processingStatus: 'completed',
});
```

#### On Error

When an error occurs, the component:

1. Updates the history record with error message
2. Changes status to `error`
3. Preserves any partial results (e.g., transcription without translation)

```typescript
await updateItem(currentHistoryId, {
  processingStatus: 'error',
  errorMessage: error.message,
});
```

## Component Props

```typescript
interface UploadAudioProps {
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
  onTranslationComplete?: (translations: TranslationResult[]) => void;
  onError?: (error: Error) => void;
  className?: string;
  maxFileSize?: number; // in bytes, default: 25MB
  enableTranslation?: boolean; // default: true
  targetLanguage?: string; // default: 'zh' (Chinese)
}
```

### Props Description

- **onTranscriptionComplete** (optional): Callback when transcription finishes
- **onTranslationComplete** (optional): Callback when translation finishes
- **onError** (optional): Callback when an error occurs
- **className** (optional): Additional CSS classes
- **maxFileSize** (optional): Maximum file size in bytes (default: 25MB)
- **enableTranslation** (optional): Whether to enable translation (default: true)
- **targetLanguage** (optional): Target language code for translation (default: 'zh')

## Usage Example

### Basic Usage

```typescript
import { UploadAudio } from '@/components/voice/upload-audio';

function VoicePage() {
  const handleTranscriptionComplete = (result) => {
    console.log('Transcription:', result.text);
  };

  const handleTranslationComplete = (translations) => {
    console.log('Translations:', translations);
  };

  const handleError = (error) => {
    console.error('Error:', error);
  };

  return (
    <UploadAudio
      onTranscriptionComplete={handleTranscriptionComplete}
      onTranslationComplete={handleTranslationComplete}
      onError={handleError}
      enableTranslation={true}
      targetLanguage="zh"
    />
  );
}
```

### With Custom File Size Limit

```typescript
<UploadAudio
  maxFileSize={50 * 1024 * 1024} // 50MB
  onError={(error) => {
    if (error.message.includes('File size')) {
      alert('文件太大，请选择小于50MB的文件');
    }
  }}
/>
```

### Without Translation

```typescript
<UploadAudio
  enableTranslation={false}
  onTranscriptionComplete={(result) => {
    // Only transcription, no translation
    console.log('Transcription only:', result.text);
  }}
/>
```

## State Management

The component manages several internal states:

```typescript
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [isUploading, setIsUploading] = useState(false);
const [isTranscribing, setIsTranscribing] = useState(false);
const [isTranslating, setIsTranslating] = useState(false);
const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
const [translationResults, setTranslationResults] = useState<TranslationResult[]>([]);
const [error, setError] = useState<string | null>(null);
const [progress, setProgress] = useState(0);
const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
```

### State Flow

```
Initial State
    ↓
File Selected → selectedFile set
    ↓
Upload Started → isUploading = true, history record created
    ↓
Transcription Started → isTranscribing = true
    ↓
Transcription Complete → transcriptionResult set, history updated
    ↓
Translation Started → isTranslating = true (if enabled)
    ↓
Translation Complete → translationResults set, history updated
    ↓
Final State → All flags false, results displayed
```

## History Integration Details

### Automatic History Creation

The component automatically creates history records without user intervention:

```typescript
// In handleFileSelection function
const historyItem = await createItem(
  file,
  undefined, // transcriptionText - will be updated later
  undefined // translationText - will be updated later
);

// Store the ID for later updates
setCurrentHistoryId(historyItem.id);
```

### Progressive Updates

As processing progresses, the history record is updated:

```typescript
// After transcription
await updateItem(currentHistoryId, {
  transcriptionText: result.text,
  processingStatus: 'translating',
  audioDuration: await getAudioDuration(file),
});

// After translation
await updateItem(currentHistoryId, {
  translationText: mergedTranslations,
  processingStatus: 'completed',
});
```

### Error Handling

Errors are logged but don't block the main workflow:

```typescript
try {
  await createItem(file);
} catch (error) {
  console.error('Failed to create history record:', error);
  // Continue with transcription anyway
}
```

This ensures that even if history recording fails, the user can still use the transcription feature.

## API Integration

### SiliconFlow Transcription API

```typescript
const response = await fetch('/api/voice/transcribe', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
// result.text contains the transcription
```

### Translation API

```typescript
const response = await fetch('/api/voice/translate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: sentence,
    targetLanguage: 'zh',
  }),
});

const result = await response.json();
// result.translation contains the translated text
```

## Error Handling

The component handles various error scenarios:

### File Validation Errors

```typescript
if (file.size > maxFileSize) {
  throw new Error(`文件大小超过限制 (${maxFileSize / 1024 / 1024}MB)`);
}

if (!SUPPORTED_FORMATS.includes(file.type)) {
  throw new Error('不支持的文件格式');
}
```

### Upload Errors

```typescript
try {
  const response = await uploadFile(file);
  if (!response.ok) {
    throw new Error('上传失败，请重试');
  }
} catch (error) {
  setError('网络错误，请检查连接');
  await updateItem(currentHistoryId, {
    processingStatus: 'error',
    errorMessage: error.message,
  });
}
```

### Transcription Errors

```typescript
try {
  const result = await transcribe(file);
} catch (error) {
  setError('转录失败，请重试');
  await updateItem(currentHistoryId, {
    processingStatus: 'error',
    errorMessage: '转录失败',
  });
}
```

### Translation Errors

Translation errors are handled gracefully:

- If some sentences fail, successful translations are still saved
- If all translations fail, the transcription is still preserved
- Error messages are stored in the history record

```typescript
const successfulTranslations = results.filter((r) => r.success);
const failedCount = results.length - successfulTranslations.length;

if (failedCount > 0) {
  console.warn(`${failedCount} translations failed`);
}

// Save successful translations
await updateItem(currentHistoryId, {
  translationText: successfulTranslations.map((r) => r.text).join('\n'),
  processingStatus: 'completed',
  errorMessage: failedCount > 0 ? `${failedCount} 句翻译失败` : undefined,
});
```

## Performance Considerations

### File Size Optimization

Large files take longer to process:

- **< 5MB**: Fast processing (< 30 seconds)
- **5-15MB**: Moderate processing (30-60 seconds)
- **15-25MB**: Slow processing (1-3 minutes)

Consider compressing audio files before upload for better performance.

### Concurrent Processing

The component processes transcription and translation sequentially:

1. Upload file
2. Wait for transcription
3. Start translation (if enabled)

This ensures reliable processing but may take time for large files.

### Memory Management

The component properly cleans up resources:

```typescript
useEffect(() => {
  return () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  };
}, [audioUrl]);
```

## Accessibility

The component follows accessibility best practices:

- **Keyboard Navigation**: Full keyboard support for file selection
- **Screen Readers**: ARIA labels for all interactive elements
- **Focus Management**: Proper focus handling during upload
- **Error Announcements**: Errors are announced to screen readers

## Browser Compatibility

The component requires:

- Modern browser with File API support
- Fetch API support
- FormData support
- Blob/File support

**Supported Browsers:**

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Troubleshooting

### Upload Fails Immediately

**Problem**: File upload fails right after selection.

**Solutions**:

1. Check file size (must be < 25MB by default)
2. Verify file format is supported
3. Check network connection
4. Try a different file

### Transcription Takes Too Long

**Problem**: Transcription seems stuck or takes very long.

**Solutions**:

1. Check file size (larger files take longer)
2. Verify network connection is stable
3. Check browser console for errors
4. Try refreshing and uploading again

### Translation Fails

**Problem**: Transcription works but translation fails.

**Solutions**:

1. Check if translation API is available
2. Verify target language is supported
3. Check network connection
4. Try transcription-only mode

### History Not Saving

**Problem**: Results display but don't appear in history.

**Solutions**:

1. Check browser console for storage errors
2. Verify IndexedDB is enabled
3. Check storage quota
4. Try clearing old history records

## Best Practices

### File Preparation

1. **Compress Audio**: Use compressed formats (MP3, AAC) for faster upload
2. **Trim Silence**: Remove silence at beginning/end to reduce file size
3. **Optimize Quality**: Use appropriate bitrate (128kbps is usually sufficient)

### Usage Tips

1. **Check History First**: Before re-uploading, check if you've already processed the file
2. **Wait for Completion**: Don't navigate away during processing
3. **Save Important Results**: Copy important transcriptions to external storage
4. **Monitor Progress**: Watch progress indicators to estimate completion time

### Error Recovery

1. **Retry on Failure**: Most errors are transient, retry usually works
2. **Check Network**: Ensure stable internet connection
3. **Reduce File Size**: If upload fails, try a smaller file
4. **Contact Support**: If errors persist, report the issue

## Related Components

- **RecordingLibrary**: Displays history of uploaded files
- **TranscriptionResult**: Displays transcription results
- **TranscriptList**: Lists transcription sentences
- **Waveform**: Visualizes audio waveform

## API Reference

See the [Audio History Service Documentation](../../lib/services/AUDIO_HISTORY_SERVICE_README.md) for details on history integration.

## Change Log

### Version 1.0.0 (Current)

- Initial release with transcription support
- Translation integration
- Automatic history recording
- Error handling and retry logic
- Progress indication
- File validation
