

import { GoogleGenerativeAI } from '@google/generative-ai';
import { settings } from '../config/settings.js';
import { logger } from '../utils/logger.js';


export class GenerationConfig {
  constructor({
    temperature = 0.7,
    topP = 0.95,
    topK = 40,
    maxOutputTokens = 8192,
    systemInstruction = null,
    responseMimeType = null,
    responseSchema = null,
  } = {}) {
    this.temperature = temperature;
    this.topP = topP;
    this.topK = topK;
    this.maxOutputTokens = maxOutputTokens;
    this.systemInstruction = systemInstruction;
    this.responseMimeType = responseMimeType;
    this.responseSchema = responseSchema;
  }
}



function extractText(response) {
  if (!response) return '';


  if (typeof response.text === 'function') {
    const t = response.text();
    if (t) return t;
  } else if (typeof response.text === 'string' && response.text) {
    return response.text;
  }


  const candidates = response.candidates
    || response.response?.candidates
    || response.response?.data?.candidates
    || response.data?.candidates
    || [];
  const fromCandidates = candidates
    .map((c) => (c?.content?.parts || [])
      .map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join(''))
    .filter(Boolean)
    .join('');
  if (fromCandidates) return fromCandidates;


  const rawText = response.response?.text ?? response.data?.text;
  if (typeof rawText === 'string' && rawText) return rawText;


  const raw = response.response?.data ?? response.data;
  if (typeof raw === 'string') return raw;

  return '';
}


function extractFinishInfo(response) {
  if (!response) return { finishReason: null, blockReason: null, usage: null };

  const candidates = response.candidates
    || response.response?.candidates
    || response.response?.data?.candidates
    || response.data?.candidates
    || [];
  const first = candidates[0] || {};

  const promptFeedback = response.promptFeedback
    || response.response?.promptFeedback
    || response.data?.promptFeedback
    || null;

  return {
    finishReason: first.finishReason || null,
    blockReason: promptFeedback?.blockReason || null,
    usage: response.response?.usageMetadata || response.data?.usageMetadata || null,
  };
}


function describeFinishReason(finishReason, blockReason, usage) {
  if (blockReason) {
    return `Gemini blocked the request (${blockReason}). Try different source material.`;
  }
  switch (finishReason) {
    case 'MAX_TOKENS':
      return (
        'The AI response was cut off because it hit the output token limit '
        + '(the model ran out of room before finishing the JSON). '
        + 'Try generating fewer questions at once.'
      );
    case 'SAFETY':
      return 'Gemini blocked the generated content for safety reasons.';
    case 'PROHIBITED_CONTENT':
      return 'Gemini refused to generate content from this source material.';
    case 'RECITATION':
      return 'Gemini refused to reproduce the source material verbatim.';
    case 'LANGUAGE':
      return 'Gemini could not answer in the requested language.';
    default:
      return null;
  }
}


export function isRateLimitError(error) {
  if (!error) return false;
  const message = String(error.message || error);
  return (
    message.includes('429')
    || message.includes('RESOURCE_EXHAUSTED')
    || message.includes('Quota exceeded')
    || message.includes('quotaValue')
    || message.includes('rate limit')
    || message.includes('Too Many Requests')
  );
}


export function isTransientServiceError(error) {
  if (!error) return false;
  const message = String(error.message || error);
  return (
    message.includes('503')
    || message.includes('Service Unavailable')
    || message.includes('UNAVAILABLE')
    || message.includes('high demand')
    || message.includes('overloaded')
  );
}


export function shouldTryFallbackModel(error) {
  return isRateLimitError(error) || isTransientServiceError(error);
}


export function modelCandidates(primary) {
  const first = primary || settings.GEMINI_MODEL;
  const fallbacks = (settings.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);

  const out = [];
  for (const model of [first, ...fallbacks]) {
    if (model && !out.includes(model)) out.push(model);
  }
  return out.length > 0 ? out : ['gemini-3-flash-preview'];
}

export class GeminiService {

  static MODELS = {
    pro: 'gemini-3.1-pro-preview',
    flash: 'gemini-3-flash-preview',
    pro_image: 'imagen-4.0-fast-generate-001',
  };


  constructor(model = null) {

    this.client = new GoogleGenerativeAI(settings.GEMINI_API_KEY);

    const requested = model || settings.GEMINI_MODEL;
    this.model = GeminiService.MODELS[requested] || requested;
    this.candidates = modelCandidates(this.model);
    this.defaultConfig = new GenerationConfig();
  }


  _buildGenConfig(cfg) {
    const out = {
      temperature: cfg.temperature,
      topP: cfg.topP,
      topK: cfg.topK,
      maxOutputTokens: cfg.maxOutputTokens,
    };
    if (cfg.systemInstruction) {
      out.systemInstruction = cfg.systemInstruction;
    }
    if (cfg.responseMimeType) {
      out.responseMimeType = cfg.responseMimeType;
    }
    if (cfg.responseSchema) {
      out.responseSchema = cfg.responseSchema;
    }
    return out;
  }


  async generate(prompt, config = null, context = null) {
    const { text } = await this.generateWithMeta(prompt, config, context);
    return text;
  }


