import { settings } from './settings.js';
import { logger } from '../utils/logger.js';

let _client = null;


const _sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


const _buildClientOnce = async (useCloudResolved) => {
  const chromadb = await import('chromadb');

  if (useCloudResolved) {
    const { CloudClient } = chromadb;
    return new CloudClient({
      apiKey: settings.CHROMA_API_KEY,
      tenant: settings.CHROMA_TENANT || undefined,
      database: settings.CHROMA_DATABASE || undefined,
    });
  }


  const { ChromaClient, AdminClient } = chromadb;
  const host = settings.CHROMA_HOST || 'localhost';
  const port = settings.CHROMA_PORT || 8000;
  const path = `http://${host}:${port}`;
  const tenant = settings.CHROMA_TENANT || 'default_tenant';
  const database = settings.CHROMA_DATABASE || 'default_database';




  await _ensureTenantAndDatabase(AdminClient, path, tenant, database);

  return new ChromaClient({ path, tenant, database });
};


async function _ensureTenantAndDatabase(AdminClient, path, tenant, database) {
  let admin;
  try {
    admin = new AdminClient({ path });
  } catch (e) {
    logger.warn(`[chroma] could not create admin client: ${e?.message || e}`);
    return;
  }

  try {
    await admin.createTenant({ name: tenant });
  } catch (e) {

    if (!String(e?.message || '').toLowerCase().includes('already exists')) {
      logger.warn(`[chroma] createTenant(${tenant}) failed: ${e?.message || e}`);
    }
  }

  try {
    await admin.createDatabase({ name: database, tenantName: tenant });
  } catch (e) {
    if (!String(e?.message || '').toLowerCase().includes('already exists')) {
      logger.warn(`[chroma] createDatabase(${database}) failed: ${e?.message || e}`);
    }
  }
}


export const getChromaClient = async (useCloud = null) => {
  if (_client) return _client;

  const useCloudResolved =
    useCloud !== null
      ? useCloud
      : Boolean(settings.CHROMA_API_KEY && settings.CHROMA_API_KEY !== '');

  const backoffs = [100, 500, 2000];
  let lastError = null;

  for (let attempt = 0; attempt < backoffs.length; attempt++) {
    try {
      _client = await _buildClientOnce(useCloudResolved);
      if (attempt > 0) {
        logger.info(
          `ChromaDB client initialised on attempt ${attempt + 1}`
        );
      }
      return _client;
    } catch (e) {
      lastError = e;
      const delay = backoffs[attempt];
      logger.warn(
        `ChromaDB init attempt ${attempt + 1} failed: ${e?.message || e}; retrying in ${delay}ms`
      );
      _client = null;
      if (attempt < backoffs.length - 1) {
        await _sleep(delay);
      }
    }
  }

  throw new Error(
    `ChromaDB client could not be initialised after ${backoffs.length} attempts: ${lastError?.message || lastError}`
  );
};


export const resetChromaClient = () => {
  _client = null;
};


export const getChromaCollection = async (collectionName = 'learnai') => {
  const client = await getChromaClient();
  return await client.getOrCreateCollection({ name: collectionName });
};

export default {
  getChromaClient,
  resetChromaClient,
  getChromaCollection,
};
