import pg from 'pg';
import { settings } from './settings.js';

const { Pool } = pg;


export const pool = new Pool({
  connectionString: settings.DB_URL,
  max: settings.DB_POOL_SIZE,
  idleTimeoutMillis: settings.DB_POOL_TIMEOUT * 1000,
  connectionTimeoutMillis: settings.DB_POOL_TIMEOUT * 1000,
  statement_timeout: 120000,
});


export const getDb = async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
  } catch (e) {
    if (client) {










      try { await client.query('ROLLBACK'); } catch (_) {  }
      try { client.release(true); } catch (_) {  }
    }
    return next(e);
  }

  req.db = client;





  req._dbReleased = false;
  req._dbCommitted = false;
  req._dbRolledBack = false;
  req._dbHandlerDone = false;

  const releaseOnce = () => {
    if (req._dbReleased) return;
    req._dbReleased = true;
    try { client.release(); } catch (_) {  }
  };


  const destroyOnce = () => {
    if (req._dbReleased) return;
    req._dbReleased = true;
    try { client.release(true); } catch (_) {  }
  };


  const safeRollback = async () => {
    try {
      await client.query('ROLLBACK');
      req._dbRolledBack = true;
    } catch {


      destroyOnce();
    }
  };

  const autoRollback = async () => {
    if (req._dbReleased || req._dbCommitted) {
      releaseOnce();
      return;
    }
    await safeRollback();
    releaseOnce();
  };





  let autoFired = false;
  let handlerSettled = false;
  let pendingFinalize = null;

  const finalize = () => {
    if (autoFired) return;
    autoFired = true;
    autoRollback().catch(() => {  });
  };

  res.on('finish', () => {
    handlerSettled = true;
    finalize();
  });

  res.on('close', () => {
    if (handlerSettled) {
      finalize();
      return;
    }
    pendingFinalize = finalize;
  });



  const settleHandler = () => {
    req._dbHandlerDone = true;
    handlerSettled = true;
    if (pendingFinalize) {
      const fn = pendingFinalize;
      pendingFinalize = null;
      fn();
    }
  };


  req.dbCommit = async () => {
    if (req._dbReleased) {
      settleHandler();
      return;
    }
    if (req._dbCommitted) {
      releaseOnce();
      settleHandler();
      return;
    }
    req._dbCommitted = true;
    try {
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch (_) {  }
      destroyOnce();
      settleHandler();
      throw e;
    } finally {
      releaseOnce();
      settleHandler();
    }
  };



  req.dbRollback = async () => {
    if (req._dbReleased) {
      settleHandler();
      return;
    }
    if (req._dbRolledBack) {
      releaseOnce();
      settleHandler();
      return;
    }
    await safeRollback();
    releaseOnce();
    settleHandler();
  };

  next();
};


export const checkDbConnection = async () => {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return 'connected';
    } finally {
      client.release();
    }
  } catch (e) {
    return 'disconnected';
  }
};


export const initDb = async () => {
  const status = await checkDbConnection();
  return status;
};


export const closeDb = async () => {
  await pool.end();
};


export const withDb = async (fn) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {

    }
    throw e;
  } finally {
    client.release();
  }
};


export const withOwnDb = async (fn, db = null) => {
  if (db) return fn(db);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {

    }
    throw e;
  } finally {
    client.release();
  }
};

export default {
  pool,
  getDb,
  checkDbConnection,
  initDb,
  closeDb,
  withDb,
  withOwnDb,
};
