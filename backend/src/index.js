

import 'dotenv/config';





const BOOT_T0 = Date.now();
const boot = (msg) => process.stderr.write(`[boot +${Date.now() - BOOT_T0}ms] ${msg}\n`);

boot('dotenv loaded');

import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';



import './config/jsonbParser.js';
boot('jsonbParser imported');

import { settings, initDb, closeDb, checkDbConnection, getDb } from './config/index.js';
import { logger } from './utils/logger.js';
import { authMiddleware } from './middlewares/auth.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { requestLogger } from './middlewares/requestLogger.js';
boot('core modules imported');






const { default: apiTestRouter } = await import('./api/test.js');
boot('  api/test.js');
const { default: authRouter } = await import('./auth/router.js');
boot('  auth/router.js');
const { default: storageRouter } = await import('./storage/router.js');
boot('  storage/router.js');
const { default: usersRouter } = await import('./users/router.js');
boot('  users/router.js');
const { default: cmsRouter } = await import('./cms_agent/router.js');
boot('  cms_agent/router.js');
const { default: chatRouter } = await import('./chat-agent/router.js');
boot('  chat-agent/router.js');
const { default: communityRouter } = await import('./community_agent/router.js');
boot('  community_agent/router.js');
const { default: srsRouter } = await import('./srs_agent/router.js');
boot('  srs_agent/router.js');
const { default: quizRouter } = await import('./quiz_agent/router.js');
boot('  quiz_agent/router.js');
const { default: mindmapRouter } = await import('./mindmap_agent/router.js');
boot('  mindmap_agent/router.js');
const { default: gamificationRouter } = await import('./gamification_agent/router.js');
boot('  gamification_agent/router.js');
const { default: adminRouter } = await import('./admin_agent/router.js');
boot('  admin_agent/router.js');
const { default: quizBattleRouter, attachIo: attachQuizBattleIo } = await import('./quiz_battle_agent/router.js');
boot('  quiz_battle_agent/router.js');
const { createSocketServer } = await import('./realtime/server.js');
boot('  realtime/server.js');



const { default: storageMinioRouter } = await import('./storage_minio/router.js');
boot('  storage_minio/router.js');



const { default: courseCodeRouter } = await import('./cms_agent/course_code_routes.js');
boot('  cms_agent/course_code_routes.js');
const { startUploadWorker, stopUploadWorker } = await import('./queue/bullmq.js');
boot('  queue/bullmq.js');
const { ensureMinioBuckets } = await import('./storage_minio/client.js');
boot('  storage_minio/client.js');

boot('all routers imported');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();


app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: settings.CORS_ORIGINS,
    credentials: settings.CORS_CREDENTIALS,
    methods: settings.CORS_METHODS,





    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cookie',
    ],
  })
);
app.use(compression());
app.use(express.json({ limit: settings.MAX_UPLOAD_SIZE }));
app.use(express.urlencoded({ extended: true, limit: settings.MAX_UPLOAD_SIZE }));



app.use(cookieParser());


app.use(requestLogger);




app.use(getDb);
















app.use(settings.API_PREFIX, apiTestRouter);
app.use(settings.API_PREFIX, authRouter);
app.use(settings.API_PREFIX, usersRouter);








app.use(`${settings.API_PREFIX}/chat`, chatRouter);
app.use(`${settings.API_PREFIX}/storage`, storageRouter);



app.use(`${settings.API_PREFIX}/storage`, storageMinioRouter);









app.use(`${settings.API_PREFIX}/courses`, courseCodeRouter);
app.use(`${settings.API_PREFIX}/community`, communityRouter);
app.use(`${settings.API_PREFIX}/srs`, srsRouter);
app.use(`${settings.API_PREFIX}/quiz`, quizRouter);
app.use(`${settings.API_PREFIX}/mindmaps`, mindmapRouter);
app.use(`${settings.API_PREFIX}/gamification`, gamificationRouter);





app.use(`${settings.API_PREFIX}/admin`, adminRouter);


app.use(`${settings.API_PREFIX}/quiz-battle`, quizBattleRouter);
app.use(settings.API_PREFIX, cmsRouter);


const contentDir = path.join(settings.BASE_DIR, 'contents');
fs.mkdirSync(contentDir, { recursive: true });
app.use('/contents', express.static(contentDir));


