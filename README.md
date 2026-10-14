# Scrubber Backend

NestJS API for Neo Scrubber (EDI 837 claim scrubbing). Sibling of [`scrubber-frontend`](../scrubber-frontend/README.md) under `C:\sites\Scrubber`.

Serves the Next.js UI and API clients: authentication, EDI ingestion, structural/business validation, reference data, tenants, audit, and support inquiries.

## Technology stack

| Component | Implementation |
| --- | --- |
| Framework | NestJS 10 |
| Language | TypeScript |
| ORM / DB | Prisma 5, PostgreSQL 16 |
| Cache / queues | Redis 7, BullMQ |
| Auth | JWT (Passport), refresh tokens, API client tokens |
| Object storage | Local disk or S3-compatible (MinIO) when `STORAGE_DRIVER=s3` |
| API docs | Swagger UI + OpenAPI JSON export |
| Tests | Jest (unit, integration, contract, e2e, golden) |

## Prerequisites

- Node.js 20+ recommended
- npm
- Docker Desktop (or compatible) for local Postgres, Redis, and MinIO
- Optional: mail provider keys (SendGrid or Resend) for invites / password reset / verification

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npx prisma generate
npm run prisma:migrate
npm run start:dev
```

Optional seed (when you need baseline data):

```bash
npm run prisma:seed
```

- API: http://localhost:3011
- Health: http://localhost:3011/health
- Swagger: http://localhost:3011/api/docs
- API prefix: `/api/v1` (health is excluded from the prefix)

Compose host ports (local):

| Service | Host port |
| --- | --- |
| Postgres | **5433** → 5432 |
| Redis | **6381** → 6379 |
| MinIO API | **9020** → 9000 |
| MinIO console | **9021** → 9001 |

Do not point local migrate/seed commands at production databases.

## Environment configuration

Copy [`.env.example`](.env.example) to `.env`. That file is the full variable list; categories below are a guide only. Use placeholders for secrets — never commit real credentials or PHI.

| Category | Examples | Notes |
| --- | --- | --- |
| App / CORS | `PORT`, `CORS_ORIGINS`, `FRONTEND_URL`, `LOG_LEVEL` | Include both `localhost` and `127.0.0.1` UI origins when needed |
| Database | `DATABASE_URL`, `DATABASE_SSL` | Local Compose uses port **5433** |
| Redis / cache | `REDIS_URL`, `REDIS_LOOKUP_DB`, `LOOKUP_CACHE_*` | DB 0 = queues/locks; DB 1 = lookup cache |
| Queues | `USE_QUEUE`, `QUEUE_MODE`, `BULLMQ_CONCURRENCY`, `PARALLEL_VALIDATE` | Default `USE_QUEUE=false` (inline validation) |
| Auth | `JWT_*`, `API_TOKEN_EXPIRATION_MINUTES` | Change secrets before any shared/staging use |
| Storage / EDI | `STORAGE_DRIVER`, `S3_*`, `EDI_*`, `EDI837_*` | Presigned browser uploads require `STORAGE_DRIVER=s3` |
| Mail | `SENDGRID_*` / `RESEND_*`, `MAIL_FROM*` | Optional for local auth flows that send email |
| Support | `SUPPORT_INBOX`, `INQUIRY_ATTACHMENT_MAX_BYTES` | See frontend `docs/support-inquiries.md` |

## EDI object storage (MinIO)

Presigned browser uploads (TeleWound-aligned) require `STORAGE_DRIVER=s3`.

| Env | API host port | Console | Example endpoints |
| --- | --- | --- | --- |
| Local (`docker-compose.yml` active) | **9020** → container 9000 | **9021** | `S3_ENDPOINT` / `S3_PUBLIC_ENDPOINT=http://localhost:9020` |
| Production (commented compose ports) | **9000** | **9001** | host `:9000` or HTTPS public URL |

1. `docker compose up -d minio`
2. Set `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, keys in `.env` (see `.env.example`).
3. Ensure `MINIO_API_CORS_ALLOW_ORIGIN` includes the frontend origin (`http://localhost:3010`).
4. On API boot with `STORAGE_DRIVER=s3`, Nest **auto-creates** the configured bucket if missing (no manual `mc mb` required).

Platform staff (`admin` / `super_admin` / staff `user`) upload under object keys `edi/0/{userId}/…` with `BatchFile.tenantId = null`. Tenant customers use `edi/{tenantId}/{userId}/…`.

