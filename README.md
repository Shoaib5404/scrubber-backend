# Scrubber Backend

NestJS API for Neo Scrubber (EDI 837 claim scrubbing). Sibling of `scrubber-frontend` under `C:\sites\Scrubber`.

## Quick start

```bash
cp .env.example .env
docker compose up -d postgres redis minio
npm install
npx prisma generate
npm run start:dev
```

- API: http://localhost:3011
- Health: http://localhost:3011/health
- Swagger: http://localhost:3011/api/docs

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

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run start:dev` | API watch mode |
| `npm run start:worker:dev` | Worker stub |
| `npm run start:scheduler:dev` | Scheduler stub |
| `npm test` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npm run typecheck` | `tsc --noEmit` |

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

## Architecture notes

- Frontend never connects to Postgres/Redis — only this API does.
- Separate `worker` / `scheduler` entrypoints (stubs until Phase 6).
- Stack baseline aligned with TeleWound + scrubber migration plan.
