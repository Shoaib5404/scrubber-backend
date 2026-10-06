import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') {
      return value;
    }
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
  CORS_ORIGINS: z.string().min(1).default('http://localhost:3010'),
  LOG_LEVEL: z.string().default('debug'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_SSL: booleanFromString.default(false),

  REDIS_URL: z.string().min(1).default('redis://localhost:6381'),
  REDIS_TLS: booleanFromString.default(false),

  BULLMQ_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_MODE: z.string().default('bullmq'),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(30),
  JWT_ISSUER: z.string().default('neo-scrubber'),
  JWT_AUDIENCE: z.string().default('neo-scrubber-api'),
  API_TOKEN_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(60),

  MINIO_ROOT_USER: z.string().optional(),
  MINIO_ROOT_PASSWORD: z.string().optional(),
  MINIO_API_CORS_ALLOW_ORIGIN: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),
  EDI_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  EDI_LOCAL_PATH: z.string().default('./storage/edi'),
  EDI837_SPEC_PATH: z.string().default('./edi/837p/models'),
  EDI837_VALIDATION_ENABLED: booleanFromString.default(true),
  EDI837_VALIDATION_STRICT: booleanFromString.default(true),
  NCCI_CLAIM_CPT_DB_THRESHOLD: z.coerce.number().int().default(48),
  SCRUBBER_RULE_SWITCH_ENM_ONE_DAY_EARLIER: booleanFromString.default(true),
  SCRUBBER_RULE_SWITCH_EM_BUNDLING: booleanFromString.default(true),

  FRONTEND_URL: z.string().default('http://localhost:3010'),
});

export type Env = z.infer<typeof envSchema>;
