/**
 * Types Index
 *
 * This file exports all TypeScript types used throughout the application.
 */

// Voice transcription types
export type {
  VoiceTranscription,
  TranscribeRequest,
  TranscribeResponse,
  TranscriptionsResponse,
  FetchTranscriptionsParams,
} from './voice';

// Audio history types
export type {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  StorageAdapter,
  StorageInfo,
  ProcessingStatus,
  ErrorRecoveryStrategy,
  AudioHistoryServiceConfig,
} from './audio-history';

export { isProcessingStatus, isAudioHistoryItem } from './audio-history';