**Web upload flow**

1. `POST /api/v1/batches/upload-url` — Nest mints `edi/{tenantId}/{userId}/{timestamp}-{hex}.edi` + short-lived PUT URL
2. Browser `PUT` file to MinIO
3. `POST /api/v1/batches/complete` — HeadObject verify → structural validate/parse → `BatchFile` metadata in Postgres (bytes stay in MinIO)

`POST /api/v1/batches` (multipart) remains for API clients and uses the same key convention. Viewer stays Nest-proxied: `GET /api/v1/batches/:id/edi/viewer`. Optional: `GET /api/v1/batches/:id/edi/download-url`.

Integer IDs only (no UUIDs). Failed completes delete the MinIO object; no pending `BatchFile` row is created before validation succeeds.

## EDI processing overview

1. File enters via presigned upload + `complete`, or multipart `POST /batches`.
2. Structural validation / parse run against the EDI 837P models under `edi/837p/`.
3. Batch, claim, diagnosis, and service-line records persist in Postgres.
4. Business / claim validation runs inline by default (`USE_QUEUE=false`). When `USE_QUEUE=true` and `PARALLEL_VALIDATE=true`, validation can fan out through BullMQ.
5. Status and validation findings are exposed through batch/claim APIs for the UI.

Do not commit real EDI samples containing PHI. Use synthetic test files only.

## Background jobs, worker, and scheduler

| Process | Dev command | Role |
| --- | --- | --- |
| API | `npm run start:dev` | HTTP API |
| Worker | `npm run start:worker:dev` | BullMQ consumer (`QueueWorkerHost`) |
| Scheduler | `npm run start:scheduler:dev` | Stalled-queue detection; optional NPI daily sync when `NPI_SYNC_SCHEDULE_ENABLED=true` |

- Queue driver: BullMQ on Redis (`REDIS_URL`, logical DB 0).
- Local default keeps validation on the API process (`USE_QUEUE=false`). Enable the queue and run the worker when testing async validation.
- Compose `api` / `worker` / `scheduler` services are commented out until containerized entrypoints are used; host processes + Compose infra is the supported local path.

## Lookup Redis cache (DB 1)

- **DB 0** (`REDIS_URL`): BullMQ queues + scheduler locks — do not flush for cache work.
- **DB 1** (`REDIS_LOOKUP_DB=1`): Nest lookup/reference cache (`lookup:v1:…`, auto-chunked).
- Toggle: `LOOKUP_CACHE_ENABLED=true|false` (false → Postgres only; app stays up if Redis is down).
- TTL: `LOOKUP_CACHE_TTL` (default 1 year). Chunk size: `LOOKUP_CACHE_CHUNK_BYTES` (default 1MB).
- API responses that touch lookup cache may include header `Cache: HIT|MISS|BYPASS|ERROR`.

```bash
npm run build
npm run cli -- redis:lookup-status
npm run cli -- redis:seed-lookups cpt_codes --warm
npm run cli -- redis:seed-lookups --warm-all
npm run cli -- redis:lookup-flush cpt_codes zip_codes
npm run cli -- redis:lookup-flush --all --force
npm run cli -- ncci:rules-cache-fetch --warm
# Dummy 1–2 rows per table → Redis assert → flush Redis + DB
npm run verify:lookup-cache
# Load real Postgres library tables into Redis DB 1
npm run warm:lookup-cache
```

## Architecture

```text
scrubber-backend/
├── src/
│   ├── main.ts              # API bootstrap (Swagger, CORS, helmet)
│   ├── worker.ts            # BullMQ worker process
│   ├── scheduler.ts         # Scheduler process
│   ├── cli.ts               # Nest Commander CLI
│   ├── config/              # Env schema and configuration
│   ├── common/              # Filters, middleware
│   └── modules/             # Feature modules (auth, batches, claims, …)
├── prisma/                  # schema.prisma + migrations
├── docs/openapi/            # Exported openapi.json
├── docker-compose.yml       # Postgres, Redis, MinIO
├── .env.example
└── README.md
```

Major modules include: `auth`, `batches`, `claims`, `claim-validation`, `edi-parser`, `edi-structural-validation`, `queue`, `cache`, `references`, `reference-admin`, `tenants`, `users-admin`, `audit`, `support`, `mail`, `integrations`, and others under `src/modules/`.

