/**
 * Services Layer Exports
 *
 * This file exports all service-related functionality for the audio history system.
 */

export { AudioHistoryService, createAudioHistoryService } from './audio-history-service';

// Re-export types for convenience
export type {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  ProcessingStatus,
  AudioHistoryServiceConfig,
} from '../../types/audio-history';
