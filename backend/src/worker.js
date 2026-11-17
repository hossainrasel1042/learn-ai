

import 'dotenv/config';
import { logger } from './utils/logger.js';
import { ensureMinioBuckets } from './storage_minio/client.js';
import { startUploadWorker, stopUploadWorker } from './queue/bullmq.js';
import { closeDb } from './config/database.js';

const T0 = Date.now();
const boot = (m) => process.stderr.write(`[worker +${Date.now() - T0}ms] ${m}\n`);

boot('worker booting');

(async () => {
  await ensureMinioBuckets();
  boot('minio buckets ensured');
  startUploadWorker();
  boot('worker started');
})().catch((e) => {
  logger.error(`worker failed to start: ${e?.message || e}`);
  process.exit(1);
});

const shutdown = async (sig) => {
  logger.info(`worker received ${sig}, shutting down`);
  await stopUploadWorker();
  await closeDb();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));