/**
 * Services Layer Exports
 *
 * This file exports all service-related functionality for the audio history system.
 */

export { AudioHistoryService, createAudioHistoryService } from './audio-history-service';

// voice 记录统一写路径：同时写 audio 详情与统一历史摘要
export {
  createVoiceHistoryRecord,
  updateVoiceHistoryItem,
  updateVoiceProcessingStatus,
  deleteVoiceHistoryRecord,
  deleteVoiceHistoryRecords,
  clearVoiceHistory,
  formatVoiceDuration,
} from './voice-history-service';

// Re-export types for convenience
export type {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  ProcessingStatus,
  AudioHistoryServiceConfig,
} from '../../types/audio-history';
