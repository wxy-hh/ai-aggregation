import { Worker } from 'bullmq';
import { resolveBullMQConnectionOptions } from '@repo/shared/server';
import type { QimenSectionJobData } from '@repo/queue';
import { processQimenSectionJob } from './qimen-section-processor';

export const qimenSectionWorker = new Worker<QimenSectionJobData>(
  'qimen-section',
  async (job) => processQimenSectionJob(job.data),
  {
    autorun: false,
    connection: resolveBullMQConnectionOptions(process.env),
    concurrency: 3,
  }
);
