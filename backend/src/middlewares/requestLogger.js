import { v4 as uuidv4 } from 'uuid';
import { requestIdCtx } from '../utils/requestId.js';
import { logger } from '../utils/logger.js';


export const requestLogger = (req, res, next) => {
  const incoming =
    req.headers['x-request-id'] || req.headers['X-Request-ID'];
  const id =
    typeof incoming === 'string' && incoming.length > 0 ? incoming : uuidv4();

  req.requestId = id;
  res.setHeader('X-Request-ID', id);

  requestIdCtx.run(id, () => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      try {
        logger.info({
          message: `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`,
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration_ms: duration,
        });
      } catch (_) {

      }
    });
    next();
  });
};

export default requestLogger;
