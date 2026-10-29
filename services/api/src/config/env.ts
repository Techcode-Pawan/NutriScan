import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:8081,http://localhost:19006'),
  ML_SERVICE_URL: z.string().url().default('http://127.0.0.1:8001'),
  ML_TIMEOUT_MS: z.coerce.number().int().positive().default(4000),
  LLM_PROVIDER: z.enum(['none', 'ollama', 'openai_compatible', 'anthropic']).default('none'),
  LLM_MODEL: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(20000),
  OFF_LIVE_LOOKUP: bool,
  OFF_USER_AGENT: z.string().default('NutriScan-Academic/1.0 (student project)'),
  OCR_LANG_PATH: z.string().optional(),
  TRUST_PROXY: bool,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast with a readable message instead of a stack trace deep inside a request.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