  async generateWithMeta(prompt, config = null, context = null) {
    const cfg = config || this.defaultConfig;


    let contents = prompt;
    if (context) {
      contents = `Context:\n${context}\n\nRequest:\n${prompt}`;
    }

    const genConfig = this._buildGenConfig(cfg);
    const candidates = this.candidates && this.candidates.length > 0
      ? this.candidates
      : [this.model];

    let lastError = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const model = candidates[i];
      try {
        const modelHandle = this.client.getGenerativeModel({
          model,
          generationConfig: genConfig,
        });
        const response = await modelHandle.generateContent(contents);



        const text = extractText(response);
        const info = extractFinishInfo(response);

        if (info.finishReason && info.finishReason !== 'STOP') {
          logger.warn(
            `Gemini finished with reason "${info.finishReason}" `
            + `(blockReason=${info.blockReason || 'none'}, `
            + `usage=${JSON.stringify(info.usage || {})})`,
          );
        }

        if (i > 0) {
          logger.warn(
            `Gemini generation succeeded on fallback model "${model}" `
            + `after "${candidates[i - 1]}" failed`,
          );
        }

        return { text, ...info, model };
      } catch (e) {
        lastError = e;

        if (!shouldTryFallbackModel(e) || i === candidates.length - 1) {
          logger.error(`Gemini generation failed: ${e.message || e}`);
          throw e;
        }

        logger.warn(
          `Gemini model "${model}" is rate limited, out of quota or unavailable `
          + `(${e.message || e}) — trying fallback model `
          + `"${candidates[i + 1]}"`,
        );
      }
    }

    logger.error(`Gemini generation failed: ${lastError?.message || lastError}`);
    throw lastError;
  }


  async generateJson(prompt, schemaHint = null, config = null) {







    const cfg =
      config ||
      new GenerationConfig({
        temperature: 0.3,
        responseMimeType: 'application/json',
        maxOutputTokens: 16384,
      });

    let enhancedPrompt = prompt;
    if (schemaHint) {
      enhancedPrompt = `${prompt}\n\nExpected JSON format:\n${schemaHint}`;
    }

    const { text: result, finishReason, blockReason, usage } =
      await this.generateWithMeta(enhancedPrompt, cfg);




    if (!result || typeof result !== 'string' || !result.trim()) {
      const reason = describeFinishReason(finishReason, blockReason, usage);
      if (reason) {
        logger.warn(`Gemini returned an empty response — ${reason}`);
        throw Object.assign(new Error(reason), { status: 502 });
      }
      logger.warn('Gemini returned an empty response');
      return {};
    }


    try {
      let cleaned = result;
      if (cleaned.includes('```json')) {
        cleaned = cleaned.split('```json')[1].split('```')[0];
      } else if (cleaned.includes('```')) {
        cleaned = cleaned.split('```')[1].split('```')[0];
      }
      return JSON.parse(cleaned.trim());
    } catch (e) {




      const reason = describeFinishReason(finishReason, blockReason, usage);
      if (reason) {
        logger.warn(`Gemini JSON was unusable — ${reason}`);
        throw Object.assign(new Error(reason), { status: 502 });
      }
      logger.warn(`JSON parse failed, returning raw: ${e.message || e}`);
      return { raw_response: result };
    }
  }


  async generateStructured(prompt, responseSchema, config = null) {

    const cfg =
      config ||
      new GenerationConfig({
        temperature: 0.3,
      });

    cfg.responseSchema = responseSchema;
    cfg.responseMimeType = 'application/json';

    try {
      const result = await this.generate(prompt, cfg);

      return JSON.parse(result.trim());
    } catch (e) {
      logger.error(`Structured generation failed: ${e.message || e}`);
      throw e;
    }
  }


  async *generateStream(prompt, config = null) {
    const cfg = config || this.defaultConfig;

    const genConfig = this._buildGenConfig(cfg);
    const candidates = this.candidates && this.candidates.length > 0
      ? this.candidates
      : [this.model];

    let lastError = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const model = candidates[i];
      try {
        const modelHandle = this.client.getGenerativeModel({
          model,
          generationConfig: genConfig,
        });


        const stream = await modelHandle.generateContentStream(prompt);
        for await (const chunk of stream) {
          const text = extractText(chunk);
          if (text) yield text;
        }
        return;
      } catch (e) {
        lastError = e;
        if (!shouldTryFallbackModel(e) || i === candidates.length - 1) {
          logger.error(`Gemini streaming failed: ${e.message || e}`);
          throw e;
        }
        logger.warn(
          `Gemini model "${model}" is rate limited, out of quota or unavailable `
          + `(${e.message || e}) — trying fallback model `
          + `"${candidates[i + 1]}"`,
        );
      }
    }

    logger.error(`Gemini streaming failed: ${lastError?.message || lastError}`);
    throw lastError;
  }


  async chat(messages, config = null) {
    const cfg = config || this.defaultConfig;

    const genConfig = this._buildGenConfig(cfg);
    const candidates = this.candidates && this.candidates.length > 0
      ? this.candidates
      : [this.model];

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    let lastError = null;

    for (let i = 0; i < candidates.length; i += 1) {
      const model = candidates[i];
      try {
        const modelHandle = this.client.getGenerativeModel({
          model,
          generationConfig: genConfig,
        });


        const chat = modelHandle.startChat({ history });


        const response = await chat.sendMessage(messages[messages.length - 1].content);
        return extractText(response);
      } catch (e) {
        lastError = e;
        if (!shouldTryFallbackModel(e) || i === candidates.length - 1) {
          logger.error(`Gemini chat failed: ${e.message || e}`);
          throw e;
        }
        logger.warn(
          `Gemini model "${model}" is rate limited, out of quota or unavailable `
          + `(${e.message || e}) — trying fallback model `
          + `"${candidates[i + 1]}"`,
        );
      }
    }

    logger.error(`Gemini chat failed: ${lastError?.message || lastError}`);
    throw lastError;
  }
}


export const getGeminiService = (model = null) => new GeminiService(model);


export const geminiService = new GeminiService();

export default geminiService;
