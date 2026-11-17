import 'dotenv/config';
import { z } from 'zod';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const BASE_DIR = path.dirname(__dirname);


const csvArray = (defaultValue = []) =>
  z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return defaultValue;
      return val
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    });


const boolCoerce = z
  .union([z.string(), z.boolean()])
  .optional()
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    if (val === undefined || val === null || val === '') return false;
    return val.toLowerCase() === 'true' || val === '1';
  });


const numCoerce = (defaultValue) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null || val === '') return defaultValue;
      const n = typeof val === 'number' ? val : parseInt(val, 10);
      return Number.isNaN(n) ? defaultValue : n;
    });

const settingsSchema = z.object({
  APP_NAME: z.string().default('LearnAI'),
  APP_VERSION: z.string().default('1.0.0'),
  DEBUG: boolCoerce.default(false),
  ENVIRONMENT: z
    .enum(['production', 'development', 'staging'])
    .default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: numCoerce(8000).default(8000),
  API_PREFIX: z.string().default('/api/v1'),
  AUTH_TIMEOUT: numCoerce(10).default(10),





  LOG_LEVEL: z
    .string()
    .optional()
    .transform((v) => (v ? v.toLowerCase() : 'info'))
    .default('info'),
  LOG_FORMAT: z.enum(['console', 'json']).default('console'),
  LOG_FILE: z.string().default('logs/app.log'),
  LOG_MAX_BYTES: numCoerce(10485760).default(10485760),
  LOG_BACKUP_COUNT: numCoerce(5).default(5),

  DB_URL: z.string().min(1, 'DB_URL is required'),
  DB_POOL_SIZE: numCoerce(5).default(5),
  DB_MAX_OVERFLOW: numCoerce(10).default(10),
  DB_POOL_TIMEOUT: numCoerce(30).default(30),
  DB_ECHO: boolCoerce.default(false),






  CHROMA_HOST: z.string().default('localhost'),
  CHROMA_PORT: numCoerce(8000).default(8000),
  CHROMA_API_KEY: z.string().optional().default(''),
  CHROMA_TENANT: z.string().optional().default(''),
  CHROMA_DATABASE: z.string().default('learnai'),

  REDIS_URL: z.string().default('redis://localhost:6379/0'),


  MAIL_PROVIDER: z.string().optional().default('resend'),
  RESEND_API_KEY: z.string().optional().default(''),
  MAIL_FROM: z.string().optional().default(''),
  RESEND_API_URL: z.string().optional().default('https://api.resend.com/emails'),

  ADMIN_EMAIL: z.string().optional().default(''),
  ADMIN_PASS: z.string().optional().default(''),
  ADMIN_NAME: z.string().optional().default(''),

  RATE_LIMIT_DEFAULT: z.string().default('100/minute'),
  RATE_LIMIT_ENABLED: boolCoerce.default(true),








  RATE_LIMIT_TEST_BYPASS_SECRET: z.string().optional().default(''),

  CACHE_TTL: numCoerce(3600).default(3600),

  CORS_ORIGINS: csvArray(['http://localhost:3000']).default(['http://localhost:3000']),
  CORS_CREDENTIALS: boolCoerce.default(true),




  CORS_METHODS: csvArray(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).default(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']),
  CORS_HEADERS: csvArray(['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie']).default(['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Cookie']),

  MAX_UPLOAD_SIZE: numCoerce(10485760).default(10485760),



  STORAGE_MAX_UPLOAD_BYTES: numCoerce(10485760).default(10485760),
  ALLOWED_EXTENSIONS: csvArray(['.txt', '.jpg', '.jpeg', '.png', '.pdf']).default([
    '.txt',
    '.jpg',
    '.jpeg',
    '.png',
    '.pdf',
  ]),

  BASE_DIR: z.string().default(BASE_DIR),

  GEMINI_API_KEY: z.string().min(1, 'GEMINI_API_KEY is required'),
  COHERE_API_KEY: z.string().optional().default(''),


  EMBEDDING_MODEL: z.string().default('gemini-embedding-001'),


  GEMINI_MODEL: z.string().default('gemini-3-flash-preview'),


  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('gemini-3.5-flash,gemini-3.1-flash-lite,gemini-3.7-flash'),

  QUIZ_DEFAULT_QUESTIONS: numCoerce(10).default(10),

  SRS_DECK_SIZE: numCoerce(20).default(20),

  MINDMAP_DEFAULT_NODES: numCoerce(8).default(8),



  XP_SRS_REVIEW: numCoerce(10).default(10),
  XP_QUIZ_CORRECT: numCoerce(5).default(5),
  XP_QUIZ_FINISHED: numCoerce(20).default(20),
  XP_MINDMAP_GENERATED: numCoerce(25).default(25),
  XP_CHAT_MESSAGE: numCoerce(2).default(2),
  XP_CHAT_DAILY_CAP: numCoerce(50).default(50),
  XP_MATERIAL_VIEWED: numCoerce(1).default(1),





  XP_DAILY_CAP_SRS_REVIEW: numCoerce(300).default(300),
  XP_DAILY_CAP_QUIZ_CORRECT: numCoerce(200).default(200),
  XP_DAILY_CAP_QUIZ_FINISHED: numCoerce(200).default(200),
  XP_DAILY_CAP_MINDMAP_GENERATED: numCoerce(150).default(150),
  XP_DAILY_CAP_MATERIAL_VIEWED: numCoerce(50).default(50),
  STREAK_GRACE_HOURS: numCoerce(36).default(36),
  XP_HISTORY_PAGE_SIZE: numCoerce(50).default(50),








  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters')
    .default(process.env.JWT_SECRET || ''),


  JWT_ISSUER: z.string().default('learnai'),

  JWT_TTL_SECONDS: numCoerce(1800).default(1800),












  SUPABASE_URL: z
    .string()
    .optional()
    .default(process.env.SUPABASE_URL || '')
    .transform((v) => v || process.env.SUPABASE_URL || ''),


  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .optional()
    .default(process.env.SUPABASE_SECRET_KEY || '')
    .transform((v) => v || process.env.SUPABASE_SECRET_KEY || ''),


  FRONTEND_URL: z.string().default('http://localhost:3000'),




  BACKEND_PUBLIC_URL: z.string().default('http://localhost:8000'),
});


const parsed = settingsSchema.parse(process.env);







if (!parsed.JWT_SECRET || parsed.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET is required and must be at least 32 characters. ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
  );
}


const settings = Object.freeze({
  ...parsed,
  is_production: parsed.ENVIRONMENT === 'production',
  is_development: parsed.ENVIRONMENT === 'development',
  cookie_secure: parsed.ENVIRONMENT === 'production',
});

export default settings;
export { settings };
