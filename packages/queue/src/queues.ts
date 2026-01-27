import { Queue, QueueOptions } from 'bullmq';
import { STTJobData, PPTJobData, ImageJobData } from './jobs';

const defaultQueueOptions: QueueOptions = {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      count: 100,
      age: 24 * 3600,
    },
    removeOnFail: {
      count: 1000,
      age: 7 * 24 * 3600,
    },
  },
};

export const sttQueue = new Queue<STTJobData>('stt', defaultQueueOptions);
export const pptQueue = new Queue<PPTJobData>('ppt', defaultQueueOptions);
export const imageQueue = new Queue<ImageJobData>('image', defaultQueueOptions);