Request path (simplified): HTTP → Nest guards/pipes → module services → Prisma / Redis / S3 → Problem Details or batch-specific error envelopes (see frontend [docs/error-handling.md](../scrubber-frontend/docs/error-handling.md)).

## API documentation

- Swagger UI: http://localhost:3011/api/docs (Bearer auth)
- Global prefix: `/api/v1`
- Export checked-in OpenAPI: `npm run openapi:export` → `docs/openapi/openapi.json`
- Frontend regenerates types from that file with `npm run openapi:types` (run inside `scrubber-frontend`)

Route definitions and DTOs in Nest are the source of truth. Do not invent endpoints in this README.

## Database

- Engine: PostgreSQL 16 (Compose image `postgres:16-alpine`)
- Client: Prisma (`prisma/schema.prisma`)
- Local workflow: `npx prisma generate` → `npm run prisma:migrate` → optional `npm run prisma:seed`
- Production migrate script: `npm run prisma:migrate:prod` (`prisma migrate deploy`) — use only against intended environments

Major entities include batches/files, claims, diagnoses, service lines, users, tenants, references, audit events, and support inquiries. See the Prisma schema for relationships.

## Authentication and security (summary)

- JWT access + refresh for interactive users; API client tokens for machine access
- Role / permission checks and tenant isolation enforced in Nest modules
- Helmet, CORS allow-list, validation pipes (`whitelist` / `forbidNonWhitelisted`)
- Rate limiting via `@nestjs/throttler`
- Secrets and PHI must not be logged or committed

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | API watch mode |
| `npm run start:worker:dev` | Worker watch mode |
| `npm run start:scheduler:dev` | Scheduler watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run compiled API |
| `npm run cli -- …` | CLI after `npm run build` |
| `npm run prisma:generate` | Generate Prisma client |
| `npm run prisma:migrate` | Dev migrations |
| `npm run prisma:migrate:prod` | Deploy migrations |
| `npm run prisma:seed` | Seed data |
| `npm run openapi:export` | Write `docs/openapi/openapi.json` |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests |
| `npm run test:cov` | Unit tests with coverage |
| `npm run test:integration` | Integration tests |
| `npm run test:contract` | Contract tests |
| `npm run test:e2e` | E2E tests |
| `npm run test:golden` | Golden tests |
| `npm run verify:lookup-cache` | Lookup cache verification helper |
| `npm run warm:lookup-cache` | Warm lookup cache from Postgres |

## Testing

Many suites expect local Postgres/Redis (and sometimes Testcontainers). Prefer a dedicated test database — never production.

```bash
npm test
npm run test:integration
npm run test:e2e
```

Exact service prerequisites depend on the suite; if a suite fails for missing infrastructure, start Compose services or note the limitation rather than weakening security settings.

## Troubleshooting

| Symptom | Likely cause | What to check |
| --- | --- | --- |
| DB connection errors | Compose not up / wrong port | `docker compose ps`; `DATABASE_URL` host port **5433** |
| Redis / queue errors | Redis down or wrong URL | `REDIS_URL` port **6381**; do not flush DB 0 for cache experiments |
| Presigned upload fails | MinIO CORS / endpoints | `STORAGE_DRIVER=s3`, `S3_PUBLIC_ENDPOINT`, `MINIO_API_CORS_ALLOW_ORIGIN` |
| CORS from UI | Origin not allow-listed | `CORS_ORIGINS` includes UI origin(s) |
| Validation never async | Queue disabled | `USE_QUEUE` and running worker process |
| Mail not sent | Provider unset | SendGrid or Resend keys in `.env` (see comments in `.env.example`) |

Never make application logs publicly accessible or log credentials, patient data, or full sensitive claim payloads.

## Production deployment

Compose includes commented `api` / `worker` / `scheduler` services for future containerized deploys. Production hosting paths, secrets management, and rollback procedures are **not fully specified in this repository** — document only what your team’s deployment process verifies. At minimum, production needs:

- Configured `.env` (strong JWT secrets, real DB/Redis/S3)
- `npm run build` and `prisma:migrate:prod` against the intended database
- API process; worker/scheduler when queues or scheduled jobs are enabled
- Health check at `/health`

## Architecture notes

- Frontend never connects to Postgres/Redis — only this API does.
- Separate `worker` / `scheduler` entrypoints for BullMQ and scheduled tasks.
- Stack baseline aligned with TeleWound + scrubber migration plan.