app.get('/', (req, res) => {
  res.json({
    message: `Welcome to ${settings.APP_NAME}`,
    version: settings.APP_VERSION,
    environment: settings.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});


app.get('/health', async (req, res) => {
  const dbStatus = await checkDbConnection();
  if (dbStatus === 'connected') {
    return res.status(200).json({ status: 'ok', database: dbStatus });
  }
  return res.status(500).json({
    detail: 'Database connection failed.',
    database: dbStatus,
  });
});


app.use(errorHandler);


const start = async () => {
  boot('start(): initDb...');
  await initDb();
  boot('start(): initDb done');

  try {
    const { pool } = await import('./config/database.js');
    const { bootstrapAdmin } = await import('./admin_agent/bootstrap.js');
    await bootstrapAdmin(pool);
    boot('start(): admin bootstrap done');
  } catch (e) {
    logger.error(`start(): admin bootstrap failed: ${e?.message || e}`);
  }

  boot(`start(): listening on ${settings.HOST}:${settings.PORT}`);
  const server = app.listen(settings.PORT, settings.HOST, () => {
    boot(`start(): server listening`);
    logger.info(`Starting ${settings.APP_NAME} v${settings.APP_VERSION}`);
    logger.info(`Environment: ${settings.ENVIRONMENT}`);
    logger.info(`Listening on http://${settings.HOST}:${settings.PORT}`);
  });



  boot('start(): attaching socket.io');
  const io = createSocketServer(server);
  boot('start(): socket.io attached');
  const { pool } = await import('./config/database.js');
  boot('start(): pool imported');
  const { quizBattleService } = await import('./quiz_battle_agent/service.js');
  boot('start(): battle service imported');
  const battleService = quizBattleService({ pool, io });
  boot('start(): battle service instantiated');
  const matchmakerMod = await import('./realtime/matchmaker.js');
  const handlersMod = await import('./realtime/handlers.js');
  const matchStateMod = await import('./realtime/matchState.js');
  matchmakerMod.init({ pool, quizBattleService: battleService });
  handlersMod.init({ quizBattleService: battleService });




  matchmakerMod.setDuplicateNotifier((courseId, player) => {
    try {
      const sock = io.sockets.sockets.get(player.socketId);
      sock?.emit('battle:error', {
        message: 'You are already searching for an opponent in another tab.',
        fatal: false,
      });
    } catch (e) {
      boot(`start(): duplicate-notify failed: ${e?.message || e}`);
    }
  });
  matchStateMod.setEndMatchFn(battleService.endMatch.bind(battleService));





  matchmakerMod.setFailureNotifier((player) => {
    try {
      const sock = io.sockets.sockets.get(player.socketId);
      sock?.emit('battle:error', {
        message: 'The match could not be created. Please try again.',
        fatal: false,
      });
    } catch (e) {
      boot(`start(): match-failure-notify failed: ${e?.message || e}`);
    }
  });


  matchmakerMod.setTimeoutNotifier((player, courseId) => {
    try {
      const sock = io.sockets.sockets.get(player.socketId);
      sock?.emit('battle:queue-timeout', {
        courseId,
        waitedMs: matchmakerMod.QUEUE_TTL_MS,
      });
    } catch (e) {
      boot(`start(): queue-timeout-notify failed: ${e?.message || e}`);
    }
  });
  attachQuizBattleIo(io);
  boot('start(): realtime wired');



  const inviteSweep = setInterval(() => {
    battleService.sweepExpiredInvites()
      .then((ids) => {
        if (ids && ids.length > 0) {
          boot(`start(): expired ${ids.length} battle invitation(s)`);
        }
      })
      .catch((e) => {
        boot(`start(): battle invitation sweep failed: ${e?.message || e}`);
      });
  }, 60_000);
  inviteSweep.unref?.();




  const inProcess = (process.env.WORKER_INPROCESS || 'true') !== 'false';
  if (inProcess) {
    try {
      await ensureMinioBuckets();
      boot('start(): minio buckets ensured');
      startUploadWorker();
      boot('start(): upload worker started (in-process)');
    } catch (e) {
      logger.error(`start(): minio/worker init failed: ${e?.message || e}`);
    }
  } else {
    boot('start(): WORKER_INPROCESS=false — skipping in-process worker');
  }
};

const shutdown = async (signal) => {
  logger.info(`Received ${signal}. Shutting down...`);
  try { await stopUploadWorker(); } catch (_) {}
  await closeDb();
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  logger.error(`Failed to start application: ${err}`);
  process.exit(1);
});

export default app;
