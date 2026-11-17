import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';


const DEFAULT_BATCH_SIZE = 96;

const EMBED_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';


function _extractError(payload, status) {
    const msg =
        payload?.error?.message
        || payload?.message
        || `HTTP ${status}`;
    return String(msg);
}


export class EmbeddingService {

    constructor(model = null) {

        this.model = model || settings.EMBEDDING_MODEL || 'gemini-embedding-001';
        this.apiKey = settings.GEMINI_API_KEY;
    }


    async _embedOne(text) {
        const url = `${EMBED_BASE_URL}/${this.model}:embedContent?key=${this.apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: `models/${this.model}`,
                content: { parts: [{ text: String(text ?? '') }] },
            }),
        });

        if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error(
                `Gemini embedding failed: ${_extractError(payload, res.status)}`,
            );
        }

        const payload = await res.json();
        const values = payload?.embedding?.values;
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error('Gemini embedding response contained no vector');
        }
        return values;
    }


    async _embedMany(texts) {
        const url = `${EMBED_BASE_URL}/${this.model}:batchEmbedContents?key=${this.apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: texts.map((text) => ({
                    model: `models/${this.model}`,
                    content: { parts: [{ text: String(text ?? '') }] },
                })),
            }),
        });

        if (!res.ok) {
            const payload = await res.json().catch(() => null);
            throw new Error(
                `Gemini batch embedding failed: ${_extractError(payload, res.status)}`,
            );
        }

        const payload = await res.json();
        const embeddings = payload?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
            throw new Error(
                `Gemini batch embedding returned ${embeddings?.length ?? 0} vectors for ${texts.length} texts`,
            );
        }
        return embeddings.map((e) => e?.values);
    }


    async embedDocuments(texts) {
        if (!texts || texts.length === 0) return [];

        try {
            if (texts.length === 1) {
                return [await this._embedOne(texts[0])];
            }
            return await this._embedMany(texts);
        } catch (e) {
            logger.error(`Error embedding documents: ${e.message || e}`);
            throw e;
        }
    }


    async embedQuery(query) {
        try {
            const [vector] = await this.embedDocuments([query]);
            return vector;
        } catch (e) {
            logger.error(`Error embedding query: ${e.message || e}`);
            throw e;
        }
    }


    async embedBatch(texts, batchSize = DEFAULT_BATCH_SIZE) {
        const allEmbeddings = [];

        const totalBatches = Math.max(1, Math.ceil(texts.length / batchSize));
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            // eslint-disable-next-line no-await-in-loop
            const embeddings = await this.embedDocuments(batch);
            allEmbeddings.push(...embeddings);
            logger.info(
                `Embedded batch ${Math.floor(i / batchSize) + 1}/${totalBatches}`,
            );
        }

        return allEmbeddings;
    }
}


export const embeddingService = new EmbeddingService();


export const getEmbeddingService = (model = null) =>
    new EmbeddingService(model);

export default embeddingService;
