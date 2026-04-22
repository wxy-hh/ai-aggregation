import { Queue, QueueOptions } from 'bullmq';
import { resolveRedisConnectionOptions } from '@repo/shared';
import {
  STTJobData,
  PPTJobData,
  ImageJobData,
  QimenBaseJobData,
  QimenSectionJobData,
} from './jobs';

const defaultQueueOptions: QueueOptions = {
  connection: resolveRedisConnectionOptions(process.env),
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
export const qimenBaseQueue = new Queue<QimenBaseJobData>('qimen-base', defaultQueueOptions);
export const qimenSectionQueue = new Queue<QimenSectionJobData>('qimen-section', defaultQueueOptions);
