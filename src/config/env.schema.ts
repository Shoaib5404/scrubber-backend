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
  /** Optional dedicated URL for lookup cache; falls back to REDIS_URL. */
  REDIS_LOOKUP_URL: z.string().optional(),
  /**
   * Logical Redis DB for Nest lookup/reference cache (BullMQ stays on REDIS_URL DB 0).
   * Default 1 — do not reuse DB 0.
   */
  REDIS_LOOKUP_DB: z.coerce.number().int().min(0).default(1),
  /** When false, lookup reads always hit PostgreSQL (no Redis GET/SET). */
  LOOKUP_CACHE_ENABLED: booleanFromString.default(true),
  /** Lookup cache TTL in seconds; <=0 means no expiry. Default 1 year. */
  LOOKUP_CACHE_TTL: z.coerce.number().int().default(31_536_000),
  /** Key namespace prefix for lookup cache (`lookup:v1:…`). */
  LOOKUP_CACHE_KEY_PREFIX: z.string().default('lookup'),
  /**
   * Max UTF-8 bytes per Redis STRING chunk. Larger payloads are split across
   * `__meta` + `__chunk:N` keys (never skipped).
   */
  LOOKUP_CACHE_CHUNK_BYTES: z.coerce.number().int().positive().default(1_048_576),
  /**
   * After library import invalidate, eagerly warm that table into Redis DB 1.
   * Set false to invalidate-only (lazy warm on next read).
   */
  LOOKUP_CACHE_WARM_ON_IMPORT: booleanFromString.default(true),
  /** Local path to medicaid-member-id-formats.json under storage/data. */
  MEDICAID_MEMBER_ID_FORMATS_PATH: z
    .string()
    .default('storage/data/medicaid-member-id-formats.json'),

  BULLMQ_CONCURRENCY: z.coerce.number().int().positive().default(5),
  QUEUE_MODE: z.string().default('bullmq'),
  /** Enable BullMQ fan-out for claim validation. */
  USE_QUEUE: booleanFromString.default(false),
  /** Fan-out ValidateBatch when USE_QUEUE is true. */
  PARALLEL_VALIDATE: booleanFromString.default(true),
  /** Minutes before a queued validation job is treated as stalled. */
  QUEUE_STALL_MINUTES: z.coerce.number().int().positive().default(10),
  /** Redis lock TTL for scheduler withoutOverlapping (ms). */
  SCHEDULER_LOCK_TTL_MS: z.coerce.number().int().positive().default(290_000),

  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(60),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(30),
  JWT_ISSUER: z.string().default('neo-scrubber'),
  JWT_AUDIENCE: z.string().default('neo-scrubber-api'),
  API_TOKEN_EXPIRATION_MINUTES: z.coerce.number().int().positive().default(60),

  MINIO_ROOT_USER: z.string().optional(),
  MINIO_ROOT_PASSWORD: z.string().optional(),
  MINIO_API_CORS_ALLOW_ORIGIN: z.string().optional(),
  /** `local` (default) or `s3` (MinIO / AWS). Presigned browser uploads require `s3`. */
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  /** Nest ↔ MinIO. Local Compose: http://localhost:9020. Prod host map: :9000 (or Docker DNS http://minio:9000). */
  S3_ENDPOINT: z.string().optional(),
  /**
   * Browser-facing MinIO endpoint used when signing presigned URLs.
   * Local: http://localhost:9020. Production: public URL on :9000 (or TLS).
   * Defaults to S3_ENDPOINT when unset.
   */
  S3_PUBLIC_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),
  /** Presigned PUT/GET TTL in seconds (TeleWound default 900). */
  S3_PRESIGN_TTL: z.coerce.number().int().positive().default(900),
  EDI_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  EDI_LOCAL_PATH: z.string().default('./storage/edi'),
  EDI837_SPEC_PATH: z.string().default('./edi/837p/models'),
  EDI837_VALIDATION_ENABLED: booleanFromString.default(true),
  EDI837_VALIDATION_STRICT: booleanFromString.default(true),
  NCCI_CLAIM_CPT_DB_THRESHOLD: z.coerce.number().int().default(48),
  SCRUBBER_RULE_SWITCH_ENM_ONE_DAY_EARLIER: booleanFromString.default(true),
  SCRUBBER_RULE_SWITCH_EM_BUNDLING: booleanFromString.default(true),

  // SP-8 Task 20 — CMS Order and Referring NPI sync.
  /** Import directory for NPI ordering/referring CSVs. */
  NPI_ORDERING_REFERRING_IMPORT_DIRECTORY: z.string().default('import/NPI_Ordering_Referring'),
  /** Max local CSV files retained after download/import. */
  NPI_ORDERING_REFERRING_MAX_LOCAL_CSV_FILES: z.coerce.number().int().positive().default(2),
  /** CMS download timeout in seconds. */
  NPI_ORDERING_REFERRING_DOWNLOAD_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(600),
  /** CMS dataset type id for Order and Referring NPI. */
  NPI_ORDERING_REFERRING_CMS_DATASET_TYPE_ID: z
    .string()
    .default('c99b5865-1119-4436-bb80-c5af2773ea1f'),
  /** Max poll attempts while waiting for a CMS download request. */
  NPI_ORDERING_REFERRING_DOWNLOAD_REQUEST_ATTEMPTS: z.coerce.number().int().positive().default(30),
  /** Seconds between CMS download request polls. */
  NPI_ORDERING_REFERRING_DOWNLOAD_REQUEST_POLL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(2),
  /**
   * When true, SchedulerHost runs `npi-ordering-referrings:sync` daily at 06:00 America/New_York.
   * Requires `npm run start:scheduler` (or Compose scheduler service).
   */
  NPI_SYNC_SCHEDULE_ENABLED: booleanFromString.default(false),

  FRONTEND_URL: z.string().default('http://localhost:3010'),
  /** Password-reset token lifetime in minutes. */
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  /**
   * When true, unverified users are blocked from staff/customer apps.
   * Default false (email verification soft-gate off).
   */
  EMAIL_VERIFICATION_REQUIRED: booleanFromString.default(false),
  /** Confirm-password session lifetime in seconds. */
  PASSWORD_CONFIRM_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  /**
   * Email providers for invites (priority: SendGrid → Resend).
   * Optional in non-production — invite URL is logged when neither is set.
   */
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().optional(),
  SENDGRID_FROM_NAME: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  RESEND_FROM_NAME: z.string().optional(),
  /**
   * When set, all Resend deliveries go to this inbox (Resend free/test mode only
   * allows the account owner's address). Original recipient is noted in the body.
   */
  RESEND_SANDBOX_TO: z.string().optional(),
  /** Display name fallback when provider-specific name is unset. */
  MAIL_FROM_NAME: z.string().default('Scrubber'),
  MAIL_FROM: z.string().default('noreply@neoscrubber.local'),
  TENANT_INVITE_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

export type Env = z.infer<typeof envSchema>;
