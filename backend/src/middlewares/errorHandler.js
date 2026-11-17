import { logger } from '../utils/logger.js';
import { getRequestId } from '../utils/requestId.js';


// eslint-disable-next-line no-unused-vars
export const errorHandler = async (err, req, res, next) => {



  const requestId =
    req?.requestId || getRequestId() || '-';


  try {
    logger.error({
      message: err?.message || 'Unhandled error',
      stack: err?.stack,
      url: req?.originalUrl,
      method: req?.method,
      request_id: requestId,
    });
  } catch (_) {

  }

  const status = err?.status || err?.statusCode || 500;
  const detail =
    err?.detail ||
    err?.message ||
    (status === 500 ? 'Internal Server Error' : 'Error');

  if (req?.dbRollback) {
    try {
      await req.dbRollback();
    } catch (_) {

    }
  }

  res.status(status).json({
    detail,
    request_id: requestId,
  });
};

export default errorHandler;
