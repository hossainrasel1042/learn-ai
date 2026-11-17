import winston from 'winston';
import { requestIdCtx, getRequestId } from './requestId.js';
import { settings } from '../config/settings.js';

const _loggers = new Map();


const requestIdFormat = winston.format((info) => {
  info.request_id = getRequestId();
  return info;
})();


const jsonFormatter = winston.format.printf((info) => {
  const {
    timestamp,
    level,
    logger,
    message,
    request_id,
    pid,
    threadName,
    location,
    stack,
    ...meta
  } = info;

  const payload = {
    timestamp: timestamp || new Date().toISOString(),
    level,
    logger: logger || 'app',
    message,
    request_id: request_id || '-',
    pid: pid || process.pid,
    threadName: threadName || 'main',
  };

  if (location && typeof location === 'object') {
    payload.location = location;
  }

  if (Object.keys(meta).length > 0) {
    payload.meta = meta;
  }

  if (stack) {
    payload.exception = stack;
  }

  return JSON.stringify(payload);
});


export const setupLogger = ({
  name = 'app',
  logLevel = 'INFO',
  logFormat = 'console',
  logFile = null,
  maxBytes = 10 * 1024 * 1024,
  backupCount = 5,
} = {}) => {
  if (_loggers.has(name)) {
    return _loggers.get(name);
  }

  const transports = [];


  if (logFormat === 'json') {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp(),
          requestIdFormat,
          jsonFormatter
        ),
      })
    );
  } else {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          requestIdFormat,
          winston.format.printf((info) => {
            const { timestamp, level, message, request_id, ...meta } = info;
            const rid = request_id ? `[${request_id}]` : '';
            const metaStr = Object.keys(meta).length
              ? ` ${JSON.stringify(meta)}`
              : '';
            return `${timestamp} ${level} ${rid} ${message}${metaStr}`;
          })
        ),
      })
    );
  }


  if (logFile) {
    try {
      transports.push(
        new winston.transports.File({
          filename: logFile,
          maxsize: maxBytes,
          maxFiles: backupCount,
          tailable: true,
          format: winston.format.combine(
            winston.format.timestamp(),
            requestIdFormat,
            jsonFormatter
          ),
        })
      );
    } catch (e) {

    }
  }

  const loggerInstance = winston.createLogger({
    level: logLevel,
    defaultMeta: { logger: name },
    transports,
  });

  _loggers.set(name, loggerInstance);
  return loggerInstance;
};


export const getLogger = (name = 'app') => {
  if (_loggers.has(name)) return _loggers.get(name);
  return setupLogger({ name });
};


export const logger = setupLogger({
  name: 'app',
  logLevel: settings.LOG_LEVEL,
  logFormat: settings.LOG_FORMAT,
  logFile: settings.is_production ? settings.LOG_FILE : null,
  maxBytes: settings.LOG_MAX_BYTES,
  backupCount: settings.LOG_BACKUP_COUNT,
});

export default logger;